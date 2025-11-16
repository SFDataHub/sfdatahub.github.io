import { gdrive, toDriveThumbProxy } from "../../lib/urls";

const RECORDS_ASSETS: Record<string, string> = {
  infoCard: "1a_gPOH3j87wcsuI4sitTgwVA9lvlLJku",
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
