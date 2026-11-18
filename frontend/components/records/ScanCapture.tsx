"use client";

import { Camera, ScanLine, Upload } from "lucide-react";
import { useId, useRef, useState } from "react";
import { CameraCapture } from "@/components/records/CameraCapture";
import { Alert, Button } from "@/components/ui/primitives";
import { errorMessage } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks";
import { checkUpload } from "@/lib/records";
import { cameraSupported, prefersSystemCamera, SCAN_PRIVACY, scanFile, scanStatus, type ScanResult } from "@/lib/scan";

/**
 * "Scan to fill": take a photo, or choose a photo or PDF, and get a draft back for the form.
 * It renders nothing when this server cannot read documents, so a button never leads nowhere.
 * The file is handed back with the draft so the form can attach the same file when the patient saves.
 */
export function ScanCapture({
  onScanned,
  title = "Scan to fill",
  description = "Take a photo of a report or choose a file, and the form is filled in for you to check.",
  disabled,
}: {
  onScanned: (file: File, result: ScanResult) => void;
  title?: string;
  description?: string;
  disabled?: boolean;
}) {
  const status = useAsync(scanStatus, []);
  const pickId = useId();
  const nativeCamera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false);
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Not loaded yet, or the server cannot scan (or the status call failed): offer nothing.
  if (!status.data?.available) return null;
  const photos = status.data.photos;

  async function read(file: File) {
    const bad = checkUpload(file);
    if (bad) {
      setProblem(bad);
      return;
    }
    if (!photos && file.type !== "application/pdf") {
      setProblem("This server can read PDF files, but not photos. Upload a PDF, or type the details.");
      return;
    }
    setProblem(null);
    setCamera(false);
    setReading(true);
    try {
      onScanned(file, await scanFile(file));
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setReading(false);
      if (picker.current) picker.current.value = ""; // so choosing the same file again still fires
      if (nativeCamera.current) nativeCamera.current.value = "";
    }
  }

  function takePhoto() {
    if (prefersSystemCamera() || !cameraSupported()) nativeCamera.current?.click();
    else setCamera(true);
  }

  const busy = disabled || reading;

  return (
    <section aria-labelledby={`${pickId}-t`} className="rounded-lg border border-line bg-mint-100/60 p-4">
      <h3 id={`${pickId}-t`} className="flex items-center gap-2 text-sm font-semibold text-navy-900">
        <ScanLine className="h-4 w-4" aria-hidden /> {title}
      </h3>
      <p className="mt-1 text-sm text-ink-soft">{description}</p>

      {camera ? (
        <div className="mt-3">
          <CameraCapture onPhoto={(f) => void read(f)} onCancel={() => setCamera(false)} />
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {photos && (
            <Button variant="secondary" onClick={takePhoto} disabled={busy}>
              <Camera className="h-4 w-4" aria-hidden /> Take a photo
            </Button>
          )}
          <Button variant="secondary" onClick={() => picker.current?.click()} disabled={busy}>
            <Upload className="h-4 w-4" aria-hidden /> {photos ? "Upload a photo or PDF" : "Upload a PDF"}
          </Button>
        </div>
      )}

      {/* The system camera on phones. `capture` opens the camera app; on a desktop it is a file picker. */}
      <input ref={nativeCamera} type="file" accept="image/*" capture="environment" hidden tabIndex={-1} aria-hidden onChange={(e) => e.target.files?.[0] && void read(e.target.files[0])} />
      <input ref={picker} type="file" accept={photos ? "application/pdf,image/png,image/jpeg" : "application/pdf"} hidden tabIndex={-1} aria-label="Choose a photo or PDF to scan" onChange={(e) => e.target.files?.[0] && void read(e.target.files[0])} />

      <p role="status" className="mt-2 text-sm text-ink">
        {reading ? "Reading your report… this can take a few seconds." : ""}
      </p>
      {problem && (
        <div className="mt-2">
          <Alert tone="warning">{problem}</Alert>
        </div>
      )}
      <p className="mt-2 text-xs text-ink-soft">{SCAN_PRIVACY}</p>
    </section>
  );
}
