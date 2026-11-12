/* One-shot operator tool. Preview by default; never called by the hourly job. */
const fs = require('node:fs');
const crypto = require('node:crypto');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const args = process.argv.slice(2);
const argument = name => args[args.indexOf(name) + 1];
const fail = message => { throw Error(message); };
const digest = entries => crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex');
const stamp = doc => doc.updateTime.toDate().toISOString() + ':' + doc.updateTime.nanoseconds;
async function main() {
  if (!args.includes('--project') || !args.includes('--plan')) fail('Usage: node tools/visitor-generations.cjs --project PROJECT --plan EXTERNAL.json [--delete --ack-old-readers-reloaded]');
  const projectId = argument('--project'), planFile = argument('--plan');
  initializeApp({ credential: applicationDefault(), projectId });
  const db = getFirestore(), collection = db.collection('visitor_metrics_public');
  const live = await collection.doc('live').get();
  if (!live.exists || live.data().schemaVersion !== 3 || live.data().complete !== true) fail('A successful live publication is required; no deletion');
  if (!args.includes('--delete')) {
    const current = await collection.doc('current').get();
    const roots = await collection.get();
    const entries = [];
    for (const root of roots.docs) {
      if (['live', 'current'].includes(root.id)) continue;
      const data = root.data();
      // Only the known hourly-generation format, never arbitrary collection data.
      if (!/^\d+-[0-9a-f-]{36}$/.test(root.id) || !Number.isFinite(data.createdAt) || !Number.isFinite(data.expiresAt)) fail('Unknown root requires manual review: ' + root.ref.path);
      const subcollections = await root.ref.listCollections();
      if (subcollections.some(sub => sub.id !== 'pages')) fail('Unknown subcollection: ' + root.ref.path);
      const pages = await root.ref.collection('pages').get();
      for (const page of pages.docs) {
        if (!/^[a-f0-9]{64}$/.test(page.id) || page.data().schemaVersion !== 2 || page.data().generation !== root.id || (await page.ref.listCollections()).length) fail('Unknown generation page: ' + page.ref.path);
        entries.push({ path: page.ref.path, updateTime: stamp(page) });
      }
      entries.push({ path: root.ref.path, updateTime: stamp(root) });
    }
    if (current.exists) {
      if (current.data().schemaVersion !== 2 || current.data().complete !== true) fail('Unknown legacy current pointer');
      entries.push({ path: current.ref.path, updateTime: stamp(current) });
    }
    const plan = { projectId, createdAt: new Date().toISOString(), liveSequence: live.data().sequence, entries, digest: digest(entries) };
    fs.writeFileSync(planFile, JSON.stringify(plan, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ preview: true, reads: 'live + current + generation roots + listed page documents; enumeration requests are separate', deletes: 0, plannedDeletes: entries.length, planFile }, null, 2));
    return;
  }
  if (!args.includes('--ack-old-readers-reloaded')) fail('Legacy open readers must be reloaded before explicit cleanup');
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  if (plan.projectId !== projectId || plan.digest !== digest(plan.entries) || live.data().sequence < plan.liveSequence) fail('Invalid plan/project/live state');
  const allowed = path => path === 'visitor_metrics_public/current' || /^visitor_metrics_public\/\d+-[0-9a-f-]{36}(\/pages\/[a-f0-9]{64})?$/.test(path);
  const paths = new Set();
  for (const entry of plan.entries) {
    if (!allowed(entry.path) || paths.has(entry.path)) fail('Invalid/duplicate plan target: ' + entry.path);
    paths.add(entry.path);
  }
  // Preflight the entire finite plan before deleting. Update-time preconditions
  // also protect each batch if an old backend is accidentally still publishing.
  const present = [];
  for (let offset = 0; offset < plan.entries.length; offset += 400) {
    const entries = plan.entries.slice(offset, offset + 400);
    if (!entries.length) continue;
    const docs = await db.getAll(...entries.map(entry => db.doc(entry.path)));
    for (let i = 0; i < docs.length; i++) if (docs[i].exists) {
      if (stamp(docs[i]) !== entries[i].updateTime) fail('Target changed since preview: ' + entries[i].path);
      present.push(docs[i]);
    }
  }
  for (let offset = 0; offset < present.length; offset += 400) {
    const batch = db.batch();
    for (const doc of present.slice(offset, offset + 400)) batch.delete(doc.ref, { lastUpdateTime: doc.updateTime });
    await batch.commit();
  }
  console.log(JSON.stringify({ deleted: present.length, livePreserved: true, legacyCurrentRemoved: paths.has('visitor_metrics_public/current') }));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
