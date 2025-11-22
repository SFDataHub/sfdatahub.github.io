import type { Timestamp } from "firebase/firestore";

export type AdminAuditAction =
  | "user.role.update"
  | "user.status.update"
  | "user.notes.update";

export type AdminAuditChangeSet = Record<
  string,
  {
    before: unknown;
    after: unknown;
  }
>;

export interface AdminAuditEvent {
  id: string;
  createdAt?: Timestamp | null;
  actorUserId: string;
  actorDisplayName?: string | null;
  targetUserId: string;
  action: AdminAuditAction;
  summary: string;
  changes: AdminAuditChangeSet;
  context: string;
}
