/** Pictures sent to the AI model (assistant and safety checker). */

export const IMAGE_TYPES = "image/jpeg,image/png,image/webp";
const OK = new Set(["image/jpeg", "image/png", "image/webp"]);
/** The server accepts up to 5 MB; photos are shrunk well under that before sending. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_SIDE = 1600;

/** A plain-language reason the file cannot be used, or null if it can. */
export function checkImage(file: File): string | null {
  if (file.type && !OK.has(file.type) && file.type.startsWith("image/")) {
    return "Use a JPEG, PNG or WebP picture.";
  }
  if (!file.type.startsWith("image/")) return "Choose a picture (JPEG, PNG or WebP).";
  return null;
}

/**
 * Shrinks a large photo to at most 1600 px on its long side as a JPEG, so a 10 MB phone photo does
 * not hit the upload limit and goes faster. If anything fails the original is used unchanged.
 */
export async function shrinkImage(file: File): Promise<File> {
  try {
    if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 1.5 * 1024 * 1024) {
      bitmap.close?.();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
