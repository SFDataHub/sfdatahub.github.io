import { auditCurrent, auditSpan, auditSpanEnd, auditEvent, auditCall } from "../data-hub/runtimeAudit";
// One origin-wide order, shared by Window and Worker navigators. All acquisition,
// normalization and CPU derivation precede this short critical section.
export const LOCAL_DATA_WRITE_LOCK = "sfdatahub:local-data:write:v1";
const activeLeases = new WeakSet<object>();
declare const leaseBrand: unique symbol;
export type LocalDataWriteLease = { readonly [leaseBrand]: true };

export function assertLocalDataWriteLease(lease: LocalDataWriteLease) {
  if (!activeLeases.has(lease)) throw new Error("Local data write lease is no longer valid.");
}

export async function withLocalDataWrite<T>(
  write: (lease: LocalDataWriteLease) => Promise<T>,
  options: { signal?: AbortSignal; lease?: LocalDataWriteLease } = {},
): Promise<T> {
  const audit = auditCurrent();
  if (options.lease) {
    auditEvent(audit, "write-lease-reused");
    assertLocalDataWriteLease(options.lease);
    return write(options.lease);
  }
  const locks = globalThis.navigator?.locks;
  if (!locks) throw new Error("Coordinated local writes require the Web Locks API in a secure context.");
  const lockWait = auditSpan(audit, "lock-wait", "lock-wait");
  return locks.request(LOCAL_DATA_WRITE_LOCK, { mode: "exclusive", ...(options.signal ? { signal: options.signal } : {}) }, async () => {
    auditSpanEnd(audit, lockWait);
    const lockHold = auditSpan(audit, "lock-hold", "async-container");
    const lease = {} as LocalDataWriteLease;
    activeLeases.add(lease);
    try { return await (audit ? auditCall(audit, "write-lock-callback", () => write(lease), "async-container") : write(lease)); } finally { auditSpanEnd(audit, lockHold); activeLeases.delete(lease); }
  });
}
