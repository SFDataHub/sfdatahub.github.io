import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";

export interface UserSettings {
  language?: "en" | "de";
  defaultSection?: "home" | "toplists" | "guilds" | "tools" | "community";
  compactTables?: boolean;
  showExperimentalFeatures?: boolean;
}

const COLLECTION = "user_settings";

export async function getUserSettings(uid: string): Promise<UserSettings | null> {
  if (!uid) return null;
  try {
    const ref = doc(db, COLLECTION, uid);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) {
      return null;
    }
    const data = snapshot.data() as UserSettings;
    return data ?? null;
  } catch (error) {
    console.warn("[UserSettings] Failed to load settings", error);
    return null;
  }
}

export async function updateUserSettings(
  uid: string,
  partial: Partial<UserSettings>,
): Promise<void> {
  if (!uid) return;
  try {
    const ref = doc(db, COLLECTION, uid);
    await setDoc(ref, partial, { merge: true });
  } catch (error) {
    console.error("[UserSettings] Failed to update settings", error);
    throw error;
  }
}
