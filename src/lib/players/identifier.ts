const SERVER_CODE_PATTERN = /^[a-z]{1,4}\d+$/i;
const SERVER_CODE_SUFFIX_PATTERN = /^([a-z]{1,4}\d+)[_.-]?(net|eu)$/i;
const SERVER_HOST_PATTERN = /^([a-z]{1,4}\d+)\.sfgame\.(net|eu)$/i;

const normalizeServerCodeAlias = (value: string): string => {
  const cleaned = String(value ?? "").trim().toUpperCase();
  if (!cleaned) return "";
  const match = cleaned.match(/^S(\d+)$/);
  if (match) return `EU${match[1]}`;
  return cleaned;
};

export const normalizeServerKeyFromInput = (value: unknown): string | null => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  if (SERVER_CODE_PATTERN.test(lowered)) return normalizeServerCodeAlias(lowered);
  const suffixMatch = lowered.match(SERVER_CODE_SUFFIX_PATTERN);
  if (suffixMatch) return normalizeServerCodeAlias(suffixMatch[1]);
  const hostMatch = lowered.match(SERVER_HOST_PATTERN);
  if (hostMatch) return normalizeServerCodeAlias(hostMatch[1]);
  return normalizeServerCodeAlias(trimmed);
};

export const parsePlayerIdentifier = (
  value: unknown,
): { identifier: string; playerId: string; serverKey: string } | null => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const match = raw.match(/^(.+)_p(\d+)$/i);
  if (!match) return null;
  const serverKeyRaw = match[1]?.trim();
  const playerId = match[2];
  const serverKey = normalizeServerKeyFromInput(serverKeyRaw);
  if (!serverKey || !playerId) return null;
  return { identifier: raw, playerId, serverKey };
};

export const buildPlayerIdentifier = (server: unknown, playerId: unknown): string | null => {
  const pid = String(playerId ?? "").trim();
  if (!pid) return null;
  const serverKey = normalizeServerKeyFromInput(server);
  if (!serverKey) return null;
  return `${serverKey.toLowerCase()}_p${pid}`;
};
