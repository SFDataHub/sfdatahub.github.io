const db = new Promise((resolve, reject) => {
  const request = indexedDB.open('w04-platform-proof', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('log', {autoIncrement:true});
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function write(value) {
  const tx = (await db).transaction('log', 'readwrite');
  tx.objectStore('log').add(value);
  await new Promise((resolve,reject) => {tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);});
}
export async function start(id, hold, entered, release) {
  return navigator.locks.request('sfdatahub:local-data:write:v1', async () => {
    await write(id + ':enter');
    let resume;
    const gate = new Promise(resolve => resume = resolve);
    release(resume);
    entered();
    if (hold) await gate;
    await write(id + ':exit');
  });
}
export async function readLog() {
  const request = (await db).transaction('log').objectStore('log').getAll();
  return new Promise((resolve,reject) => {request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);});
}
