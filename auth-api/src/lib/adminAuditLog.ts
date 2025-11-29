import type { LogLevel } from "../types/logs";

import { admin, db } from "../firebase";

export const ADMIN_AUDIT_COLLECTION = "admin_audit_log";
export const ADMIN_AUDIT_CONTEXT_USERS = "control-panel/users";
export const ADMIN_AUDIT_CONTEXT_ACCESS = "control-panel/access";

export type AdminAuditChangeEntry = {
  before: unknown;
  after: unknown;
};

export type AdminAuditChangeSet = Record<string, AdminAuditChangeEntry>;

export type AdminAuditLogPayload = {
  action: string;
  context: string;
  actorUserId: string;
  actorDisplayName: string | null;
  summary: string;
  changes: AdminAuditChangeSet;
  level?: LogLevel;
  targetUserId?: string;
  targetFeatureId?: string;
};

export const writeAdminAuditLog = async (payload: AdminAuditLogPayload) => {
  await db.collection(ADMIN_AUDIT_COLLECTION).add({
    ...payload,
    level: payload.level ?? "info",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
};

export const fetchAdminUserDisplayName = async (
  userId: string,
): Promise<string | null> => {
  if (!userId) return null;
  try {
    const snapshot = await db.collection("users").doc(userId).get();
    if (!snapshot.exists) {
      return null;
    }
    const data = snapshot.data() as {
      profile?: { displayName?: string };
      displayName?: string;
    };
    if (!data) return null;
    return data.profile?.displayName ?? data.displayName ?? null;
  } catch {
    return null;
  }
};
