import { AUTH_BASE_URL } from "../auth/config";

const ensureBaseUrl = () => {
  if (!AUTH_BASE_URL) {
    throw new Error("Auth API base URL missing (set VITE_AUTH_BASE_URL).");
  }
};

const buildEndpoint = (scanId: string, kind: "players" | "guilds") =>
  `${AUTH_BASE_URL}/scan-uploads/${encodeURIComponent(scanId)}/${kind}.csv`;

const parseError = async (response: Response): Promise<Error> => {
  let message = `Request failed (${response.status})`;
  try {
    const payload = await response.json();
    if (payload?.error) {
      message = payload.error;
    }
  } catch {
    // ignore JSON parse failures
  }
  return new Error(message);
};

export async function fetchScanUploadCsv(
  scanId: string,
  kind: "players" | "guilds",
): Promise<string> {
  ensureBaseUrl();
  const endpoint = buildEndpoint(scanId, kind);
  console.log(`[scan-uploads] Fetching ${kind} CSV for scanId=${scanId}`);

  const response = await fetch(endpoint, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "text/csv",
    },
  });

  if (!response.ok) {
    console.error(
      `[scan-uploads] Failed to fetch ${kind} CSV for scanId=${scanId} (status ${response.status})`,
    );
    throw await parseError(response);
  }

  const text = await response.text();
  console.log(
    `[scan-uploads] Fetched ${kind} CSV for scanId=${scanId} (${text.length} chars)`,
  );
  return text;
}
