/* Explicit one-shot preview/apply for W281; never imported by application code. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stamp = doc => doc.updateTime.toDate().toISOString() + ':' + doc.updateTime.nanoseconds;
async function main() {
  const args = process.argv.slice(2), arg = name => args[args.indexOf(name) + 1];
  if (!args.includes('--project') || !args.includes('--plan')) throw Error('Usage: --project PROJECT --plan ABSOLUTE_EXTERNAL.json [--delete --ack-old-readers-reloaded]');
  const projectId = arg('--project'), planFile = arg('--plan');
  const repo = path.resolve(__dirname, '../..'), relative = path.relative(repo, path.resolve(planFile));
  if (!path.isAbsolute(planFile) || (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))) throw Error('Plan must be outside the product checkout');
  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore();
  const [visitor, youtube, lock] = await db.getAll(db.doc('visitor_metrics_public/bundled'), db.doc('creator_snapshots/creators-live.json'), db.doc('creator_sync/youtube'));
  if (visitor.data()?.schemaVersion !== 4 || visitor.data()?.complete !== true || !youtube.data()?.youtube?.sourcesFingerprint || !Array.isArray(lock.data()?.cacheLayout) || lock.data()?.owner || lock.data()?.expiresAt) throw Error('Successful bundled snapshots and idle YouTube sync required');
  const activeYT = new Set(lock.data().cacheLayout.map(prefix => 'creator_youtube_cache/b_' + (prefix || 'root')));
  const activeGC = new Set(visitor.data().bundles.map(bundle => 'visitor_metrics_public/bundled/pages/b_' + (bundle.prefix || 'root')));
  for (const fragment of visitor.data().fragments ?? []) activeGC.add('visitor_metrics_public/bundled/pages/' + fragment.id);
  const allowed = target => (/^creator_youtube_cache\/(?:UC[A-Za-z0-9_-]{22}|b_(?:root|[01]{1,256}))$/.test(target) && !activeYT.has(target)) ||
    /^analytics\/visitor_sync_lease\/page_hashes\/[0-9a-f]$/.test(target) ||
    target === 'visitor_metrics_public/live' || /^visitor_metrics_public\/live\/pages\/[a-f0-9]{64}$/.test(target) ||
    (/^visitor_metrics_public\/bundled\/pages\/(?:b_(?:root|[01]{1,256})|f_[a-f0-9]{64}_\d+)$/.test(target) && !activeGC.has(target));
  if (!args.includes('--delete')) {
    const entries = [];
    // Finite known namespaces only. Old hourly generations use visitor-generations.cjs.
    for (const collection of ['creator_youtube_cache', 'analytics/visitor_sync_lease/page_hashes', 'visitor_metrics_public/live/pages', 'visitor_metrics_public/bundled/pages']) {
      const docs = await db.collection(collection).get();
      for (const doc of docs.docs) {
        if (!allowed(doc.ref.path)) continue;
        if ((await doc.ref.listCollections()).length) throw Error('Unexpected descendants: ' + doc.ref.path);
        entries.push({ path: doc.ref.path, updateTime: stamp(doc) });
      }
    }
    const live = await db.doc('visitor_metrics_public/live').get();
    if (live.exists) {
      if (live.data().schemaVersion !== 3 || live.data().complete !== true) throw Error('Unknown live snapshot');
      if ((await live.ref.listCollections()).some(collection => collection.id !== 'pages')) throw Error('Unknown live descendants');
      entries.push({ path: live.ref.path, updateTime: stamp(live) });
    }
    fs.writeFileSync(planFile, JSON.stringify({ projectId, entries, digest: hash(entries) }, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ preview: true, plannedDeletes: entries.length, writes: 0, deletes: 0, planFile }));
    return;
  }
  if (!args.includes('--ack-old-readers-reloaded')) throw Error('Old readers must be reloaded before cleanup');
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  if (plan.projectId !== projectId || plan.digest !== hash(plan.entries) || new Set(plan.entries.map(entry => entry.path)).size !== plan.entries.length || plan.entries.some(entry => !allowed(entry.path))) throw Error('Invalid plan/project or currently active target');
  const present = [];
  for (let offset = 0; offset < plan.entries.length; offset += 400) {
    const entries = plan.entries.slice(offset, offset + 400);
    const docs = await db.getAll(...entries.map(entry => db.doc(entry.path)));
    for (let index = 0; index < docs.length; index++) if (docs[index].exists) {
      if (stamp(docs[index]) !== entries[index].updateTime) throw Error('Target changed since preview: ' + entries[index].path);
      present.push(docs[index]);
    }
  }
  for (let offset = 0; offset < present.length; offset += 400) {
    const batch = db.batch();
    for (const doc of present.slice(offset, offset + 400)) batch.delete(doc.ref, { lastUpdateTime: doc.updateTime });
    await batch.commit();
  }
  console.log(JSON.stringify({ deleted: present.length, bundledSnapshotsPreserved: true }));
}
if (require.main === module) main().catch(() => { console.error('Legacy snapshot cleanup failed; inspect the local plan and prerequisites.'); process.exitCode = 1; });
module.exports = { main };
