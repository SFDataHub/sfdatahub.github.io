import { openDB } from "idb";
import { createGuildHubLocalScanImportPreview } from "../../../../src/lib/guilds/localScanLibrary";
import { readGuildAnalyticsDerivedSource } from "../../../../src/lib/guilds/localGuildAnalyticsStore";
import { loadIdentityResolutionSnapshot } from "../../../../src/lib/identities/identityResolution";

let sourceId: string;
const savedDecision = {pairKey:"retained-a::retained-c", identifierA:"retained-a", identifierB:"retained-c", identifierAKey:"retained-a", identifierBKey:"retained-c", createdAt:"2026-01-01", source:"manual"};
const savedSummary = () => ({sourceScanId:sourceId, fixture:"old-summary-preserved"});
const marker = () => ({sourceScanId:sourceId, sourceUpdatedAt:"2026-01-01", sourceContentHash:"legacy", derivedVersion:1, materializedAt:"2026-01-01", snapshotCount:0});
export async function seedLegacyFixture() {
  const preview = await createGuildHubLocalScanImportPreview("Legacy.json", JSON.stringify({players:[{identifier:"s1_net_p8",prefix:"s1_net",timestamp:1791194400000,name:"Legacy",level:80,class:1}],groups:[]}));
  sourceId = preview.id;
  const raw = await openDB("sfdatahub-local-data", 5, {upgrade(db) {
    const scans = db.createObjectStore("scans", {keyPath:"id"}); scans.createIndex("by_contentHash","contentHash",{unique:true}); scans.createIndex("by_importedAt","importedAt");
    const summary = db.createObjectStore("scanSummaries", {keyPath:"sourceScanId"}); summary.createIndex("by_importedAt","importedAt"); summary.createIndex("by_updatedAt","updatedAt");
    db.createObjectStore("metadata", {keyPath:"key"});
    const bindings = db.createObjectStore("archiveScanBindings", {keyPath:"key"}); bindings.createIndex("by_localScanId","localScanId");
    const search = db.createObjectStore("archiveSearchIndexes", {keyPath:"key"}); search.createIndex("by_archiveScanId","archiveScanId");
    const top = db.createObjectStore("localToplistSnapshots", {keyPath:"key"}); top.createIndex("by_archiveScanId","archiveScanId"); top.createIndex("by_localScanId","localScanId");
    db.createObjectStore("untouchedUserFixture",{keyPath:"id"});
  }});
  await raw.put("scans",preview); await raw.put("scanSummaries",savedSummary());
  await raw.put("archiveScanBindings",{key:"legacy-binding",localScanId:sourceId,fixture:"binding"});
  await raw.put("archiveSearchIndexes",{key:"legacy-index",fixture:"index"});
  await raw.put("metadata",{key:"migration.guildHubScans",value:{status:"completed"},updatedAt:"2026-01-01"});
  await raw.put("untouchedUserFixture",{id:"retained",fixture:"user-state"}); raw.close();
  const derived = await openDB("sfdatahub-guild-analytics",1,{upgrade(db) {
    const sources = db.createObjectStore("sources",{keyPath:"sourceScanId"}); sources.createIndex("by_derivedVersion","derivedVersion");
    for(const name of ["snapshots","members","guilds"]) {
      const store = db.createObjectStore(name,{keyPath:"id"}); store.createIndex("by_sourceScanId","sourceScanId"); store.createIndex("by_snapshotTimestamp","snapshotTimestamp");
      if(name === "members") {store.createIndex("by_memberRef","memberRef"); store.createIndex("by_memberRefTimestamp",["memberRef","snapshotTimestamp"]);}
      if(name !== "snapshots") {store.createIndex("by_guildIdentifier","guildIdentifier"); store.createIndex("by_guildTimestamp",["guildIdentifier","snapshotTimestamp"]);}
    }
  }}); await derived.put("sources",marker()); derived.close();
  for(const kind of ["player","guild"]) {
    const db = await openDB(kind === "player" ? "sfdatahub-local-identities" : "sfdatahub-local-guild-identities",1,{upgrade(db) {
      const entities = db.createObjectStore(`${kind}Entities`,{keyPath:"entityId"}); entities.createIndex("by_createdAt","createdAt"); entities.createIndex("by_updatedAt","updatedAt");
      const aliases = db.createObjectStore(`${kind}Aliases`,{keyPath:"identifierKey"}); aliases.createIndex("by_entityId","entityId"); aliases.createIndex("by_source","source");
      const exclusions = db.createObjectStore(`${kind}Exclusions`,{keyPath:"pairKey"}); exclusions.createIndex("by_identifierAKey","identifierAKey"); exclusions.createIndex("by_identifierBKey","identifierBKey"); exclusions.createIndex("by_source","source");
    }});
    await db.put(`${kind}Entities`,{entityId:"retained",createdAt:"2026-01-01",updatedAt:"2026-01-01"});
    for (const identifier of ["retained-a","retained-b"]) await db.put(`${kind}Aliases`,{identifier,identifierKey:identifier,entityId:"retained",addedAt:"2026-01-01",source:"manual"});
    await db.put(`${kind}Exclusions`,savedDecision); db.close();
  }
}
export async function verifyLegacyUpgrade() {
  const assert = (value: unknown) => {if(!value) throw Error("Legacy upgrade preservation failed");};
  const raw = await openDB("sfdatahub-local-data");
  assert(raw.version === 6 && raw.objectStoreNames.contains("localChanges"));
  assert(JSON.stringify(await raw.get("scanSummaries",sourceId)) === JSON.stringify(savedSummary()));
  assert((await raw.get("scans",sourceId)).filename === "Legacy.json");
  assert((await raw.get("archiveScanBindings","legacy-binding")).fixture === "binding");
  assert((await raw.get("archiveSearchIndexes","legacy-index")).fixture === "index");
  assert((await raw.get("untouchedUserFixture","retained")).fixture === "user-state"); raw.close();
  await readGuildAnalyticsDerivedSource(sourceId);
  const derived = await openDB("sfdatahub-guild-analytics");
  assert(derived.version === 2 && derived.objectStoreNames.contains("localChanges"));
  assert(JSON.stringify(await derived.get("sources",sourceId)) === JSON.stringify(marker())); derived.close();
  await loadIdentityResolutionSnapshot();
  for(const kind of ["player","guild"]) {
    const db = await openDB(kind === "player" ? "sfdatahub-local-identities" : "sfdatahub-local-guild-identities");
    assert(db.version === 2 && db.objectStoreNames.contains("localChanges"));
    assert((await db.getAllFromIndex(`${kind}Aliases`,"by_entityId","retained")).length === 2);
    assert(JSON.stringify(await db.get(`${kind}Exclusions`,savedDecision.pairKey)) === JSON.stringify(savedDecision)); db.close();
  }
  console.log("PASS browser additive Raw/Analytics/Player/Guild upgrades + reopen preserve Raw, Summary, Binding, archive cache, Identity decisions and unrelated fixture");
}
