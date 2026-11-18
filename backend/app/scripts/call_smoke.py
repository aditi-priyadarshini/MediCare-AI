"""A simulated phone for the reminder-call server (development only).

    python -m app.scripts.call_smoke --server http://localhost:8000 --email you@example.com

It signs in, asks the server for a test call, answers it, opens the signalling WebSocket and
sets up a real WebRTC audio session with aiortc, exactly as the Android app does. It then
checks that audio actually arrives. Run it BEFORE trying the Android app: if it passes, the
server side (signalling, STUN, text-to-speech, aiortc) works and any remaining problem is on
the phone or network side.

Needs ENVIRONMENT=development and CALLS_ENABLED=true on the server. The password is read from
the CALL_SMOKE_PASSWORD environment variable (or prompted), never from the command line.
"""

import argparse
import asyncio
import getpass
import json
import os
import sys

import httpx


async def run(server: str, email: str, password: str, frames_needed: int, timeout: float) -> int:
    from aiortc import RTCConfiguration, RTCIceServer, RTCPeerConnection, RTCSessionDescription
    from websockets.asyncio.client import connect

    api = f"{server.rstrip('/')}/api/v1"
    with httpx.Client(timeout=15) as http:
        r = http.post(f"{api}/auth/login", json={"email": email, "password": password})
        if r.status_code != 200:
            print(f"FAIL sign-in: HTTP {r.status_code} {r.text[:160]}")
            return 1
        csrf = r.json()["csrf_token"]
        h = {"X-CSRF-Token": csrf}
        print("ok   signed in")

        r = http.post(f"{api}/calls/dev/test", json={"mode": "direct"}, headers=h)
        if r.status_code != 201:
            print(f"FAIL test call: HTTP {r.status_code} {r.text[:200]}")
            print("     (needs ENVIRONMENT=development and CALLS_ENABLED=true on the server)")
            return 1
        call_id = r.json()["id"]
        print(f"ok   server is ringing call {call_id[:8]}…")

        r = http.post(f"{api}/calls/{call_id}/accept", json={}, headers=h)
        if r.status_code != 200:
            print(f"FAIL accept: HTTP {r.status_code} {r.text[:200]}")
            return 1
        acc = r.json()
        print(
            f"ok   answered; dose = {acc['dose']['medication_name']!r}; "
            f"{len(acc['ice_servers'])} ICE server(s)"
        )

        ice = [
            RTCIceServer(urls=s["urls"], username=s.get("username"), credential=s.get("credential"))
            for s in acc["ice_servers"]
        ]
        pc = RTCPeerConnection(RTCConfiguration(iceServers=ice))
        pc.addTransceiver("audio", direction="recvonly")
        got = {"frames": 0, "tts_missing": False}
        done = asyncio.Event()

        @pc.on("track")
        async def on_track(track):
            while got["frames"] < frames_needed:
                try:
                    await track.recv()
                except Exception:
                    return
                got["frames"] += 1
            done.set()

        await pc.setLocalDescription(await pc.createOffer())  # aiortc finishes ICE gathering here
        ws_base = server.rstrip("/").replace("http", "ws", 1)
        ws_url = ws_base + acc["ws_path"] + f"?ticket={acc['ticket']}"
        try:
            async with connect(ws_url) as ws:
                await ws.send(json.dumps({"type": "offer", "sdp": pc.localDescription.sdp}))
                answered = False
                end = asyncio.get_event_loop().time() + timeout
                while asyncio.get_event_loop().time() < end and not done.is_set():
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=0.5)
                    except TimeoutError:
                        continue
                    except Exception:
                        break
                    msg = json.loads(raw)
                    if msg["type"] == "answer" and not answered:
                        answered = True
                        await pc.setRemoteDescription(
                            RTCSessionDescription(sdp=msg["sdp"], type="answer")
                        )
                        print("ok   WebRTC answer received")
                    elif msg["type"] == "info" and msg.get("code") == "TTS_UNAVAILABLE":
                        got["tts_missing"] = True
                        print(
                            "note server has no voice (TTS_COMMAND unset or failed): the phone "
                            "would read the reminder itself"
                        )
                        break
                    elif msg["type"] == "error":
                        print(f"FAIL server error: {msg.get('code')}")
                        break
                if not answered and not got["tts_missing"]:
                    print("FAIL no answer from the signalling server")
                    return 1
                if not got["tts_missing"]:
                    try:
                        left = max(1, end - asyncio.get_event_loop().time())
                        await asyncio.wait_for(done.wait(), timeout=left)
                    except TimeoutError:
                        pass
                await ws.send(json.dumps({"type": "bye"}))
        finally:
            state = pc.connectionState
            await pc.close()
            http.post(f"{api}/calls/{call_id}/end", json={}, headers=h)

        print(f"     connection state: {state}; audio frames received: {got['frames']}")
        if got["tts_missing"]:
            print(
                "PARTIAL signalling works, but no server voice. "
                "Set TTS_COMMAND (see ANDROID_SETUP_AND_TEST.md)."
            )
            return 2
        if got["frames"] >= frames_needed:
            print("PASS server-side reminder call works: audio reached the simulated phone.")
            return 0
        print(
            "FAIL signalling worked but no audio arrived (ICE/network). Try TURN, or run the API "
            "outside Docker so its address is reachable."
        )
        return 1


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--server", default="http://localhost:8000")
    ap.add_argument("--email", required=True)
    ap.add_argument("--frames", type=int, default=25, help="audio frames to wait for (20 ms each)")
    ap.add_argument("--timeout", type=float, default=25)
    a = ap.parse_args()
    password = os.environ.get("CALL_SMOKE_PASSWORD") or getpass.getpass("Password: ")
    return asyncio.run(run(a.server, a.email, password, a.frames, a.timeout))


if __name__ == "__main__":
    sys.exit(main())
