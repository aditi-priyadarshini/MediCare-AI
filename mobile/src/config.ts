// Point this at your deployed backend (HTTPS in production; the server requires secure cookies).
// For a local dev build on an Android emulator the host machine is http://10.0.2.2:8000.
export const API_BASE_URL = "https://medicare.example.org";
export const API_PREFIX = "/api/v1";
export const APP_VERSION = "0.1.0";

// How long to wait for server audio before falling back to the phone's own voice.
export const MEDIA_WAIT_MS = 8000;
// How long to wait for ICE gathering before sending the offer anyway.
export const ICE_GATHER_MS = 4000;
