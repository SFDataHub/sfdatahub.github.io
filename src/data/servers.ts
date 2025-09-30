export type Server = { id: string; label: string; region?: string; active?: boolean };

export const SERVERS: Server[] = [
  { id: "eu1",  label: "EU 1",  region: "EU", active: true },
  { id: "eu2",  label: "EU 2",  region: "EU", active: true },
  { id: "us1",  label: "US 1",  region: "NA", active: true },
];

export const SERVER_BY_ID = Object.fromEntries(
  SERVERS.map(s => [s.id, s] as const)
);
