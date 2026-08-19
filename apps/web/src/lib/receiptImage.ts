/**
 * Shrinks a photo so the good OCR engine can actually read it.
 *
 * OCR.space's free tier rejects anything over 1 MB, and a phone camera
 * routinely produces 3–8 MB. Every one of those used to fall through to the
 * local Tesseract path, which reads receipts noticeably worse — so the common
 * case was being served by the weaker engine.
 *
 * Downscaling here rather than on the server also means less to upload, which
 * is the slowest part of a scan on mobile data.
 */

const TARGET_BYTES = 950 * 1024;
/** Receipt text stops being legible below roughly this width. */
const MIN_WIDTH = 1000;
const MAX_WIDTH = 2200;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That image could not be opened."));
    };
    image.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function prepareReceiptImage(file: File): Promise<File> {
  if (file.size <= TARGET_BYTES) return file;

  let image: HTMLImageElement;
  try {
    image = await loadImage(file);
  } catch {
    // A format the browser cannot decode (HEIC on some devices) still gets a
    // chance on the server rather than being rejected here.
    return file;
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return file;

  let width = Math.min(MAX_WIDTH, image.naturalWidth || image.width);

  // Step the resolution and then the quality down until it fits, keeping
  // resolution as long as possible because that is what OCR depends on.
  for (const quality of [0.9, 0.8, 0.7, 0.6]) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const scale = width / (image.naturalWidth || image.width);
      canvas.width = Math.round(width);
      canvas.height = Math.round((image.naturalHeight || image.height) * scale);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const blob = await toBlob(canvas, quality);
      if (blob && blob.size <= TARGET_BYTES) {
        return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
          type: "image/jpeg",
          lastModified: file.lastModified,
        });
      }

      if (width <= MIN_WIDTH) break;
      width = Math.max(MIN_WIDTH, width * 0.8);
    }
    width = Math.min(MAX_WIDTH, image.naturalWidth || image.width);
  }

  // Could not get under the limit without destroying legibility; send the
  // original and let the server decide.
  return file;
}
