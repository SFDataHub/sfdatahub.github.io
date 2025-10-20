// src/components/guilds/GuildClassOverview/types.ts
import type { GameClassKey } from "../../../data/classes";

export type ClassMeta = {
  /** Kanonische ID, z. B. "demon-hunter" – entspricht GameClassKey */
  id: GameClassKey;
  /** Anzeigename, z. B. "Demon Hunter" */
  name: string;
  /** Bildquelle – kann bereits proxied sein */
  crestUrl?: string;
  iconUrl?: string;
  /** Emoji-Fallback (optional) */
  fallback?: string;
};

export type MemberClassRec = {
  id?: string;
  name?: string | null;
  level?: number | null;

  classId?: string | null;
  class?: string | null;
  klass?: string | null;
  playerClass?: string | null;
  cls?: string | null;

  values?: Record<string, any> | null;
};

export type GuildClassOverviewProps = {
  /** Üblicherweise: snapshot.members */
  data: MemberClassRec[];
  /** Klassen-Stammdaten (deine CLASSES oder bereits adaptierte Metadaten) */
  classMeta: ClassMeta[];
  onPickClass?: (id: GameClassKey) => void;
};
