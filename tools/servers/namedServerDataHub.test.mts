import assert from 'node:assert/strict';
import { LOCAL_SERVER_REGISTRY } from '../../src/data/serverRegistry.ts';
import { resolveServer, serverComparisonKey } from '../../src/lib/servers/serverResolver.ts';
import { normalizeServerKeyFromInput } from '../../src/lib/players/identifier.ts';
import { favoriteReference, referenceKey } from '../../src/lib/data-hub/hubFavoritesContract.ts';
import { localEntityPath, parseLocalEntity, parseObservation } from '../../src/lib/data-hub/routes.ts';
import { listGuildHubLocalGuildsForServerFromScanSummaries, type GuildHubScanSummary } from '../../src/lib/guilds/localScanLibrary.ts';
import { isNormalizedGuildMemberInGuild, normalizeGuildScanServer } from '../../src/lib/guilds/guildScanNormalizer.ts';
import { isDerivedGuildSnapshotForGuild } from '../../src/lib/guilds/localGuildAnalyticsStore.ts';
import { createAnalyticsScopeMatcher } from '../../src/lib/local-data/localDataDependencies.ts';
import { isLocalDataChangeRelevant } from '../../src/lib/local-data/localDataChanges.ts';
import { matchesPlayerObservationRow } from '../../src/pages/GuildHub/localPlayerCurrentSeed.ts';
import { selectTargetAnalyticsMembers } from '../../src/pages/Playground/playerPerformanceModel.ts';
import { groupArchiveOverviewDays } from '../../src/components/ScanManagement/scanArchiveOverview.ts';
import { toplistRowIdentity } from '../../src/lib/scanArchive/toplistRowIdentity.ts';

const matrix=[];
for(const server of LOCAL_SERVER_REGISTRY.filter(s=>s.type==='named')){
 const rawAlias=server.aliases.find(a=>a.endsWith('_net'))!;assert(rawAlias);
 const literal=rawAlias+'_g42',ref=favoriteReference('guild',literal)!;
 const guild={key:literal,guildId:'42',guildIdentifier:literal,name:'Same guild name',server:rawAlias};
 const summary={sourceScanId:'existing-source',servers:[rawAlias],guilds:[guild],fusionInventorySlices:[{server:rawAlias,playerIdentifiers:[rawAlias+'_p7'],guildIdentifiers:[literal]}]} as unknown as GuildHubScanSummary;
 const variants=[server.code,server.displayName,server.host,...server.hosts,...server.aliases,'https://'+server.host+'/profile'];
 for(const variant of variants){
  assert.equal(resolveServer(variant)?.code,server.code,variant);
  assert.equal(serverComparisonKey(variant),server.code,variant);
  const selected=favoriteReference('guild','42',variant)!;assert(selected);
  assert.equal(referenceKey(selected),referenceKey(ref));
  const path=localEntityPath('guild',ref,{source:'existing-source',at:1785667782930,hash:'kept-hash'});
  assert.equal(parseLocalEntity('guild',selected.serverNamespace,literal)?.entityId,'42');
  assert.deepEqual(parseObservation(path.slice(path.indexOf('?'))),{kind:'exact',anchor:{source:'existing-source',at:1785667782930,hash:'kept-hash'}});
  assert.equal(listGuildHubLocalGuildsForServerFromScanSummaries([summary],variant)[0]?.guildIdentifier,literal);
  assert(isNormalizedGuildMemberInGuild({server:rawAlias,guildSegment:'g42',groupSegment:null,guildName:'Same guild name'},{server:variant,guildSegment:'42',name:'Same guild name'}));
  assert(isDerivedGuildSnapshotForGuild({server:rawAlias,guildSegment:'g42',guildName:'Same guild name'},{server:variant,guildId:'42',name:'Same guild name'}));
  assert(createAnalyticsScopeMatcher({servers:[variant]})(summary));
  assert.equal(toplistRowIdentity(variant,rawAlias+'_p7','players'),toplistRowIdentity(rawAlias,rawAlias+'_p7','players'));
 }
 const row={identifier:rawAlias+'_p7',prefix:rawAlias,name:'Same player',guildIdentifier:literal};
 const target={sourcePlayerKey:server.code.toLowerCase()+'_p7',sourceScanId:'existing-source',scannedAtMs:1785667782930,scannedAtIso:null,guild:{name:'Same guild name',server:server.code,identifier:literal}};
 assert(matchesPlayerObservationRow(row,target),'profile handoff across a registered server alias');
 assert(!matchesPlayerObservationRow(row,{...target,sourcePlayerKey:'eu5_p7'}),'same numeric player on another server');
 const candidates=[{id:'one',name:'Same player',memberRef:rawAlias+'_p7',server:rawAlias},{id:'two',name:'Same player',memberRef:'eu5_p7',server:'EU5'}] as any;
 assert.deepEqual(selectTargetAnalyticsMembers(candidates,null,{name:'Same player',server:server.code,memberRef:null} as any).map(m=>m.id),['one']);
 const grouped=groupArchiveOverviewDays([rawAlias,server.code].map((value,i)=>({id:String(i),entry:{server:value,timestamp:1785667782930},localSummary:null})) as any,'UTC');
 assert.equal(grouped.length,1);assert.equal(grouped[0].members.length,2);
 // The data serializer and stored normalizer contracts stay literal.
 assert.equal(normalizeServerKeyFromInput(rawAlias),rawAlias.toUpperCase());
 assert.equal(normalizeGuildScanServer(rawAlias),rawAlias);
 const change={owner:'sources',kinds:['content'],sourceIds:['new-source'],removedSourceIds:[],servers:[rawAlias],unknownImpact:false} as any;
 assert(isLocalDataChangeRelevant(change,{servers:[server.code]}));
 assert(!isLocalDataChangeRelevant(change,{servers:['EU5']}));
 for(const other of LOCAL_SERVER_REGISTRY.filter(s=>s.type==='named'&&s.code!==server.code)){
  assert(!isNormalizedGuildMemberInGuild({server:rawAlias,guildSegment:'g42',groupSegment:null,guildName:'Same guild name'},{server:other.code,guildSegment:'42',name:'Same guild name'}));
  assert.equal(listGuildHubLocalGuildsForServerFromScanSummaries([summary],other.code).length,0);
  assert(!createAnalyticsScopeMatcher({servers:[other.code]})(summary));
 }
 assert(!isDerivedGuildSnapshotForGuild({server:rawAlias,guildSegment:'g42',guildName:'Same guild name'},{server:'unknown_server_net',guildId:'42',name:'Same guild name'}));
 matrix.push({server:server.code,variants:[...new Set(variants)],status:'passed'});
}
assert.equal(matrix.length,4);
assert.equal(serverComparisonKey('s5_eu'),'EU5');assert.equal(serverComparisonKey('f28_net'),'F28');
assert.notEqual(serverComparisonKey('F1'),serverComparisonKey('MAERWYNN'),'fusion history is not an alias');
assert.notEqual(serverComparisonKey('EU3'),serverComparisonKey('F28'));
assert.notEqual(serverComparisonKey('invented_name_net'),serverComparisonKey('BLACKFOREST'));
assert.equal(resolveServer('Black Forest Extra'),null,'no invented similar-name alias');
console.log(JSON.stringify({passed:true,matrix},null,2));
