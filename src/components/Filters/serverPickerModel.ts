import { SERVER_BY_ID } from "../../data/servers";
import { resolveServer } from "../../lib/servers/serverResolver";

const NAMED_LABELS: Record<string, { short: string; lines: readonly string[]; fontSize: number }> = {
  BLACKFOREST: { short: "BF", lines: ["Black", "Forest"], fontSize: 20 },
  GNAROGRIM: { short: "GN", lines: ["Gnarogrim"], fontSize: 15 },
  MAERWYNN: { short: "MW", lines: ["Maerwynn"], fontSize: 16 },
  STUMBLESTEPPE: { short: "STS", lines: ["Stumble", "Steppe"], fontSize: 16 },
};

export const isHiddenPickerServer = (value: string) =>
  typeof value === "string" && (value.trim().toUpperCase() === "SPEED" || resolveServer(value)?.code === "SPEED");

// Preserve the exact values of every retained selection, including read aliases.
export const excludeHiddenPickerServers = (values: readonly string[]) =>
  values.filter(value => !isHiddenPickerServer(value));

export function serverPickerPresentation(value: string) {
  const server = resolveServer(value);
  const code = server?.code ?? value.trim().toUpperCase();
  const fullName = server?.displayName ?? SERVER_BY_ID[value.trim().toLowerCase()]?.label ?? code;
  const named = server?.type === "named";
  const label = NAMED_LABELS[code];
  const short = label?.short ?? code;
  return {
    fullName, short, named,
    fusion: server?.type === "fusion" || named,
    lines: named ? label?.lines ?? fullName.split(" ") : [short],
    fontSize: named ? label?.fontSize ?? 16 : short.length > 3 ? 24 : 29,
    searchTerms: [value, code, fullName, short, ...(server?.aliases ?? [])].map(term => term.toLowerCase()),
  };
}
