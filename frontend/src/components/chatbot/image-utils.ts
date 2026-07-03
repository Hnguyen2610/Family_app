export const MAX_IMAGE_DATA_URL_CHARS = 2_400_000;
const MAX_IMAGE_DIMENSION = 1600;

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error('Unable to read image file'));
    reader.readAsDataURL(file);
  });

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load image'));
    image.src = src;
  });

export async function compressImageFile(file: File): Promise<string> {
  const originalDataUrl = await fileToDataUrl(file);
  const image = await loadImage(originalDataUrl);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return originalDataUrl;

  context.drawImage(image, 0, 0, width, height);
  const qualities = [0.82, 0.72, 0.62, 0.52];
  for (const quality of qualities) {
    const compressed = canvas.toDataURL('image/jpeg', quality);
    if (compressed.length <= MAX_IMAGE_DATA_URL_CHARS) return compressed;
  }

  return canvas.toDataURL('image/jpeg', 0.45);
}
