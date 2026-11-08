import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { openDB } from 'idb';
import { seedLocalSourceValidityFixture } from './localSourceValidityFixture.mts';
import { deriveGuildHubLogicalScanSnapshots } from '../../src/lib/guilds/localScanLibrary.ts';
import { createScanCoverageOptions, analyzeScanCoverageSelection } from '../../src/lib/guilds/scanCoverageAnalysis.ts';
import { deriveGuildCoverageForLogicalSnapshot } from '../../src/lib/guilds/guildCoverage.ts';
import { buildScanArchiveBatches } from '../../src/lib/scanArchive/archiveBuilderCore.ts';

const times=[Date.UTC(2026,8,1),Date.UTC(2026,8,2)];
const rawData={players:times.flatMap((timestamp,i)=>Array.from({length:i+1},(_,j)=>({identifier:`f8_net_p${j+1}`,prefix:'f8_net',timestamp,name:`Player ${i}-${j}`,level:100,rank:j+1,class:1,guildIdentifier:'f8_net_g1',guildName:'Coverage guild'}))),groups:times.map((timestamp,i)=>({identifier:'f8_net_g1',prefix:'f8_net',timestamp,name:'Coverage guild',memberCount:i+1}))};
const {scan}=await seedLocalSourceValidityFixture({id:'w14-coverage',filename:'w14-coverage.json',contentHash:'w14-coverage',importedAt:new Date(times[1]).toISOString(),scannedAt:new Date(times[1]).toISOString(),servers:['f8_net'],playerCount:3,groupCount:2,rawData});
const db=await openDB('sfdatahub-local-data');
try {
  const summary=await db.get('scanSummaries',scan.id);
  assert(summary);
  const options=createScanCoverageOptions(summary,scan);
  assert.equal(options.length,2);
  for(let i=0;i<options.length;i++) {
    const option=options[i];
    const index=times.indexOf(option.timestampMs!);
    assert.notEqual(index,-1);
    const result=analyzeScanCoverageSelection(scan,option);
    assert.equal(result.playerCount,index+1);
    assert.equal(result.rankedPlayers.length,index+1);
    assert(result.rankedPlayers.every(p=>p.name.startsWith(`Player ${index}-`)));
  }
  console.log('PASS actual multitime library -> coverage options -> selected actual rows/ranks');
  const snapshots=deriveGuildHubLogicalScanSnapshots(scan);
  for(const snapshot of snapshots) {
    const coverage=deriveGuildCoverageForLogicalSnapshot(snapshot);
    assert.equal(coverage.length,1);
    assert.equal(coverage[0].status,'complete');
    assert.equal(coverage[0].countedMemberCount,times.indexOf(snapshot.timestampMs!)+1);
  }
  console.log('PASS actual library logical snapshots -> guild coverage without cross-time roster union');
  const batches=buildScanArchiveBatches(JSON.stringify(rawData),2026);
  assert.equal(batches.length,2);
  assert.deepEqual(batches.map(b=>b.timestamp).sort(),times);
  console.log('PASS existing archive builder parses supported multitime Raw; no archive/export files generated');
} finally {db.close();}
