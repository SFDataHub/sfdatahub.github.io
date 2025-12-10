import { doc, getDoc } from "firebase/firestore";

import { db } from "../firebase";
import type { AuthUser } from "../auth/types";
import { getUploadCenterUsage, type UploadCenterUsage } from "./users";

export type UploadQuotaConfig = {
  dailyGuildLimit: number;
  dailyPlayerLimit: number;
};

export const DEFAULT_UPLOAD_QUOTA: UploadQuotaConfig = {
  dailyGuildLimit: 9999,
  dailyPlayerLimit: 999999,
};

export type UploadQuotaSnapshot = {
  config: UploadQuotaConfig;
  usage: UploadCenterUsage;
};

export async function getUploadQuotaConfigForUser(user: AuthUser | null): Promise<UploadQuotaConfig> {
  const ref = doc(db, "upload_quota_config", "default");

  try {
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) {
      console.warn("[UploadQuota] Missing config document. Using defaults.");
      return DEFAULT_UPLOAD_QUOTA;
    }

    const data = snapshot.data();
    const maybeGuildLimit = Number(data?.dailyGuildLimit);
    const maybePlayerLimit = Number(data?.dailyPlayerLimit);
    const hasValidGuildLimit = Number.isFinite(maybeGuildLimit) && maybeGuildLimit >= 0;
    const hasValidPlayerLimit = Number.isFinite(maybePlayerLimit) && maybePlayerLimit >= 0;

    if (!hasValidGuildLimit || !hasValidPlayerLimit) {
      console.warn("[UploadQuota] Invalid config payload. Using defaults.", { data });
      return DEFAULT_UPLOAD_QUOTA;
    }

    // TODO: später nach roles in `user.roles` aufteilen
    return {
      dailyGuildLimit: Math.max(0, maybeGuildLimit),
      dailyPlayerLimit: Math.max(0, maybePlayerLimit),
    };
  } catch (error) {
    console.error("[UploadQuota] Failed to load quota config.", { userId: user?.id, error });
    return DEFAULT_UPLOAD_QUOTA;
  }
}

export async function fetchUploadQuotaSnapshot(user: AuthUser | null): Promise<UploadQuotaSnapshot> {
  const userId = user?.id ?? null;
  const usageFromUser: UploadCenterUsage = user?.uploadCenter?.usage ?? {
    date: null,
    guilds: 0,
    players: 0,
  };

  const [config, usage] = await Promise.all([
    getUploadQuotaConfigForUser(user),
    userId ? getUploadCenterUsage(userId) : Promise.resolve<UploadCenterUsage | null>(null),
  ]);

  return {
    config,
    usage: usage ?? usageFromUser,
  };
}
