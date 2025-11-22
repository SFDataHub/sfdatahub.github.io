import { Timestamp } from "firebase/firestore";

import { AUTH_BASE_URL } from "../lib/auth/config";
import type { AdminAuditAction, AdminAuditEvent } from "../types/adminAudit";

const ADMIN_AUDIT_ENDPOINT = AUTH_BASE_URL ? `${AUTH_BASE_URL}/admin/audit-events` : "";
const DEFAULT_LIMIT = 50;

export type ListAdminAuditEventsOptions = {
  limit?: number;
  cursor?: string | null;
  actorUserId?: string;
  targetUserId?: string;
  action?: AdminAuditAction;
};

export type ListAdminAuditEventsResult = {
  events: AdminAuditEvent[];
  nextPageCursor: string | null;
};

type AdminAuditEventApiPayload = {
  id: string;
  createdAt: number | null;
  actorUserId: string;
  actorDisplayName?: string | null;
  targetUserId: string;
  action: AdminAuditAction;
  summary: string;
  changes: AdminAuditEvent["changes"];
  context: string;
};

type ListAdminAuditEventsApiResponse = {
  events: AdminAuditEventApiPayload[];
  nextPageCursor: string | null;
};

const ensureAuditEndpoint = () => {
  if (!ADMIN_AUDIT_ENDPOINT) {
    throw new Error("Admin API base URL missing (set VITE_AUTH_BASE_URL).");
  }
};

const toTimestamp = (value?: number | null): Timestamp | null => {
  if (typeof value !== "number") return null;
  return Timestamp.fromMillis(value);
};

const mapAuditEvent = (payload: AdminAuditEventApiPayload): AdminAuditEvent => ({
  id: payload.id,
  createdAt: toTimestamp(payload.createdAt),
  actorUserId: payload.actorUserId,
  actorDisplayName: payload.actorDisplayName ?? null,
  targetUserId: payload.targetUserId,
  action: payload.action,
  summary: payload.summary,
  changes: payload.changes ?? {},
  context: payload.context,
});

const buildQuery = (options: ListAdminAuditEventsOptions): string => {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit ?? DEFAULT_LIMIT));
  if (options.cursor) {
    params.set("cursor", options.cursor);
  }
  if (options.actorUserId) {
    params.set("actorUserId", options.actorUserId);
  }
  if (options.targetUserId) {
    params.set("targetUserId", options.targetUserId);
  }
  if (options.action) {
    params.set("action", options.action);
  }
  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
};

const parseError = async (response: Response): Promise<Error> => {
  let message = `Request failed (${response.status})`;
  try {
    const payload = await response.json();
    if (payload?.error) {
      message = payload.error;
    }
  } catch {
    // ignore
  }
  return new Error(message);
};

export async function listAdminAuditEvents(
  options: ListAdminAuditEventsOptions = {},
): Promise<ListAdminAuditEventsResult> {
  ensureAuditEndpoint();
  const url = `${ADMIN_AUDIT_ENDPOINT}${buildQuery(options)}`;
  const response = await fetch(url, {
    credentials: "include",
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as ListAdminAuditEventsApiResponse;
  return {
    events: payload.events.map(mapAuditEvent),
    nextPageCursor: payload.nextPageCursor ?? null,
  };
}

export async function listAdminAuditEventsForUser(
  targetUserId: string,
  limitValue = 10,
) {
  return listAdminAuditEvents({ targetUserId, limit: limitValue });
}
