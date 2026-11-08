// Supplementary Node tests only: deterministic single-realm lock scheduler.
// Cross-realm acceptance exclusively uses the isolated real-browser test.
const queues = new Map();
Object.defineProperty(globalThis.navigator, 'locks', { configurable:true, value: {
  async request(name, options, callback) {
    if (typeof options === 'function') {callback = options; options = {};}
    if (options.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const previous = queues.get(name) ?? Promise.resolve();
    let release;
    const tail = new Promise(resolve => release = resolve);
    queues.set(name, tail);
    await previous;
    try {
      if (options.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      return await callback({ name, mode: 'exclusive' });
    } finally {release(); if (queues.get(name) === tail) queues.delete(name);}
  }
}});
