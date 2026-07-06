export const MAX_IMAGE_DATA_URL_CHARS = 2_400_000;

const DEFAULT_MAX_IMAGE_DIMENSION = 1600;
const DEFAULT_JPEG_QUALITY = 0.82;
const CHAT_IMAGE_QUALITIES = [0.82, 0.72, 0.62, 0.52];

type CompressImageOptions = {
  maxDimension?: number;
  quality?: number;
  outputType?: string;
};

export type CompressedImage = {
  dataUrl: string;
  blob: Blob;
};

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Unable to read image file'));
    reader.readAsDataURL(file);
  });
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load image'));
    image.src = src;
  });
}

export function dataUrlToBlob(dataUrl: string) {
  const [header, data] = dataUrl.split(',');
  const mime = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  outputType = 'image/jpeg',
  quality = DEFAULT_JPEG_QUALITY,
): Promise<Blob> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob || dataUrlToBlob(canvas.toDataURL(outputType, quality))),
      outputType,
      quality,
    );
  });
}

export async function compressImage(file: File, options: CompressImageOptions = {}): Promise<CompressedImage> {
  const {
    maxDimension = DEFAULT_MAX_IMAGE_DIMENSION,
    quality = DEFAULT_JPEG_QUALITY,
    outputType = 'image/jpeg',
  } = options;
  const dataUrl = await fileToDataUrl(file);
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return { dataUrl, blob: file };

  context.drawImage(image, 0, 0, width, height);
  const compressedDataUrl = canvas.toDataURL(outputType, quality);
  const blob = await canvasToBlob(canvas, outputType, quality);
  return { dataUrl: compressedDataUrl, blob };
}

export async function compressImageFile(file: File): Promise<string> {
  const originalDataUrl = await fileToDataUrl(file);
  const image = await loadImage(originalDataUrl);
  const scale = Math.min(1, DEFAULT_MAX_IMAGE_DIMENSION / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return originalDataUrl;

  context.drawImage(image, 0, 0, width, height);
  for (const quality of CHAT_IMAGE_QUALITIES) {
    const compressed = canvas.toDataURL('image/jpeg', quality);
    if (compressed.length <= MAX_IMAGE_DATA_URL_CHARS) return compressed;
  }

  return canvas.toDataURL('image/jpeg', 0.45);
}

export async function uploadToCloudinary(blob: Blob, fileName: string) {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary is not configured');
  }

  const formData = new FormData();
  formData.append('file', blob, fileName.replace(/\.[^.]+$/, '.jpg'));
  formData.append('upload_preset', uploadPreset);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Cloudinary upload failed: ${response.status}${errorText ? ` - ${errorText.slice(0, 120)}` : ''}`);
  }

  const result = await response.json();
  return optimizeCloudinaryUrl(result.secure_url || result.url);
}

export function optimizeCloudinaryUrl(url: string) {
  if (!url || !url.includes('/upload/')) return url;
  return url.replace('/upload/', '/upload/f_auto,q_auto,w_960,c_limit/');
}

export function isCloudinaryConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME && process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET);
}
