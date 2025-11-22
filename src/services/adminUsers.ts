import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  updateDoc,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type {
  AdminUser,
  AdminUserRole,
  AdminUserStatus,
} from "../types/adminUser";
import { logAdminAuditEvent } from "./adminAuditLog";
import type { AdminAuditAction, AdminAuditChangeSet } from "../types/adminAudit";

const USERS_COLLECTION = "users";
const DEFAULT_PAGE_SIZE = 25;
const MAX_FETCH_BATCHES = 4;
const AUDIT_CONTEXT = "control-panel/users";
const ROLE_ORDER: AdminUserRole[] = ["admin", "mod", "creator", "user"];

export type ListAdminUsersOptions = {
  pageSize?: number;
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
  role?: AdminUserRole;
  status?: AdminUserStatus;
  provider?: "discord" | "google";
  search?: string;
};

export type ListAdminUsersResult = {
  users: AdminUser[];
  nextPageCursor: QueryDocumentSnapshot<DocumentData> | null;
};

export async function listAdminUsers(
  options: ListAdminUsersOptions = {},
): Promise<ListAdminUsersResult> {
  const {
    pageSize = DEFAULT_PAGE_SIZE,
    cursor = null,
    role,
    status,
    provider,
    search,
  } = options;

  const normalizedPageSize = Math.max(1, Math.min(pageSize, 100));
  const colRef = collection(db, USERS_COLLECTION);

  const constraints: QueryConstraint[] = [
    orderBy("createdAt", "desc"),
    orderBy("userId", "desc"),
  ];

  if (role) {
    constraints.unshift(where("roles", "array-contains", role));
  }

  let statusNeedsClientFilter = false;
  if (status && status !== "active") {
    constraints.unshift(where("status", "==", status));
  } else if (status === "active") {
    statusNeedsClientFilter = true;
  }

  const needsClientFilters = Boolean(provider || search || statusNeedsClientFilter);
  const batchSize = Math.min(
    normalizedPageSize * (needsClientFilters ? 3 : 1),
    75,
  );

  const trimmedSearch = search?.trim().toLowerCase() ?? "";
  const effectiveStatusFilter = statusNeedsClientFilter ? "active" : undefined;

  const matchesFilters = (user: AdminUser): boolean => {
    if (provider && !matchesProvider(user, provider)) {
      return false;
    }
    if (trimmedSearch && !matchesSearch(user, trimmedSearch)) {
      return false;
    }
    if (effectiveStatusFilter && normalizeStatus(user.status) !== effectiveStatusFilter) {
      return false;
    }
    return true;
  };

  const users: AdminUser[] = [];
  let anchor: QueryDocumentSnapshot<DocumentData> | null = cursor;
  let nextCursor: QueryDocumentSnapshot<DocumentData> | null = null;
  let reachedEnd = false;

  for (let i = 0; i < MAX_FETCH_BATCHES && users.length < normalizedPageSize; i += 1) {
    const pageConstraints = [...constraints];
    if (anchor) {
      pageConstraints.push(startAfter(anchor));
    }
    pageConstraints.push(limit(batchSize));

    const snapshot = await getDocs(query(colRef, ...pageConstraints));
    if (snapshot.empty) {
      reachedEnd = true;
      nextCursor = null;
      break;
    }

    snapshot.docs.forEach((docSnap) => {
      const user = toAdminUser(docSnap);
      if (!needsClientFilters || matchesFilters(user)) {
        users.push(user);
      }
    });

    anchor = snapshot.docs[snapshot.docs.length - 1];
    nextCursor = anchor;

    if (snapshot.size < batchSize) {
      reachedEnd = true;
      break;
    }
  }

  return {
    users: users.slice(0, normalizedPageSize),
    nextPageCursor: reachedEnd ? null : nextCursor,
  };
}

export async function getAdminUserById(userId: string): Promise<AdminUser> {
  const ref = doc(db, USERS_COLLECTION, userId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    throw new Error("User not found");
  }
  return toAdminUser(snapshot);
}

export type UpdateAdminUserInput = {
  roles?: AdminUserRole[];
  status?: AdminUserStatus;
  notes?: string | null;
};

export type UpdateAdminUserContext = {
  actorUserId: string;
  actorDisplayName?: string | null;
};

