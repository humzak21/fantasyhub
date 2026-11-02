/**
 * Getting a photo from a phone to a 256px square before it is uploaded.
 *
 * A phone's camera roll hands over a 4 MB file, and every team chip on the site
 * draws from the result. Resizing here is what keeps a fourteen-row table from
 * pulling 56 MB; the bucket's 1 MB limit is what actually holds.
 */

/** Stored size. The largest place it appears is the profile's 112px avatar at 2x. */
export const AVATAR_PX = 256;

/** Anything larger than this is not a photo worth decoding on a phone. */
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

/**
 * The centred square of a picture. A portrait photo keeps its middle rather
 * than being squashed.
 *
 * @returns {{ sx: number, sy: number, side: number }}
 */
export function centreSquare(width, height) {
  const side = Math.min(width, height);
  return { sx: (width - side) / 2, sy: (height - side) / 2, side };
}

/** The reason a chosen file cannot be used, or null. */
export function describeAvatarFile(file) {
  if (!file?.type?.startsWith('image/')) return 'Choose an image file.';
  if (file.size > MAX_SOURCE_BYTES) return 'That image is over 15 MB. Choose a smaller one.';
  return null;
}

const toBlob = (canvas, type, quality) =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * @param {File|Blob} file
 * @returns {Promise<Blob>} a square image. WebP where the browser can write it,
 *   JPEG where it cannot: Safari's `toBlob` quietly hands back a PNG for webp,
 *   which is why the result's own `type` is what gets checked.
 */
export async function resizeAvatar(file) {
  const bitmap = await createImageBitmap(file);
  const { sx, sy, side } = centreSquare(bitmap.width, bitmap.height);

  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_PX;
  canvas.height = AVATAR_PX;
  canvas.getContext('2d').drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
  bitmap.close?.();

  const webp = await toBlob(canvas, 'image/webp', 0.85);
  if (webp?.type === 'image/webp') return webp;

  const jpeg = await toBlob(canvas, 'image/jpeg', 0.85);
  if (!jpeg) throw new Error('This browser could not read that image.');
  return jpeg;
}
