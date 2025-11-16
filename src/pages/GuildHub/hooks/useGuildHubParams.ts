import React from "react";
import { useSearchParams } from "react-router-dom";

const BASE_KEYS = ["tab", "sub", "sub2", "q", "sort", "dir", "page", "pageSize"] as const;
type ParamValue = string | number | null | undefined;
type ParamUpdates = Record<string, ParamValue>;

export type GuildHubParams = Partial<Record<string, string>>;

export type UpdateOptions = {
  replace?: boolean;
};

/**
 * Central helper to keep Guild Hub query parameters in sync with component state.
 * Provides read helpers and a small API to write/delete keys without duplicating logic.
 */
export function useGuildHubParams(extraKeys: ReadonlyArray<string> = []) {
  const [searchParams, setSearchParams] = useSearchParams();

  const keyHash = React.useMemo(() => [...extraKeys].sort().join("|"), [extraKeys]);
  const trackedKeys = React.useMemo(() => {
    const unique = new Set<string>([...BASE_KEYS]);
    extraKeys.forEach((key) => unique.add(key));
    return Array.from(unique);
  }, [keyHash]);

  const paramsObject = React.useMemo<GuildHubParams>(() => {
    const result: GuildHubParams = {};
    trackedKeys.forEach((key) => {
      const value = searchParams.get(key);
      if (value !== null) result[key] = value;
    });
    return result;
  }, [searchParams, trackedKeys]);

  const writeParams = React.useCallback(
    (updates: ParamUpdates, options?: UpdateOptions) => {
      const next = new URLSearchParams(searchParams);

      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      });

      setSearchParams(next, { replace: options?.replace ?? false });
    },
    [searchParams, setSearchParams],
  );

  const resetParams = React.useCallback(
    (keys?: ReadonlyArray<string>) => {
      const next = new URLSearchParams(searchParams);
      const targets = keys && keys.length > 0 ? keys : trackedKeys;

      targets.forEach((key) => next.delete(key));
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams, trackedKeys],
  );

  const getParam = React.useCallback(
    (key: string, fallback = "") => paramsObject[key] ?? fallback,
    [paramsObject],
  );

  const getNumberParam = React.useCallback(
    (key: string, fallback = 0) => {
      const raw = paramsObject[key];
      const parsed = raw ? Number(raw) : NaN;
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    [paramsObject],
  );

  return {
    params: paramsObject,
    getParam,
    getNumberParam,
    writeParams,
    resetParams,
  };
}
