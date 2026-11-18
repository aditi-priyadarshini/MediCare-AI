"use client";

import { Camera, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button } from "@/components/ui/primitives";
import { cameraErrorMessage, photoFileName } from "@/lib/scan";

const MAX_SIDE = 3000; // enough for small print; larger only makes the upload and the reading slower

/**
 * A live camera view that takes one photo. The video never leaves the browser: only the single
 * photo the person chooses to use is handed to `onPhoto`. The camera is switched off when the photo
 * is taken, when this closes, and when the page is left.
 */
export function CameraCapture({ onPhoto, onCancel }: { onPhoto: (file: File) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<"starting" | "live" | "error">("starting");
  const [message, setMessage] = useState("");
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  const start = useCallback(async () => {
    setState("starting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1920 } } });
      stream.current = s;
      if (video.current) {
        video.current.srcObject = s;
        await video.current.play().catch(() => undefined); // autoplay can refuse; the controls-less video still shows frames
      }
      setState("live");
    } catch (err) {
      stop();
      setMessage(cameraErrorMessage(err));
      setState("error");
    }
  }, [stop]);

  useEffect(() => {
    void start();
    return stop; // leaving the page or closing the panel always releases the camera
  }, [start, stop]);

  useEffect(() => () => {
    if (shot) URL.revokeObjectURL(shot.url);
  }, [shot]);

  function capture() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const scale = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setMessage("The photo couldn’t be taken. Try again, or upload a photo instead.");
          setState("error");
          return;
        }
        stop();
        const file = new File([blob], photoFileName(), { type: "image/jpeg" });
        setShot({ file, url: URL.createObjectURL(file) });
      },
      "image/jpeg",
      0.92,
    );
  }

  function retake() {
    setShot(null);
    void start();
  }

  if (state === "error") {
    return (
      <div className="space-y-3">
        <Alert tone="warning">{message}</Alert>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void start()}>
            Try again
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Close camera
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-line bg-navy-900">
        {shot ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local blob preview, nothing to optimise
          <img src={shot.url} alt="The photo you just took" className="mx-auto max-h-[60vh] w-full object-contain" />
        ) : (
          <video ref={video} muted playsInline aria-label="Camera view. Fit the whole page in the frame." className="mx-auto max-h-[60vh] w-full object-contain" />
        )}
      </div>
      {!shot && <p role="status" className="text-sm text-ink-soft">{state === "starting" ? "Starting the camera…" : "Fit the whole page in view, in good light, then take the photo."}</p>}
      <div className="flex flex-wrap gap-2">
        {shot ? (
          <>
            <Button onClick={() => onPhoto(shot.file)}>Use this photo</Button>
            <Button variant="secondary" onClick={retake}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Retake
            </Button>
          </>
        ) : (
          <Button onClick={capture} disabled={state !== "live"}>
            <Camera className="h-4 w-4" aria-hidden /> Take photo
          </Button>
        )}
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
