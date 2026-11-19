"use client";

import { Camera, ImagePlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CameraCapture } from "@/components/records/CameraCapture";
import { Alert, Button } from "@/components/ui/primitives";
import { checkImage, IMAGE_TYPES, shrinkImage } from "@/lib/image";
import { cameraSupported, prefersSystemCamera } from "@/lib/scan";

interface Props {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  /** Short hint shown next to the buttons, e.g. "Photo of a medicine pack, strip or prescription". */
  hint?: string;
}

/**
 * "Take photo" and "Upload photo" buttons with a small preview. The picture is only kept in the
 * browser until the person sends it; it then goes to the AI model with their question.
 * On a phone "Take photo" opens the camera app; on a computer it opens a live camera view.
 */
export function ImagePicker({ file, onChange, disabled, hint }: Props) {
  const gallery = useRef<HTMLInputElement>(null);
  const nativeCamera = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function take(picked: File | undefined) {
    if (gallery.current) gallery.current.value = "";
    if (nativeCamera.current) nativeCamera.current.value = "";
    if (!picked) return;
    const bad = checkImage(picked);
    if (bad) {
      setProblem(bad);
      return;
    }
    setProblem(null);
    setCamera(false);
    onChange(await shrinkImage(picked));
  }

  function takePhoto() {
    if (prefersSystemCamera() || !cameraSupported()) nativeCamera.current?.click();
    else setCamera(true);
  }

  return (
    <div className="space-y-2">
      {camera ? (
        <CameraCapture onPhoto={(f) => void take(f)} onCancel={() => setCamera(false)} />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={takePhoto} disabled={disabled}>
            <Camera className="h-4 w-4" aria-hidden /> Take photo
          </Button>
          <Button variant="secondary" onClick={() => gallery.current?.click()} disabled={disabled}>
            <ImagePlus className="h-4 w-4" aria-hidden /> Upload photo
          </Button>
          {hint && !file && <span className="text-xs text-ink-soft">{hint}</span>}
        </div>
      )}

      {/* `capture` opens the camera app on a phone; on a computer it is just a file picker. */}
      <input
        ref={nativeCamera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void take(e.target.files?.[0])}
      />
      <input
        ref={gallery}
        type="file"
        accept={IMAGE_TYPES}
        hidden
        tabIndex={-1}
        aria-label="Choose a picture to send to the AI"
        onChange={(e) => void take(e.target.files?.[0])}
      />

      {file && preview && (
        <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="The picture that will be sent" className="h-16 w-16 rounded object-cover" />
          <p className="min-w-0 flex-1 truncate text-sm text-ink">Picture ready to send</p>
          <Button variant="ghost" onClick={() => onChange(null)} disabled={disabled} aria-label="Remove the picture">
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      )}
      {problem && <Alert tone="warning">{problem}</Alert>}
    </div>
  );
}
