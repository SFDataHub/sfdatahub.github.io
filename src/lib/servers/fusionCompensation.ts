import type { LocalServerFusionCompensationPolicy } from "../../data/serverFusions";
import type { LocalServerDefinition } from "../../data/serverRegistry";
import { getFusionEvent, getFusionOrigins, resolveServer } from "./serverResolver";

export type FusionCompensationUnavailableReason =
  | "unknown-origin"
  | "unknown-destination"
  | "origin-not-in-fusion-group"
  | "unknown-fusion-lineage"
  | "missing-release-date"
  | "invalid-release-date";

export type FusionLevelCompensationResult =
  | {
      available: true;
      compensationPolicy: LocalServerFusionCompensationPolicy;
      compensationApplicable: boolean;
      originServer: string;
      destinationServer: string;
      oldestOriginServer: string | null;
      originReleaseDate: string | null;
      oldestReleaseDate: string | null;
      rawMonthDifference: number | null;
      flooredHalfMonths: number | null;
      compensationLevels: number;
    }
  | {
      available: false;
      reason: FusionCompensationUnavailableReason;
      originServer: string | null;
      destinationServer: string | null;
    };

const DAYS_PER_MONTH = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const cache = new Map<string, FusionLevelCompensationResult>();

const parseUtcDate = (value: string | undefined) => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day));
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const calculateThirtyDayMonthDifference = (laterDate: string, earlierDate: string) => {
  const later = parseUtcDate(laterDate);
  const earlier = parseUtcDate(earlierDate);
  if (later == null || earlier == null) return null;
  return (later - earlier) / DAY_MS / DAYS_PER_MONTH;
};

export const floorToPreviousHalfMonth = (monthDifference: number) =>
  Math.floor(Math.max(0, monthDifference) * 2) / 2;

export const calculateFusionLevelCompensationFromOrigins = (
  origin: LocalServerDefinition,
  destination: LocalServerDefinition,
  fusionOrigins: readonly LocalServerDefinition[],
  compensationPolicy: LocalServerFusionCompensationPolicy,
): FusionLevelCompensationResult => {
  if (!fusionOrigins.length) {
    return {
      available: false,
      reason: "unknown-fusion-lineage",
      originServer: origin.code,
      destinationServer: destination.code,
    };
  }

  if (!fusionOrigins.some((server) => server.code === origin.code)) {
    return {
      available: false,
      reason: "origin-not-in-fusion-group",
      originServer: origin.code,
      destinationServer: destination.code,
    };
  }

  if (compensationPolicy === "none") {
    return {
      available: true,
      compensationPolicy,
      compensationApplicable: false,
      originServer: origin.code,
      destinationServer: destination.code,
      oldestOriginServer: null,
      originReleaseDate: origin.releaseDate ?? null,
      oldestReleaseDate: null,
      rawMonthDifference: null,
      flooredHalfMonths: null,
      compensationLevels: 0,
    };
  }

  if (fusionOrigins.some((server) => !server.releaseDate)) {
    return {
      available: false,
      reason: "missing-release-date",
      originServer: origin.code,
      destinationServer: destination.code,
    };
  }

  const datedOrigins = fusionOrigins.map((server) => ({
    server,
    releaseTimestamp: parseUtcDate(server.releaseDate),
  }));
  if (datedOrigins.some((entry) => entry.releaseTimestamp == null)) {
    return {
      available: false,
      reason: "invalid-release-date",
      originServer: origin.code,
      destinationServer: destination.code,
    };
  }

  const oldest = [...datedOrigins].sort((left, right) => left.releaseTimestamp! - right.releaseTimestamp!)[0];
  if (!oldest?.server.releaseDate || !origin.releaseDate) {
    return {
      available: false,
      reason: "missing-release-date",
      originServer: origin.code,
      destinationServer: destination.code,
    };
  }

  const rawMonthDifference = calculateThirtyDayMonthDifference(origin.releaseDate, oldest.server.releaseDate);
  if (rawMonthDifference == null) {
    return {
      available: false,
      reason: "invalid-release-date",
      originServer: origin.code,
      destinationServer: destination.code,
    };
  }

  const flooredHalfMonths = floorToPreviousHalfMonth(rawMonthDifference);
  return {
    available: true,
    compensationPolicy,
    compensationApplicable: true,
    originServer: origin.code,
    destinationServer: destination.code,
    oldestOriginServer: oldest.server.code,
    originReleaseDate: origin.releaseDate,
    oldestReleaseDate: oldest.server.releaseDate,
    rawMonthDifference,
    flooredHalfMonths,
    compensationLevels: Math.floor(rawMonthDifference * 2),
  };
};

export const getFusionLevelCompensation = (
  originInput: string | number | null | undefined,
  destinationInput: string | number | null | undefined,
): FusionLevelCompensationResult => {
  const origin = resolveServer(originInput);
  const destination = resolveServer(destinationInput);
  if (!origin) return { available: false, reason: "unknown-origin", originServer: null, destinationServer: destination?.code ?? null };
  if (!destination) return { available: false, reason: "unknown-destination", originServer: origin.code, destinationServer: null };

  const cacheKey = `${origin.code}->${destination.code}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const compensationPolicy = getFusionEvent(origin.code, destination.code)?.compensationPolicy ?? "none";
  const result = calculateFusionLevelCompensationFromOrigins(
    origin,
    destination,
    getFusionOrigins(destination.code),
    compensationPolicy,
  );
  cache.set(cacheKey, result);
  return result;
};
