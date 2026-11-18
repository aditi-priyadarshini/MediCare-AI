"""Server-side text-to-speech, run locally and without a shell (same stance as scan-to-fill:
no third party sees the reminder text). Optional: when TTS_COMMAND is unset the server sends no
audio and the app reads the text aloud with the phone's own voice instead."""

import asyncio
import os
import shlex
import tempfile

from app.core.config import Settings


class TtsUnavailable(Exception):
    pass


async def synthesize(text: str, settings: Settings) -> str:
    """Returns the path of a WAV file; the caller deletes it."""
    if not settings.tts_command:
        raise TtsUnavailable("TTS_COMMAND is not set")
    fd, out = tempfile.mkstemp(suffix=".wav", prefix="mc-call-")
    os.close(fd)
    argv = [part.replace("{out}", out) for part in shlex.split(settings.tts_command)]
    try:
        proc = await asyncio.create_subprocess_exec(  # noqa: S603 - argv list, no shell
            *argv,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(
            proc.communicate(text.encode("utf-8")), timeout=settings.tts_timeout_seconds
        )
        if proc.returncode != 0 or os.path.getsize(out) < 100:
            raise TtsUnavailable("the TTS command produced no audio")
    except (TimeoutError, OSError, TtsUnavailable) as exc:
        os.unlink(out)
        raise TtsUnavailable(type(exc).__name__) from exc
    return out
