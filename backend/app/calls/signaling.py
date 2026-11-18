"""WebRTC signalling and the server-side "reminder voice" peer.

Flow (non-trickle ICE, one round trip):
  1. The patient answers in the app: POST /calls/{id}/accept returns a ticket and ICE servers.
  2. The app opens  WS /api/v1/calls/{id}/ws?ticket=...  and sends
         {"type": "offer", "sdp": "<SDP with all ICE candidates already gathered>"}
  3. The server answers  {"type": "answer", "sdp": "..."}  and, once media flows, the reminder
     is spoken on the audio track. Either side can send {"type": "bye"}.

aiortc is imported lazily so the rest of the API runs (and is tested) without it installed.
The server only ever sends audio; the phone's microphone is not used.
"""

import asyncio
import contextlib
import logging
import os
import uuid
from datetime import UTC, datetime

from fastapi import WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool

from app.calls import service as svc
from app.calls.models import ReminderCall
from app.calls.tts import TtsUnavailable, synthesize
from app.core.config import Settings
from app.core.errors import AppError

log = logging.getLogger("app.calls.signaling")

WS_BAD_TICKET = 4401
WS_NOT_ANSWERED = 4409


def _prepare(sessionmaker, settings: Settings, ticket: str, call_id: uuid.UUID) -> str | None:
    """Validate the ticket against the database; return the text to speak, or None if refused."""
    try:
        t_call, t_user = svc.read_ticket(settings, ticket)
    except AppError:
        return None
    if t_call != call_id:
        return None
    with sessionmaker() as db:
        call = db.get(ReminderCall, call_id)
        if call is None or call.patient_user_id != t_user or call.status != "answered":
            return None
        return svc.dose_summary(db, call)["spoken_text"]


def _record_media(sessionmaker, call_id: uuid.UUID) -> None:
    with sessionmaker() as db:
        call = db.get(ReminderCall, call_id)
        if call is not None:
            svc.mark_media_connected(call, datetime.now(UTC))
            db.commit()


async def handle_call_socket(ws: WebSocket, call_id: uuid.UUID, ticket: str) -> None:
    settings: Settings = ws.app.state.settings
    sessionmaker = ws.app.state.sessionmaker
    text = await run_in_threadpool(_prepare, sessionmaker, settings, ticket, call_id)
    if text is None:
        await ws.close(code=WS_BAD_TICKET)
        return
    await ws.accept()

    try:
        from aiortc import RTCPeerConnection, RTCSessionDescription
        from aiortc.contrib.media import MediaPlayer
    except ImportError:
        await ws.send_json({"type": "error", "code": "WEBRTC_UNAVAILABLE"})
        await ws.close()
        return

    pc = RTCPeerConnection()
    wav_path: str | None = None
    done = asyncio.Event()

    @pc.on("connectionstatechange")
    async def _on_state() -> None:
        if pc.connectionState == "connected":
            await run_in_threadpool(_record_media, sessionmaker, call_id)
        elif pc.connectionState in {"failed", "closed"}:
            done.set()

    try:
        msg = await asyncio.wait_for(ws.receive_json(), timeout=settings.call_ticket_ttl_seconds)
        if msg.get("type") != "offer" or not isinstance(msg.get("sdp"), str):
            await ws.send_json({"type": "error", "code": "BAD_OFFER"})
            return
        await pc.setRemoteDescription(RTCSessionDescription(sdp=msg["sdp"], type="offer"))

        try:
            wav_path = await synthesize(text, settings)
            player = MediaPlayer(wav_path)
            if player.audio is not None:
                pc.addTrack(player.audio)
        except TtsUnavailable:
            # No server voice: the app falls back to reading `spoken_text` with the phone's own
            # voice. The call itself still connects.
            await ws.send_json({"type": "info", "code": "TTS_UNAVAILABLE"})

        await pc.setLocalDescription(await pc.createAnswer())
        await ws.send_json({"type": "answer", "sdp": pc.localDescription.sdp})

        async def _listen() -> None:
            while True:
                try:
                    incoming = await ws.receive_json()
                except WebSocketDisconnect:
                    break
                if incoming.get("type") == "bye":
                    break
            done.set()

        listener = asyncio.create_task(_listen())
        try:
            await asyncio.wait_for(done.wait(), timeout=settings.call_session_max_seconds)
        except TimeoutError:
            pass
        finally:
            listener.cancel()
    except (TimeoutError, WebSocketDisconnect, ValueError):
        pass
    finally:
        with contextlib.suppress(Exception):
            await pc.close()
        if wav_path:
            with contextlib.suppress(OSError):
                os.unlink(wav_path)
        with contextlib.suppress(Exception):
            await ws.close()
