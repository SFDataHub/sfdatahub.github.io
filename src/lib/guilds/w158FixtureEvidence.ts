/** One-time local data repair, authorized by the W170 task. These two exact
 * physical records were backed up from localhost:5173 with the W168 reader.
 * IDs, archive provenance AND the recomputed Raw hash must all agree.
 * This is a closed evidence list, never a name/server-based deletion policy. */
export const W158_FIXTURE_SOURCES = [
  { id: "guild-hub-scan:mvvcytyd:4822453e-2704-4118-adef-a4a8776604c2", archiveId: "w158-1",
    hash: "79cdadabe88d41ce97111e4d27f6a474de3bf136ce613a62db2c00fec663cf55", archiveHash: "2".repeat(64), timestamp: 1785931200000 },
  { id: "guild-hub-scan:mvvcyxx3:0b3f042a-9528-497d-89c3-6e313cf3d431", archiveId: "w158-0",
    hash: "43a74a8bf971d94c58b20529c47961886a17aebbc725f12b3d98133284b822e9", archiveHash: "1".repeat(64), timestamp: 1780315200000 },
] as const;
export const W158_CLEANUP_KEY = "migration.w158FixtureCleanup.v1";
// Full favorite fingerprints, except mutable ordering/revision counters. Shared
// identities, changed metadata and additional references therefore fail closed.
export const W158_FIXTURE_FAVORITES = [
  { id: "player:f8::1", hash: "5fc1039e6cf3c1e5368091ab00233caeeac03cdbba8bc2af9ac96eb3c966905d" },
  { id: "guild:f8::1", hash: "203308a20aade3b2a5215b37ec4430d4cada217f909730149f8bb79a0021f0b8" },
] as const;
