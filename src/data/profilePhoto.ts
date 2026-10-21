/** Normalize to a small square JPEG; canvas re-encoding omits original EXIF metadata. */
export async function prepareProfilePhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Choose a JPG, PNG or WebP photo.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Choose a photo smaller than 5 MB.');
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file);
  } catch {
    throw new Error('This photo could not be read. Choose another image.');
  }
  try {
    if (!image.width || !image.height || image.width * image.height > 40_000_000)
      throw new Error('Choose a photo no larger than 40 megapixels.');
    const side = Math.min(image.width, image.height);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.min(512, side);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser cannot prepare this photo.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      image,
      (image.width - side) / 2,
      (image.height - side) / 2,
      side,
      side,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const encoded = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
    if (!encoded || encoded.length > 349528) throw new Error('Choose a simpler or smaller photo.');
    return encoded;
  } finally {
    image.close();
  }
}
