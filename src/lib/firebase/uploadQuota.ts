import { doc, getDoc } from "firebase/firestore";

import { db } from "../firebase";
import type { AuthUser } from "../auth/types";
import { getUploadCenterUsage, type UploadCenterUsage } from "./users";
import { traceGetDoc } from "../debug/firestoreReadTrace";

export type UploadQuotaRoleOverride = {
  enabled?: boolean;
  dailyGuildLimit?: number;
  dailyPlayerLimit?: number;
};

export type UploadQuotaLimits = {
  dailyGuildLimit: number;
  dailyPlayerLimit: number;
};

export type UploadQuotaConfig = UploadQuotaLimits & {
  enabled?: boolean;
  roles?: Record<string, UploadQuotaRoleOverride | undefined>;
};

type RawUploadQuotaConfig = {
  enabled?: unknown;
  dailyGuildLimit?: unknown;
  dailyPlayerLimit?: unknown;
  roles?: unknown;
};

export const DEFAULT_UPLOAD_QUOTA: UploadQuotaConfig = {
  enabled: true,
  dailyGuildLimit: 9999,
  dailyPlayerLimit: 999999,
};

const parseNonNegativeNumber = (value: unknown): number | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
};

const parseRolesConfig = (rawRoles: unknown): UploadQuotaConfig["roles"] => {
  if (!rawRoles || typeof rawRoles !== "object") return undefined;

  const parsed: Record<string, UploadQuotaRoleOverride> = {};

  Object.entries(rawRoles as Record<string, unknown>).forEach(([role, override]) => {
    if (!override || typeof override !== "object") return;

    const overrideData = override as Record<string, unknown>;
    const maybeGuildLimit = parseNonNegativeNumber(overrideData.dailyGuildLimit);
    const maybePlayerLimit = parseNonNegativeNumber(overrideData.dailyPlayerLimit);
    const maybeEnabled = overrideData.enabled;

    const roleConfig: UploadQuotaRoleOverride = {};
    if (typeof maybeEnabled === "boolean") roleConfig.enabled = maybeEnabled;
    if (maybeGuildLimit !== null) roleConfig.dailyGuildLimit = maybeGuildLimit;
    if (maybePlayerLimit !== null) roleConfig.dailyPlayerLimit = maybePlayerLimit;

    if (Object.keys(roleConfig).length > 0) {
      parsed[role] = roleConfig;
    }
  });

  return Object.keys(parsed).length > 0 ? parsed : undefined;
};

export type UploadQuotaSnapshot = {
  config: UploadQuotaConfig;
  usage: UploadCenterUsage;
};

export async function getUploadQuotaConfigForUser(user: AuthUser | null): Promise<UploadQuotaConfig> {
  const ref = doc(db, "upload_quota_config", "default");

  try {
    const snapshot = await traceGetDoc(
      null,
      ref,
      () => getDoc(ref),
      { label: "UploadQuota:config" },
    );
    if (!snapshot.exists()) {
      console.warn("[UploadQuota] Missing config document. Using defaults.");
      return DEFAULT_UPLOAD_QUOTA;
    }

    const data = snapshot.data() as RawUploadQuotaConfig;
    const maybeGuildLimit = parseNonNegativeNumber(data?.dailyGuildLimit);
    const maybePlayerLimit = parseNonNegativeNumber(data?.dailyPlayerLimit);
    const roles = parseRolesConfig(data?.roles);

    const config: UploadQuotaConfig = {
      dailyGuildLimit: maybeGuildLimit ?? DEFAULT_UPLOAD_QUOTA.dailyGuildLimit,
      dailyPlayerLimit: maybePlayerLimit ?? DEFAULT_UPLOAD_QUOTA.dailyPlayerLimit,
    };

    if (typeof data?.enabled === "boolean") {
      config.enabled = data.enabled;
    }

    if (roles) {
      config.roles = roles;
    }

    const hasInvalidGuildLimit =
      data &&
      Object.prototype.hasOwnProperty.call(data, "dailyGuildLimit") &&
      maybeGuildLimit === null;
    const hasInvalidPlayerLimit =
      data &&
      Object.prototype.hasOwnProperty.call(data, "dailyPlayerLimit") &&
      maybePlayerLimit === null;

    if (hasInvalidGuildLimit || hasInvalidPlayerLimit) {
      console.warn("[UploadQuota] Invalid config payload. Using defaults.", { data });
    }

    return config;
  } catch (error) {
    console.error("[UploadQuota] Failed to load quota config.", { userId: user?.id, error });
    return DEFAULT_UPLOAD_QUOTA;
  }
}

export function resolveQuotaLimitsForUser(
  config: UploadQuotaConfig,
  userRoles: string[],
): UploadQuotaLimits {
  const normalizedRoles = Array.isArray(userRoles)
    ? userRoles.filter((role): role is string => typeof role === "string" && role.length > 0)
    : [];

  const defaultGuildLimit = Number.isFinite(config.dailyGuildLimit)
    ? config.dailyGuildLimit
    : DEFAULT_UPLOAD_QUOTA.dailyGuildLimit;
  const defaultPlayerLimit = Number.isFinite(config.dailyPlayerLimit)
    ? config.dailyPlayerLimit
    : DEFAULT_UPLOAD_QUOTA.dailyPlayerLimit;

  for (const role of normalizedRoles) {
    const override = config.roles?.[role];
    if (!override || override.enabled === false) {
      continue;
    }

    const guildLimit = override.dailyGuildLimit ?? defaultGuildLimit;
    const playerLimit = override.dailyPlayerLimit ?? defaultPlayerLimit;

    console.debug("[UploadQuota] Applying role override for upload limits.", {
      role,
      guildLimit,
      playerLimit,
    });

    return {
      dailyGuildLimit: guildLimit,
      dailyPlayerLimit: playerLimit,
    };
  }

  return {
    dailyGuildLimit: defaultGuildLimit,
    dailyPlayerLimit: defaultPlayerLimit,
  };
}

export async function fetchUploadQuotaSnapshot(user: AuthUser | null): Promise<UploadQuotaSnapshot> {
  const userId = user?.id ?? null;
  const usageFromUser: UploadCenterUsage = user?.uploadCenter?.usage ?? {
    date: null,
    guilds: 0,
    players: 0,
  };
  const userRoles = Array.isArray(user?.roles) ? user.roles : [];

  const [config, usage] = await Promise.all([
    getUploadQuotaConfigForUser(user),
    userId ? getUploadCenterUsage(userId) : Promise.resolve<UploadCenterUsage | null>(null),
  ]);

  const limits = resolveQuotaLimitsForUser(config, userRoles);
  const resolvedConfig: UploadQuotaConfig = {
    ...config,
    dailyGuildLimit: limits.dailyGuildLimit,
    dailyPlayerLimit: limits.dailyPlayerLimit,
  };

  return {
    config: resolvedConfig,
    usage: usage ?? usageFromUser,
  };
}
