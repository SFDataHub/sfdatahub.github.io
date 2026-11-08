export type HubSearchExecutionOptions = { allowed?: () => boolean; signal?: AbortSignal };
const SLICE_MS = 6;
const SLICE_STEPS = 256;

export function checkHubSearchExecution(options: HubSearchExecutionOptions) {
  if (options.signal?.aborted || options.allowed?.() === false) throw new DOMException("aborted", "AbortError");
}

/** A step includes reader preparation or one projected occurrence. Timer tasks
 * let input, rendering and committed invalidations run within a single source.
 * This driver never owns an IndexedDB transaction or a writer lease. */
export async function runHubSearchWork<T>(work: Generator<unknown, T>, options: HubSearchExecutionOptions): Promise<T> {
  try {
    for (;;) {
      checkHubSearchExecution(options);
      const started = performance.now();
      let steps = 0;
      for (;;) {
        const next = work.next();
        steps++;
        if (next.done) { checkHubSearchExecution(options); return next.value; }
        if (steps % 16 === 0) {
          checkHubSearchExecution(options);
          if (steps >= SLICE_STEPS || performance.now() - started >= SLICE_MS) break;
        }
      }
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      checkHubSearchExecution(options);
    }
  } finally {
    // Releases the reader, row maps and partial documents on every exit.
    work.return(undefined as T);
  }
}
