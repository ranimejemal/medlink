import * as ImageManipulator from "expo-image-manipulator";
import jpeg from "jpeg-js";
import { Buffer } from "buffer";
import { Alert } from "react-native";
import { supabase } from "@/lib/supabase";

// Seuil de netteté : à ajuster avec vos vraies photos
const BLUR_THRESHOLD = 100;

/** Score de netteté (variance du Laplacien). Plus il est bas, plus l'image est floue. */
async function blurScore(uri: string): Promise<number> {
  const r = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 256 } }],
    { base64: true, format: ImageManipulator.SaveFormat.JPEG, compress: 0.8 }
  );

  const { data, width, height } = jpeg.decode(Buffer.from(r.base64!, "base64"), {
    useTArray: true,
  });

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
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** Renvoie true si l'image peut être envoyée, false sinon (une alerte est affichée). */
export async function validateImage(uri: string): Promise<boolean> {
  try {
    // 1. Flou
    const score = await blurScore(uri);
    if (score < BLUR_THRESHOLD) {
      Alert.alert(
        "Photo floue",
        "Cette photo n'est pas assez nette. Reprenez-la avec plus de lumière."
      );
      return false;
    }

    // 2. Contenu inapproprié (vérifié côté serveur)
    const small = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 512 } }], {
      base64: true,
      compress: 0.7,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    const { data, error } = await supabase.functions.invoke("moderate-image", {
      body: { base64: small.base64 },
    });

    if (error) {
      Alert.alert("Vérification impossible", "Réessayez dans un instant.");
      return false;
    }
    if (data?.flagged) {
      Alert.alert("Image refusée", "Cette image semble contenir un contenu inapproprié.");
      return false;
    }

    return true;
  } catch (e) {
    Alert.alert("Vérification impossible", "Une erreur est survenue. Réessayez.");
    return false;
  }
}