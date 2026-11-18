/**
 * One WebRTC audio call with the server's reminder voice.
 *
 * Non-trickle ICE: wait until gathering finishes, send ONE offer over the signalling socket,
 * receive ONE answer. The phone only receives audio (no microphone permission needed). If the
 * server has no voice, or media doesn't connect in time, the caller falls back to reading
 * `spoken_text` with the phone's own voice, so the patient always hears the reminder.
 */
import { RTCPeerConnection, RTCSessionDescription } from "react-native-webrtc";
import { API_BASE_URL, ICE_GATHER_MS, MEDIA_WAIT_MS } from "./config";
import type { Accept } from "./api";

export interface SessionHandlers {
  onConnected: () => void;
  onFallbackNeeded: (why: string) => void;
  onClosed: () => void;
}

export interface Session {
  hangUp: () => void;
}

function waitForIce(pc: RTCPeerConnection, ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    }
    function check() {
      if (pc.iceGatheringState === "complete") done();
    }
    pc.addEventListener("icegatheringstatechange", check);
  });
}

export async function startSession(accept: Accept, h: SessionHandlers): Promise<Session> {
  const pc = new RTCPeerConnection({ iceServers: accept.ice_servers });
  const wsUrl =
    API_BASE_URL.replace(/^http/, "ws") + accept.ws_path + `?ticket=${encodeURIComponent(accept.ticket)}`;
  const ws = new WebSocket(wsUrl);
  let closed = false;
  let connected = false;

  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(mediaTimer);
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "bye" }));
      ws.close();
    } catch {}
    pc.close();
    h.onClosed();
  };

  const mediaTimer = setTimeout(() => {
    if (!connected) h.onFallbackNeeded("media_timeout");
  }, MEDIA_WAIT_MS + ICE_GATHER_MS);

  pc.addEventListener("connectionstatechange", () => {
    if (pc.connectionState === "connected") {
      connected = true;
      clearTimeout(mediaTimer);
      h.onConnected();
    } else if (pc.connectionState === "failed" && !connected) {
      h.onFallbackNeeded("ice_failed");
    }
  });

  ws.onmessage = async (ev) => {
    try {
      const msg = JSON.parse(String(ev.data));
      if (msg.type === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: msg.sdp }));
      } else if (msg.type === "info" && msg.code === "TTS_UNAVAILABLE") {
        h.onFallbackNeeded("server_has_no_voice");
      } else if (msg.type === "error") {
        h.onFallbackNeeded(String(msg.code ?? "server_error"));
      }
    } catch {
      h.onFallbackNeeded("bad_message");
    }
  };
  ws.onerror = () => h.onFallbackNeeded("signalling_error");
  ws.onclose = () => {
    if (!closed) h.onFallbackNeeded("signalling_closed");
  };

  ws.onopen = async () => {
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
      await pc.setLocalDescription(offer);
      await waitForIce(pc, ICE_GATHER_MS);
      ws.send(JSON.stringify({ type: "offer", sdp: pc.localDescription?.sdp }));
    } catch {
      h.onFallbackNeeded("offer_failed");
    }
  };

  return { hangUp: close };
}
