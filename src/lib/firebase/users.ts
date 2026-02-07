import { doc, getDoc, setDoc } from "firebase/firestore";

import { db } from "../firebase";
import { traceGetDoc, traceSetDoc } from "../debug/firestoreReadTrace";

export type UploadCenterUsage = {
  date?: string | null;
  guilds?: number;
  players?: number;
};

export const formatTodayString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export async function getUploadCenterUsage(userId: string | null): Promise<UploadCenterUsage> {
  if (!userId) {
    console.warn("[UploadCenterUsage] Missing userId, returning empty usage.");
    return { date: null, guilds: 0, players: 0 };
  }

  const userRef = doc(db, "users", userId);

  try {
    const snapshot = await traceGetDoc(
      null,
      userRef,
      () => getDoc(userRef),
      { label: "UploadCenterUsage:get" },
    );
    if (!snapshot.exists()) {
      console.warn("[UploadCenterUsage] User document does not exist.", { userId });
      return { date: null, guilds: 0, players: 0 };
    }
    const existingUploadCenter = (snapshot.data() as any)?.uploadCenter;
    const usage = existingUploadCenter?.usage ?? {};
    return {
      date: typeof usage?.date === "string" ? usage.date : null,
      guilds: Number(usage?.guilds ?? 0) || 0,
      players: Number(usage?.players ?? 0) || 0,
    };
  } catch (error) {
    console.error("[UploadCenterUsage] Failed to fetch usage data.", { userId, error });
    return { date: null, guilds: 0, players: 0 };
  }
}

export async function updateUploadCenterUsageForToday(
  userId: string,
  deltaGuilds: number,
  deltaPlayers: number,
) {
  if (!userId) {
    console.warn("[UploadCenterUsage] Missing userId, skipping usage update.");
    return;
  }

  const today = formatTodayString();
  const userRef = doc(db, "users", userId);

  let snapshot;
  try {
    snapshot = await traceGetDoc(
      null,
      userRef,
      () => getDoc(userRef),
      { label: "UploadCenterUsage:update" },
    );
  } catch (error) {
    console.error("[UploadCenterUsage] Failed to fetch user document.", { userId, error });
    return;
  }

  if (!snapshot.exists()) {
    console.warn("[UploadCenterUsage] User document does not exist.", { userId });
    return;
  }

  const existingUploadCenter = (snapshot.data() as any)?.uploadCenter;
  const currentUsage = existingUploadCenter?.usage;
  const isSameDay = currentUsage?.date === today;
  const baseGuilds = isSameDay ? Number(currentUsage?.guilds ?? 0) : 0;
  const basePlayers = isSameDay ? Number(currentUsage?.players ?? 0) : 0;

  const nextGuilds = baseGuilds + Number(deltaGuilds ?? 0);
  const nextPlayers = basePlayers + Number(deltaPlayers ?? 0);

  try {
    await traceSetDoc(
      userRef,
      () =>
        setDoc(
          userRef,
          {
            uploadCenter: {
              ...(existingUploadCenter ?? {}),
              usage: {
                date: today,
                guilds: nextGuilds,
                players: nextPlayers,
              },
            },
          },
          { merge: true },
        ),
      { label: "UploadCenterUsage:updateWrite" },
    );
  } catch (error) {
    console.error("[UploadCenterUsage] Failed to update usage data.", { userId, error });
  }
}
