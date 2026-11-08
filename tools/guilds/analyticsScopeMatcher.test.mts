import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { createAnalyticsScopeMatcher, isSummaryInAnalyticsScope } from '../../src/lib/local-data/localDataDependencies.ts';
import type { LocalDataDependencies } from '../../src/lib/local-data/localDataChanges.ts';
import type { GuildHubScanSummary } from '../../src/lib/guilds/localScanLibrary.ts';
import { legacySummaryInAnalyticsScope } from './fixtures/analyticsScopeLegacy.ts';
import { linkPlayerIdentifiers } from '../../src/lib/identities/playerIdentityStore.ts';
import { linkGuildAliases } from '../../src/lib/identities/guildIdentityStore.ts';
import { loadIdentityResolutionSnapshot, resolvePlayerIdentity, resolveGuildIdentity } from '../../src/lib/identities/identityResolution.ts';

type Scope = NonNullable<LocalDataDependencies['sourceScope']>;
const summary = (id: string, guilds: string[], servers: string[], slices?: unknown[], extra = {}) => ({
  sourceScanId: id, guilds: guilds.map(guildIdentifier => ({guildIdentifier, server: servers[0]})), servers,
  fusionInventorySlices: slices, ...extra,
} as unknown as GuildHubScanSummary);
const slice = (players?: string[], guilds?: string[]) => ({playerIdentifiers: players, guildIdentifiers: guilds, server: 'f8_net', playerCount: 3, guildCount: 2});
const sources = [
  summary('literal', ['f8_net_g1'], ['f8_net'], [slice(['f8_net_p1'], ['f8_net_g1'])]),
  summary('historical', ['f7_net_g1'], ['f7_net'], [slice(['f7_net_p1'], ['f7_net_g1'])]),
  summary('read-alias', ['IDENTIFIER:F8_G1'], ['F8.SFGAME.NET'], [slice(['identifier:F8-P1', 'IDENTIFIER:F8_P1'], ['f8_g1'])]),
  summary('same-number-other-server', ['eu8_g1'], ['eu8'], [slice(['eu8_p1'], ['eu8_g1'])]),
  summary('other-namespace', ['f8_net_g1'], ['f8_net'], [slice(['f8_net_g2'], ['f8_net_p2'])]),
  summary('s-eu-alias', ['s3_eu_g9'], ['s3.sfgame.eu'], [slice(['S3_P9'], ['EU3_G9'])]),
  summary('missing', [], ['f8_net']),
  summary('empty-slices', [], ['f8_net'], []),
  summary('missing-arrays', [], ['f8_net'], [slice()]),
  summary('guilds-only', [], ['f7_net'], [slice(undefined, ['f8_net_g1'])]),
  summary('known-empty', [], ['f8_net'], [slice([], [])]),
  summary('incomplete', [], ['f8_net'], [slice(['f8_net_p2'], [])]),
  summary('mixed-known', [], ['f8_net'], [slice([], []), slice(undefined, [])]),
  summary('unknown-server', [], []),
  summary('mixed', ['foreign_g1', 'f7_net_g1'], ['eu9', 'f7_net'], [slice(['foreign_p1'], []), slice(['f8_net_p1'], [])]),
  summary('duplicates', ['f8_g1', 'f8_g1'], ['f8', 'f8'], [slice(['f8_p1', 'f8_p1'], ['f8_g1', 'f8_g1'])]),
  summary('disabled', ['f8_net_g1'], ['f8_net'], [slice(['f8_net_p1'], [])], {analyticsEnabled:false}),
  summary('unknown-literal', ['unrecognized_g1'], [], [slice(['unrecognized_p1'], [])]),
];
const refs = ['f8_net_p1', 'identifier:F8_P1', 'f7_net_p1', 'eu8_p1', 'f8_net_g2', 's3_eu_p9', ' unrecognized_p1 ', 'unrecognized_p1', 'f8_net_p01', ''];
const guildRefs = ['f8_net_g1','IDENTIFIER:F8_G1','f7_net_g1','eu8_g1','f8_net_p2','eu3_g9','unrecognized_g1',''];
const scopes: Scope[] = [{}, {players:[],guilds:[],servers:[]}, ...refs.map(ref=>({players:[ref]})), ...guildRefs.map(ref=>({guilds:[ref]})), ...['f8','F8.SFGAME.NET','f7_net','s3','eu3_eu','foreign',''].map(server=>({servers:[server]}))];
for (const player of refs) for (const guild of guildRefs) scopes.push({players:[player, player],guilds:[guild, guild],servers:['f8_net']});
let decisions = 0;
for(const scope of scopes) {
  const matcher=createAnalyticsScopeMatcher(scope);
  for(const source of sources) {
    const expected=legacySummaryInAnalyticsScope(source,scope);
    assert.equal(matcher(source),expected,JSON.stringify({source:source.sourceScanId,scope}));
    assert.equal(isSummaryInAnalyticsScope(source,scope),expected);
    decisions++;
  }
  for(const order of [sources,[...sources].reverse()]) {
    assert.deepEqual(order.filter(matcher).map(s=>s.sourceScanId),order.filter(s=>legacySummaryInAnalyticsScope(s,scope)).map(s=>s.sourceScanId));
  }
  const reordered={players:scope.players?.slice().reverse(),guilds:scope.guilds?.slice().reverse(),servers:scope.servers?.slice().reverse()};
  assert.deepEqual(sources.map(createAnalyticsScopeMatcher(reordered)),sources.map(matcher));
}
assert.equal(createAnalyticsScopeMatcher({players:['f8_net_p1']})(sources[3]),false,'numeric ID never bridges namespaces');
assert.equal(createAnalyticsScopeMatcher({players:['f8_net_p1']})(sources[1]),false,'history requires confirmed identity');
const unlinked=createAnalyticsScopeMatcher({players:['f8_net_p1'],guilds:['f8_net_g1']});
await linkPlayerIdentifiers('f7_net_p1','f8_net_p1',{source:'manual'});
await linkGuildAliases('f7_net_g1','f8_net_g1',{source:'manual'});
const snapshot=await loadIdentityResolutionSnapshot();
const linkedScope={players:resolvePlayerIdentity(snapshot,'f8_net_p1').aliasIdentifiers,guilds:resolveGuildIdentity(snapshot,'f8_net_g1').aliasIdentifiers};
const linked=createAnalyticsScopeMatcher(linkedScope);
assert.equal(linked(sources[1]),true,'confirmed historical fusion');
assert.equal(unlinked(sources[1]),false,'old identity snapshot stays independent; new acquisition uses linked scope');
assert.deepEqual(sources.filter(linked),sources.filter(s=>legacySummaryInAnalyticsScope(s,linkedScope)));
const mutable={players:['f8_net_p1'],guilds:[] as string[],servers:[] as string[]} satisfies Scope;
const old=createAnalyticsScopeMatcher(mutable);
mutable.players![0]='eu8_p1';mutable.servers!.push('eu8');
const fresh=createAnalyticsScopeMatcher(mutable);
assert.equal(old(sources[0]),true,'matcher captures target snapshot');
assert.equal(old(sources[3]),false);
assert.equal(fresh(sources[0]),false,'new selection has new target set');
assert.equal(fresh(sources[3]),true);
assert.equal(createAnalyticsScopeMatcher({guilds:['f7_net_g1']})(sources[0]),false,'separate scopes never share sets');
const changedSource=summary('same-id-new-generation',[],['f8_net'],[slice(['f8_net_p2'],[])]);
const generationMatcher=createAnalyticsScopeMatcher({players:['f8_net_p1']});
assert.equal(generationMatcher(changedSource),false);
changedSource.fusionInventorySlices![0].playerIdentifiers=['f8_net_p1'];
assert.equal(generationMatcher(changedSource),true,'same source ID with new metadata is evaluated again');
assert.equal(generationMatcher(changedSource),legacySummaryInAnalyticsScope(changedSource,{players:['f8_net_p1']}));
console.log(`PASS ${decisions} independent legacy decisions, ordered source selection, canonical/read aliases, namespaces, missing/empty/incomplete inventories, confirmed identity fusion and scope snapshots`);
