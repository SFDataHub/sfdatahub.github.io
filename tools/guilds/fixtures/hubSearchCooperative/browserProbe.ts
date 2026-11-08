// Test-server instrumentation only. No gates in the measured cost windows.
const proof: any = globalThis;
const jobs = new Map<string, any>();
proof.w16SourceStart = (source: string, cooperative = false) => {
  const window = proof.w14Metrics?.active;
  if (!window) return;
  const job = { source, rows: 0, actionScheduled: false, started: performance.now(), finished: null, slices: [] as any[], action: null as any };
  (window.sourceWork ??= []).push(job);
  jobs.set(source, job);
  if (cooperative) return;
  schedule(job, window);
};
function schedule(job: any, window: any) {
  if (job.actionScheduled) return;
  if (!window.name.startsWith('large-') || !window.name.endsWith('search-cold')) return;
  job.actionScheduled = true;
  const scheduled = performance.now();
  setTimeout(() => {
    const field = document.querySelector<HTMLInputElement>('[data-hub-search] input[type=search]');
    if (!field) throw Error('input missing during source work');
    field.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, 'Large');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    job.action = { scheduled, handled: performance.now(), beforeSourceComplete: job.finished === null,
      completedSlices: job.slices.length, completedRows: job.rows, value: field.value, focused: document.activeElement === field };
  }, 0);
}
proof.w16RowsStarted = (source: string) => {
  const job = jobs.get(source);
  if (job) { job.rows++; schedule(job, proof.w14Metrics.active); }
};
proof.w16SourceEnd = (source: string) => {
  const job = jobs.get(source);
  if (job) { job.finished = performance.now(); jobs.delete(source); }
};
proof.w16Slice = (started: number, steps: number, yielded: boolean) => {
  for (const job of jobs.values()) job.slices.push({ started, finished: performance.now(), steps, yielded });
};
proof.w16CommitStart = (source: string, started: number) => {
  const window = proof.w14Metrics?.active;
  if (window) (window.sourceCommits ??= []).push({ source, started, finished: null });
};
proof.w16CommitEnd = (source: string) => {
  const window = proof.w14Metrics?.active;
  const commit = window?.sourceCommits?.findLast((c: any) => c.source === source && c.finished === null);
  if (commit) commit.finished = performance.now();
};
proof.w16BrowserRaces = async () => (await import("./browserRaces")).run();
export {};
