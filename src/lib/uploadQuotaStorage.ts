import type { UploadQuotaConfig } from "./firebase/uploadQuota";
import type { UploadCenterUsage } from "./firebase/users";

type StoredUploadQuotaV1 = {
  version: 1;
  config: UploadQuotaConfig;
  usage: UploadCenterUsage;
  storedAt: string;
};

const STORAGE_KEY = "sfdatahub_upload_quota_v1";

const normalizeUsage = (usage?: UploadCenterUsage | null): UploadCenterUsage => ({
  date: typeof usage?.date === "string" ? usage.date : null,
  guilds: Number(usage?.guilds ?? 0) || 0,
  players: Number(usage?.players ?? 0) || 0,
});

export const persistUploadQuotaToStorage = (
  config: UploadQuotaConfig,
  usage: UploadCenterUsage,
) => {
  if (typeof window === "undefined") return;
  const payload: StoredUploadQuotaV1 = {
    version: 1,
    config,
    usage: normalizeUsage(usage),
    storedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("[UploadQuotaStorage] Failed to persist quota data", error);
  }
};

export const readStoredUploadQuota = (): StoredUploadQuotaV1 | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredUploadQuotaV1;
    if (!parsed || typeof parsed !== "object" || parsed.version !== 1) return null;
    if (
      typeof parsed.config?.dailyGuildLimit !== "number" ||
      typeof parsed.config?.dailyPlayerLimit !== "number"
    ) {
      return null;
    }

    return {
      version: 1,
      config: {
        dailyGuildLimit: Number(parsed.config.dailyGuildLimit) || 0,
        dailyPlayerLimit: Number(parsed.config.dailyPlayerLimit) || 0,
      },
      usage: normalizeUsage(parsed.usage),
      storedAt: typeof parsed.storedAt === "string" ? parsed.storedAt : "",
    };
  } catch (error) {
    console.warn("[UploadQuotaStorage] Failed to read quota data", error);
    return null;
  }
};

export const clearStoredUploadQuota = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("[UploadQuotaStorage] Failed to clear quota data", error);
  }
};
