import {start} from './proof.js';
self.onmessage = async ({data}) => {
  postMessage('workerReady');
  await start(data.id, data.hold, () => postMessage('workerEntered'), () => {});
  postMessage('workerDone');
};
