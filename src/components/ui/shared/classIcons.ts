// Globale Utility für Klassen-Icons (Google Drive Proxy)
import { CLASSES } from "../../../data/classes";
import { toDriveThumbProxy } from "../../../lib/urls";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

export function getClassIconUrl(label?: string | null, size = 64): string | undefined {
  if (!label) return;
  const t = norm(label);
  let c = CLASSES.find(x => norm(x.label) === t);
  if (!c) c = CLASSES.find(x => norm(x.label).startsWith(t) || t.startsWith(norm(x.label)));
  return c ? toDriveThumbProxy(c.iconUrl, size) : undefined;
}
