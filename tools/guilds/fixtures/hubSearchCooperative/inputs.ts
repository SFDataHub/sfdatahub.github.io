import type { GuildHubLocalScan } from '../../../../src/lib/guilds/localScanLibrary';
const at = Date.UTC(2026, 9, 6);
const player = (i: number) => ({ identifier: `f8_net_p${i}`, name: `Player ${i}`, prefix: 'f8_net', timestamp: at });
const shared = player(7);
export const inputs = [
  { players: [player(1), { ...player(2), timestamp: at - 86400000 }, {}, { name: 'Unknown Time' },
    { identifier: 'f9_net_p3', prefix: 'f8_net', name: 'Contradictory' }, shared, shared],
    groups: [{ identifier: 'f8_net_g1', prefix: 'f8_net', name: 'Guild', timestamp: at }, { name: 'Nameless ref' }, {}] },
  { timestamp: at, players: [{ name: 'Root Fallback', identifier: 'f8_net_p1' }, {}], groups: [{}] },
  { data: { players: [player(1)], guilds: [{ identifier: 'f8_net_g1', name: 'Nested', timestamp: at }] } },
  { players: [{ own: 1, identifier: 'f8_net_p1', prefix: 'f8_net', name: 'Parsed own', save: [], timestamp: '2026-10-06' }], groups: [] },
  { players: [{ own: 1, identifier: 'f8_net_p1', prefix: 'f8_net', name: 'Unknown', save: [] }], groups: [] },
  { players: Array.from({ length: 10000 }, (_, i) => ({ ...player(i), guildIdentifier: 'f8_net_g1', guildName: 'Guild' })), groups: [] },
];
export function scanFor(rawData: unknown, i = 0): GuildHubLocalScan {
  return { id: `parity-${i}`, filename: 'fixture.json', contentHash: `hash-${i}`, importedAt: new Date(at).toISOString(),
    scannedAt: null, servers: ['f8_net'], playerCount: 0, groupCount: 0, rawData,
    sourceGeneration: 'opaque-z', normalizerVersion: 1, coreNormalizerVersion: 1,
    mergedSourceIds: ['original-1', 'original-2'], isScanSlot: true, analyticsEnabled: i !== 2 } as GuildHubLocalScan;
}
