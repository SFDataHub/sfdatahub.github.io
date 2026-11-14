import type { Hit } from "./metrics";

// A planned handoff is neither a provider failure nor a completed snapshot.
export class VisitorContinuationPause extends Error {
  constructor() { super("Visitor continuation checkpoint required"); }
}
export const isVisitorContinuationPause = (error: unknown) => error instanceof VisitorContinuationPause;

export type QueryState =
  | { kind: "hits"; page: number; done: boolean; rows: Hit[] }
  | { kind: "sizes"; page: number; done: boolean; rows: Array<{ id: string; count: number }> };

export interface VisitorJournal {
  get(key: string): QueryState | undefined;
  put(key: string, value: QueryState): Promise<void>;
}

export type VisitorPublicationHooks = {
  workOwner?: string;
  preparePublication?: () => {
    writes: Array<{ ref: FirebaseFirestore.DocumentReference; value: Record<string, unknown> }>;
    configPatch: Record<string, unknown>;
    committed: () => void;
  };
  assertCurrent?: (document: FirebaseFirestore.DocumentData | undefined) => void;
};
