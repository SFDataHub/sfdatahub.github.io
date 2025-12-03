import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";

export interface UserToolsSettings {
  defaultSetId?: string | null;
  showToolsIntro?: boolean;
  enableExperimentalTools?: boolean;
  updatedAt?: string;
}

const COLLECTION = "user_tools_state";

export async function getUserToolsSettings(userId: string): Promise<UserToolsSettings | null> {
  if (!userId) return null;
  try {
    const ref = doc(db, COLLECTION, userId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return (snap.data() as UserToolsSettings) ?? null;
  } catch (error) {
    console.warn("[UserToolsSettings] Failed to load tools settings", error);
    return null;
  }
}

export async function saveUserToolsSettings(userId: string, settings: UserToolsSettings): Promise<void> {
  if (!userId) return;
  try {
    const ref = doc(db, COLLECTION, userId);
    const payload: UserToolsSettings = {
      ...settings,
      updatedAt: new Date().toISOString(),
    };
    await setDoc(ref, payload, { merge: true });
  } catch (error) {
    console.error("[UserToolsSettings] Failed to save tools settings", error);
    throw error;
  }
}
