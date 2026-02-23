export type SfJsonPortrait = {
  genderName: "male" | "female";
  classId: number;
  raceId: number;
  mouth: number;
  hair: number;
  hairColor: number;
  horn: number;
  hornColor: number;
  brows: number;
  eyes: number;
  beard: number;
  nose: number;
  ears: number;
  extra: number;
  special: number;
  frameId: number;
};

export type SfJsonOwnPlayer = {
  identifier: string;
  playerId: number;
  server: string;
  portrait: SfJsonPortrait | null;
  saveArray?: number[];
  saveString?: string;
  name?: string;
  guildName?: string;
};

export type SfJsonParseResult = {
  ownPlayers: SfJsonOwnPlayer[];
  ownPlayer: SfJsonOwnPlayer | null;
  playersCount: number;
};
