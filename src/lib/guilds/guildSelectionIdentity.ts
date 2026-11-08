export const normalizeText = (value: unknown) => String(value ?? "").trim().toLowerCase();

const normalizeGuildIdSegment = (value: unknown): string | null => {
  const raw = normalizeText(value).replace(/\s+/g, "");
  if (!raw) return null;
  const identifierMatch = raw.match(/^(.+)_g([^_]+)$/);
  if (identifierMatch) {
    const serverKey = normalizeGuildServerKey(identifierMatch[1]);
    return serverKey ? `${serverKey}_g${identifierMatch[2]}` : raw;
  }
  return raw.startsWith("g") ? raw : `g${raw}`;
};

const normalizeGuildServerKey = (value: unknown): string | null => {
  const raw = normalizeText(value).replace(/\s+/g, "");
  if (!raw) return null;
  if (/^[a-z0-9]+_(?:eu|net)$/.test(raw)) return raw;

  const euMatch = raw.match(/^s?(\d+)$/);
  if (euMatch) return `s${euMatch[1]}_eu`;

  const euCodeMatch = raw.match(/^eu(\d+)$/);
  if (euCodeMatch) return `s${euCodeMatch[1]}_eu`;

  const fusionMatch = raw.match(/^f(\d+)$/);
  if (fusionMatch) return `f${fusionMatch[1]}_net`;

  const amMatch = raw.match(/^am(\d+)$/);
  if (amMatch) return `am${amMatch[1]}_net`;

  return raw;
};

export const buildGuildLogoIdentifier = (server: unknown, guildId: unknown): string | null => {
  const guildSegment = normalizeGuildIdSegment(guildId);
  if (!guildSegment) return null;
  if (guildSegment.includes("_g")) return guildSegment;

  const serverKey = normalizeGuildServerKey(server);
  if (!serverKey) return null;
  return `${serverKey}_${guildSegment}`;
};
