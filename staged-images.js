// Images being tried in the editor stay in browser memory until publication.
export class StagedImages {
  constructor(urls = URL) { this.urls = urls; this.items = new Map(); }
  set(field, blob) {
    this.remove(field);
    const value = { blob, previewUrl: this.urls.createObjectURL(blob) };
    this.items.set(field, value);
    return value;
  }
  get(field) { return this.items.get(field); }
  remove(field) {
    const value = this.items.get(field);
    if (value) this.urls.revokeObjectURL(value.previewUrl);
    this.items.delete(field);
  }
  clear() { for (const field of this.items.keys()) this.remove(field); }
}

export async function prepareImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw Error('Choose a JPG, PNG or WebP image smaller than 5 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 50000000) throw Error('Please resize the image to under 50 megapixels.');
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .88));
    if (!blob || blob.type !== 'image/webp' || blob.size > 5 * 1024 * 1024) throw Error('Could not prepare the image. Please try another image.');
    return blob;
  } finally { bitmap.close(); }
}
