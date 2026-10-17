// Profile photos.
//
// Every uploaded photo is decoded and redrawn onto a canvas, then re-encoded
// as a small WebP (or JPEG where the browser can't write WebP). Only the
// pixels survive, so anything hidden in the original file (scripts in an SVG,
// payloads appended to a JPEG, EXIF data such as GPS location) is thrown away.
// The result must also pass `isSafePhotoDataUrl`, the same check
// firestore.rules applies on the server.

export const PHOTO_SIZE = 256;
export const MAX_PHOTO_CHARS = 100_000;
export const MAX_INPUT_BYTES = 20 * 1024 * 1024;
export const ACCEPTED_INPUT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

const PHOTO_RE = /^data:image\/(?:webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

export function isSafePhotoDataUrl(v: unknown): v is string {
  return typeof v === 'string' && v.length <= MAX_PHOTO_CHARS && PHOTO_RE.test(v);
}

export class PhotoError extends Error {}

/** Browser only: turn a picked file into a safe 256×256 data URL. */
export async function compressPhoto(file: File): Promise<string> {
  if (file.size > MAX_INPUT_BYTES) throw new PhotoError('That photo is too large (max 20 MB).');
  // Some phones report an empty type for HEIC; let the decoder decide then.
  if (file.type && !ACCEPTED_INPUT.split(',').includes(file.type)) {
    throw new PhotoError('Please pick a JPG, PNG, WebP or HEIC photo.');
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new PhotoError("This photo couldn't be opened. Try a JPG or PNG.");
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PhotoError("This browser can't process photos.");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  bitmap.close();

  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    let url = canvas.toDataURL('image/webp', q);
    // Browsers that can't encode WebP silently return PNG; use JPEG instead.
    if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', q);
    if (isSafePhotoDataUrl(url)) return url;
  }
  throw new PhotoError("Couldn't shrink this photo enough. Try another one.");
}
