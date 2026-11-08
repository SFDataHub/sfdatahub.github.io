import { auditCurrent, auditSpan, auditSpanEnd, auditEvent } from "../data-hub/runtimeAudit";
import type { IDBPDatabase, IDBPTransaction, StoreNames, IDBPObjectStore } from "idb";
import { withLocalDataWrite, type LocalDataWriteLease } from "./localDataCoordination";
import { LOCAL_CHANGES_STORE, publishLocalDataChange, type LocalChangesSchema, type LocalDataChange, type LocalDataChangeInput } from "./localDataChanges";

export async function commitLocalDataMutation<DB extends LocalChangesSchema, T>(
  db: IDBPDatabase<DB>,
  stores: StoreNames<DB>[],
  change: LocalDataChangeInput | (() => LocalDataChangeInput | null),
  mutate: (tx: IDBPTransaction<DB, StoreNames<DB>[], "readwrite">) => Promise<T>,
  lease?: LocalDataWriteLease,
): Promise<T> {
  const audit = auditCurrent();
  return withLocalDataWrite(async () => {
    const transactionAudit = auditSpan(audit, "mutation-transaction", "async-container");
    const tx = db.transaction([...new Set([...stores, LOCAL_CHANGES_STORE as StoreNames<DB>])], "readwrite");
    void tx.done.catch(() => {});
    try {
      const result = await mutate(tx);
      const input = typeof change === "function" ? change() : change;
      let receipt: LocalDataChange | undefined;
      if (input) {
        receipt = { ...input, committedAt: new Date().toISOString() };
        const journal = tx.objectStore(LOCAL_CHANGES_STORE as StoreNames<DB>) as unknown as IDBPObjectStore<LocalChangesSchema, ["localChanges"], "localChanges", "readwrite">;
        receipt.sequence = await journal.add(receipt);
      }
      const durableAudit = auditSpan(audit, "transaction-done-wait");
      await tx.done;
      auditSpanEnd(audit, durableAudit);
      auditSpanEnd(audit, transactionAudit);
      auditEvent(audit, "durable-transaction-commit");
      if (receipt) publishLocalDataChange(receipt);
      return result;
    } catch (error) {
      try { tx.abort(); } catch { /* Already inactive. */ }
      await tx.done.catch(() => {});
      auditSpanEnd(audit, transactionAudit);
      throw error;
    }
  }, { lease });
}
