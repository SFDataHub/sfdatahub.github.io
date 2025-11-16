import { gdrive, toDriveThumbProxy } from "../../lib/urls";

const RECORDS_ASSETS: Record<string, string> = {
  infoCard: "1LpjOIafDHg1m6Il1H37gnujPph8tR6CY",
};

export const recordsAssetIdByKey = (key: string): string | null => {
  return RECORDS_ASSETS[key] ?? null;
};

export const recordsAssetThumbByKey = (key: string, size = 64): string | null => {
  const id = recordsAssetIdByKey(key);
  if (!id) {
    return null;
  }
  const direct = gdrive(id);
  if (!direct) {
    return null;
  }
  return toDriveThumbProxy(direct, size) ?? null;
};
