import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  where,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type {
  AdminAuditAction,
  AdminAuditEvent,
} from "../types/adminAudit";

const AUDIT_COLLECTION = "admin_audit_log";
const DEFAULT_PAGE_SIZE = 50;

export type LogAdminAuditEventInput = Omit<AdminAuditEvent, "id" | "createdAt">;

export async function logAdminAuditEvent(
  input: LogAdminAuditEventInput,
): Promise<void> {
  await addDoc(collection(db, AUDIT_COLLECTION), {
    ...input,
    createdAt: serverTimestamp(),
  });
}

export type ListAdminAuditEventsOptions = {
  limit?: number;
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
  actorUserId?: string;
  targetUserId?: string;
  action?: AdminAuditAction;
};

export type ListAdminAuditEventsResult = {
  events: AdminAuditEvent[];
  nextPageCursor: QueryDocumentSnapshot<DocumentData> | null;
};

export async function listAdminAuditEvents(
  options: ListAdminAuditEventsOptions = {},
): Promise<ListAdminAuditEventsResult> {
  const {
    limit: limitValue = DEFAULT_PAGE_SIZE,
    cursor = null,
    actorUserId,
    targetUserId,
    action,
  } = options;

  const queryLimit = Math.max(1, Math.min(limitValue, 100));
  const constraints: QueryConstraint[] = [];

  if (actorUserId) {
    constraints.push(where("actorUserId", "==", actorUserId));
  }
  if (targetUserId) {
    constraints.push(where("targetUserId", "==", targetUserId));
  }
  if (action) {
    constraints.push(where("action", "==", action));
  }
  constraints.push(orderBy("createdAt", "desc"));
  if (cursor) {
    constraints.push(startAfter(cursor));
  }
  constraints.push(limit(queryLimit));

  const snapshot = await getDocs(query(collection(db, AUDIT_COLLECTION), ...constraints));
  const events = snapshot.docs.map(mapAuditEvent);

  const nextPageCursor =
    snapshot.size < queryLimit ? null : snapshot.docs[snapshot.docs.length - 1] ?? null;

  return { events, nextPageCursor };
}

export async function listAdminAuditEventsForUser(
  targetUserId: string,
  limitValue = 10,
) {
  return listAdminAuditEvents({ targetUserId, limit: limitValue });
}

function mapAuditEvent(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): AdminAuditEvent {
  const data = snapshot.data() as Omit<AdminAuditEvent, "id">;
  return {
    id: snapshot.id,
    ...data,
  };
}