export async function updateAdminUser(
  userId: string,
  updates: UpdateAdminUserInput,
  context: UpdateAdminUserContext,
): Promise<AdminUser> {
  const ref = doc(db, USERS_COLLECTION, userId);
  const beforeSnapshot = await getDoc(ref);
  if (!beforeSnapshot.exists()) {
    throw new Error("User not found");
  }

  const beforeUser = toAdminUser(beforeSnapshot);
  const payload: Record<string, unknown> = {};

  if (updates.roles) {
    payload.roles = normalizeRoles(updates.roles);
  }

  if (typeof updates.status !== "undefined") {
    payload.status = updates.status;
  }

  if ("notes" in updates) {
    payload.notes = updates.notes ?? null;
  }

  if (!Object.keys(payload).length) {
    return beforeUser;
  }

  await updateDoc(ref, payload);

  const afterSnapshot = await getDoc(ref);
  const updatedUser = toAdminUser(afterSnapshot);

  const changes = computeChangeSet(beforeUser, updatedUser, payload);
  if (Object.keys(changes).length && context.actorUserId) {
    const action = resolveAuditAction(changes);
    const summary = formatAuditSummary(changes);
    await logAdminAuditEvent({
      actorUserId: context.actorUserId,
      actorDisplayName: context.actorDisplayName,
      targetUserId: updatedUser.userId,
      action,
      summary,
      changes,
      context: AUDIT_CONTEXT,
    });
  }

  return updatedUser;
}

function toAdminUser(
  snapshot: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>,
): AdminUser {
  const raw = snapshot.data();
  if (!raw) {
    throw new Error("User payload missing");
  }
  const data = raw as Omit<AdminUser, "id">;
  const rawRoles = Array.isArray(data.roles) ? (data.roles as AdminUserRole[]) : ["user"];
  return {
    id: snapshot.id,
    roles: normalizeRoles(rawRoles),
    displayName: data.displayName ?? null,
    avatarUrl: data.avatarUrl ?? null,
    userId: data.userId ?? snapshot.id,
    primaryProvider: data.primaryProvider ?? "discord",
    providers: data.providers,
    profile: data.profile,
    createdAt: data.createdAt,
    lastLoginAt: data.lastLoginAt ?? null,
    status: data.status,
    notes: data.notes ?? null,
  };
}

function matchesProvider(user: AdminUser, provider: "discord" | "google") {
  if (user.primaryProvider === provider) {
    return true;
  }
  return Boolean(user.providers?.[provider]);
}

function matchesSearch(user: AdminUser, term: string) {
  const haystack = [
    user.userId,
    user.displayName ?? undefined,
    user.profile?.displayName ?? undefined,
    user.providers?.discord?.displayName,
    user.providers?.google?.displayName,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  return haystack.some((value) => value.includes(term));
}

function normalizeRoles(input: AdminUserRole[]): AdminUserRole[] {
  const set = new Set<AdminUserRole>(["user"]);
  input.forEach((role) => {
    if (ROLE_ORDER.includes(role)) {
      set.add(role);
    }
  });
  return [...set].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
}

function normalizeStatus(status?: AdminUserStatus): AdminUserStatus {
  return status ?? "active";
}

function computeChangeSet(
  before: AdminUser,
  after: AdminUser,
  payload: Record<string, unknown>,
): AdminAuditChangeSet {
  const changes: AdminAuditChangeSet = {};

  if ("roles" in payload && !arrayEquals(before.roles, after.roles)) {
    changes.roles = { before: before.roles, after: after.roles };
  }

  if ("status" in payload) {
    const prev = normalizeStatus(before.status);
    const next = normalizeStatus(after.status);
    if (prev !== next) {
      changes.status = { before: prev, after: next };
    }
  }

  if ("notes" in payload) {
    const prev = before.notes ?? "";
    const next = after.notes ?? "";
    if (prev !== next) {
      changes.notes = { before: before.notes ?? null, after: after.notes ?? null };
    }
  }

  return changes;
}

function resolveAuditAction(changes: AdminAuditChangeSet): AdminAuditAction {
  if (changes.roles) return "user.role.update";
  if (changes.status) return "user.status.update";
  return "user.notes.update";
}

function formatAuditSummary(changes: AdminAuditChangeSet): string {
  const parts: string[] = [];
  if (changes.roles) {
    parts.push(`roles: ${JSON.stringify(changes.roles.before)} -> ${JSON.stringify(changes.roles.after)}`);
  }
  if (changes.status) {
    parts.push(`status: "${changes.status.before}" -> "${changes.status.after}"`);
  }
  if (changes.notes) {
    parts.push("notes updated");
  }
  return parts.join(" | ");
}

function arrayEquals(a: AdminUserRole[], b: AdminUserRole[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}
