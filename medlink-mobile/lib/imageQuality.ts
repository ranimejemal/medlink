// lib/imageQuality.ts
import * as ImageManipulator from "expo-image-manipulator";
import jpeg from "jpeg-js";
import { Buffer } from "buffer";

export async function blurScore(uri: string): Promise<number> {
  const r = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 256 } }],
    { base64: true, format: ImageManipulator.SaveFormat.JPEG, compress: 0.8 }
  );

  const { data, width, height } = jpeg.decode(Buffer.from(r.base64!, "base64"), { useTArray: true });

  // niveaux de gris
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  // Laplacien + variance
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      sum += lap; sumSq += lap * lap; n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export const BLUR_THRESHOLD = 100; // à ajuster avec vos vraies photos