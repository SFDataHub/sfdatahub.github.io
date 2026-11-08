import { openDB } from "idb";
import {
  getGuildHubLocalScan,
  listGuildHubLocalScansReadOnly,
  normalizeGuildHubLocalScanForDerivation,
  type GuildHubLocalScan,
  type GuildHubScanSummary,
} from "../../src/lib/guilds/localScanLibrary.ts";

// Called only from fake-indexeddb tests. Seed the real Raw/Summary validity
// contract without deriving Analytics: each test controls its derived fixture.
export async function seedLocalSourceValidityFixture(input: GuildHubLocalScan) {
  await listGuildHubLocalScansReadOnly();
  const db = await openDB("sfdatahub-local-data");
  await db.put("scans", normalizeGuildHubLocalScanForDerivation(input));
  const scan = await getGuildHubLocalScan(input.id);
  if (!scan) throw new Error(`Fixture source missing: ${input.id}`);
  const summary: GuildHubScanSummary = await db.get("scanSummaries", input.id);
  db.close();
  return { scan, summary };
}
