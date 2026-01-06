import type { DiscordByChannelSnapshot, DiscordNewsByChannelEntry, DiscordNewsItem } from "./newsFeed.types";

const FIRESTORE_BASE_URL = "https://firestore.googleapis.com/v1/projects";
const SNAPSHOT_PATH = "stats_public/news_latestByChannel";

const getFirestoreDocUrl = (): string | null => {
  const projectId = (import.meta as any)?.env?.VITE_FIREBASE_PROJECT_ID;
  const apiKey = (import.meta as any)?.env?.VITE_FIREBASE_API_KEY;
  if (!projectId || !apiKey) return null;
  return `${FIRESTORE_BASE_URL}/${projectId}/databases/(default)/documents/${SNAPSHOT_PATH}?key=${apiKey}`;
};

const readStringField = (value: any): string | null => {
  if (!value) return null;
  if (typeof value.stringValue === "string") return value.stringValue;
  return null;
};

const readNullableStringField = (value: any): string | null => {
  if (!value) return null;
  if (value.nullValue !== undefined) return null;
  if (typeof value.stringValue === "string") return value.stringValue;
  return null;
};

const readNumberField = (value: any): number | null => {
  if (!value) return null;
  if (typeof value.integerValue === "string") {
    const parsed = Number(value.integerValue);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value.doubleValue === "number") {
    return Number.isFinite(value.doubleValue) ? value.doubleValue : null;
  }
  if (typeof value.timestampValue === "string") {
    const parsed = Date.parse(value.timestampValue);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value.stringValue === "string") {
    const parsed = Number(value.stringValue);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const readMapFields = (value: any): Record<string, any> | null => {
  if (!value || !value.mapValue || !value.mapValue.fields) return null;
  return value.mapValue.fields as Record<string, any>;
};

const readArrayValues = (value: any): any[] => {
  const raw = value?.arrayValue?.values;
  return Array.isArray(raw) ? raw : [];
};

const mapNewsItem = (fields: Record<string, any> | null): DiscordNewsItem | null => {
  if (!fields) return null;
  const id = readStringField(fields.id);
  const channelId = readStringField(fields.channelId);
  const author = readStringField(fields.author);
  const timestamp = readStringField(fields.timestamp);
  const contentText = readStringField(fields.contentText);
  const imageUrl = readNullableStringField(fields.imageUrl);
  const jumpUrl = readStringField(fields.jumpUrl);
  if (!id || !channelId || !author || !timestamp || !contentText || !jumpUrl) return null;
  return {
    id,
    channelId,
    author,
    timestamp,
    contentText,
    imageUrl,
    jumpUrl,
  };
};

const mapEntry = (value: any): DiscordNewsByChannelEntry | null => {
  const fields = readMapFields(value);
  if (!fields) return null;
  const channelId = readStringField(fields.channelId);
  const label = readStringField(fields.label);
  if (!channelId || !label) return null;
  const itemFields = readMapFields(fields.item);
  return {
    channelId,
    label,
    item: itemFields ? mapNewsItem(itemFields) : null,
  };
};

const buildHashFallback = (items: DiscordNewsByChannelEntry[]): string => {
  return items
    .map((entry) => `${entry.channelId}|${entry.item?.id ?? "-"}|${entry.item?.timestamp ?? "-"}`)
    .join("\n");
};

const mapSnapshot = (payload: any): DiscordByChannelSnapshot | null => {
  const fields = payload?.fields;
  if (!fields || typeof fields !== "object") return null;

  const itemsRaw = readArrayValues(fields.items);
  const items: DiscordNewsByChannelEntry[] = [];
  for (const entry of itemsRaw) {
    const mapped = mapEntry(entry);
    if (mapped) items.push(mapped);
  }

  const updatedAt = readNumberField(fields.updatedAt);
  const nextUpdateAt = readNumberField(fields.nextUpdateAt);
  const hash = readStringField(fields.hash) ?? buildHashFallback(items);

  if (!hash) return null;
  return {
    updatedAt,
    nextUpdateAt,
    hash,
    items,
  };
};

export async function fetchDiscordNewsSnapshot(
  signal?: AbortSignal,
): Promise<DiscordByChannelSnapshot | null> {
  const url = getFirestoreDocUrl();
  if (!url) return null;
  const res = await fetch(url, { cache: "no-store", signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const payload = await res.json();
  return mapSnapshot(payload);
}
