import { resolveServer } from "../servers/serverResolver";

export const normalizeHubSearchText = (text: string) => text.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");

/** The optional suffix restricts observations, without changing name matching. */
export function parseHubSearchText(input: string) {
  const text = normalizeHubSearchText(input), comma = text.indexOf(",");
  const name = comma < 0 ? text : text.slice(0, comma).trim();
  const server = comma < 0 ? "" : text.slice(comma + 1).trim();
  return { name, server, exactServer: server ? resolveServer(server)?.code ?? null : null };
}

export function matchesHubSearchServer(query: ReturnType<typeof parseHubSearchText>, server: string | null) {
  if (!query.server) return true;
  const code = server ? resolveServer(server)?.code : null;
  return !!code && (query.exactServer ? code === query.exactServer : code.toLowerCase().startsWith(query.server));
}
