import * as SecureStore from "expo-secure-store";
import * as LocalAuthentication from "expo-local-authentication";

const KEY = "biometric_enabled";
let unlockedThisLaunch = false;

export const markUnlocked = () => { unlockedThisLaunch = true; };
export const isBiometricEnabled = async () => (await SecureStore.getItemAsync(KEY)) === "1";
export const setBiometricEnabled = (v: boolean) =>
  v ? SecureStore.setItemAsync(KEY, "1") : SecureStore.deleteItemAsync(KEY);
export const needsUnlock = async () => !unlockedThisLaunch && (await isBiometricEnabled());

export async function canUseBiometric() {
  return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
}
export async function unlock() {
  const r = await LocalAuthentication.authenticateAsync({ promptMessage: "Déverrouiller MedLink" });
  if (r.success) markUnlocked();
  return r.success;
}
