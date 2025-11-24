import type { Request, Response } from "express";
import { Router } from "express";
import type { Query, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";

import { admin, db } from "../firebase";
import { requireAdmin, requireModerator } from "../middleware/auth";
import type { ProviderDocEntry, UserDoc } from "../users";

const USERS_COLLECTION = "users";
const AUDIT_COLLECTION = "admin_audit_log";
const DEFAULT_USERS_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_FETCH_BATCHES = 4;
const AUDIT_CONTEXT = "control-panel/users";
const ROLE_ORDER = ["admin", "mod", "creator", "user"] as const;

type AdminUserRole = (typeof ROLE_ORDER)[number];
type AdminUserStatus = "active" | "suspended" | "banned";

type AdminUserRecord = UserDoc & {
  status?: AdminUserStatus;
  notes?: string | null;
};

type AdminUserResponse = {
  id: string;
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  primaryProvider: string | null;
  roles: AdminUserRole[];
  providers?: Partial<Record<string, ProviderDocEntry>>;
  profile?: UserDoc["profile"];
  createdAt: number | null;
  lastLoginAt: number | null;
  status: AdminUserStatus;
  notes: string | null;
};

type AdminAuditChangeSet = Record<
  string,
  {
    before: unknown;
    after: unknown;
  }
>;

type AdminAuditEventResponse = {
  id: string;
  createdAt: number | null;
  actorUserId: string;
  actorDisplayName?: string | null;
  targetUserId: string;
  action: string;
  summary: string;
  changes: AdminAuditChangeSet;
  context: string;
};

type ListUsersQuery = {
  pageSize?: number;
  role?: AdminUserRole;
  status?: AdminUserStatus;
  provider?: "discord" | "google";
  search?: string;
  cursor?: string;
};

const adminRouter = Router();

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const serializeTimestamp = (value?: Timestamp | null): number | null =>
  value ? value.toMillis() : null;

const normalizeRoles = (input: AdminUserRole[]): AdminUserRole[] => {
  const set = new Set<AdminUserRole>(["user"]);
  input.forEach((role) => {
    if (ROLE_ORDER.includes(role)) {
      set.add(role);
    }
  });
  return [...set].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
};

const normalizeStatus = (status?: AdminUserStatus): AdminUserStatus => status ?? "active";

const matchesProvider = (user: AdminUserResponse, provider: "discord" | "google") => {
  if (user.primaryProvider === provider) {
    return true;
  }
  return Boolean(user.providers?.[provider]);
};

const matchesSearch = (user: AdminUserResponse, term: string) => {
  const haystack = [
    user.userId,
    user.displayName ?? undefined,
    user.profile?.displayName ?? undefined,
    (user.providers?.discord as ProviderDocEntry | undefined)?.displayName,
    (user.providers?.google as ProviderDocEntry | undefined)?.displayName,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  return haystack.some((value) => value.includes(term));
};

const mapAdminUserDoc = (
  snapshot: QueryDocumentSnapshot,
): AdminUserResponse => {
  const data = snapshot.data() as AdminUserRecord;
  const rawRoles = Array.isArray(data.roles)
    ? (data.roles as AdminUserRole[])
    : (["user"] as AdminUserRole[]);

  return {
    id: snapshot.id,
    userId: data.userId ?? snapshot.id,
    displayName: data.displayName ?? null,
    avatarUrl: data.avatarUrl ?? null,
    primaryProvider: data.primaryProvider ?? "discord",
    roles: normalizeRoles(rawRoles),
    providers: data.providers,
    profile: data.profile,
    createdAt: serializeTimestamp(data.createdAt),
    lastLoginAt: serializeTimestamp(data.lastLoginAt),
    status: normalizeStatus(data.status),
    notes: data.notes ?? null,
  };
};

const applyListQueryFilters = (
  baseQuery: Query<FirebaseFirestore.DocumentData>,
  options: ListUsersQuery,
): {
  query: Query<FirebaseFirestore.DocumentData>;
  statusNeedsClientFilter: boolean;
} => {
  let queryRef = baseQuery;
  let statusNeedsClientFilter = false;

  if (options.role) {
    queryRef = queryRef.where("roles", "array-contains", options.role);
  }

  if (options.status && options.status !== "active") {
    queryRef = queryRef.where("status", "==", options.status);
  } else if (options.status === "active") {
    statusNeedsClientFilter = true;
  }

  return { query: queryRef, statusNeedsClientFilter };
};

const extractIndexUrl = (details?: string, fallbackMessage?: string): string | null => {
  const haystack = details ?? fallbackMessage ?? "";
  const match = haystack.match(/https:\/\/console\.firebase\.google\.com[^\s"]+/);
  return match ? match[0] : null;
};

adminRouter.use(requireModerator);

adminRouter.get("/users", async (req: Request, res: Response) => {
  console.log("[authApi] GET /admin/users hit", { time: new Date().toISOString() });
  try {
    const rawPageSize = Number.parseInt(String(req.query.pageSize ?? ""), 10);
    const normalizedPageSize = clamp(
      Number.isNaN(rawPageSize) ? DEFAULT_USERS_PAGE_SIZE : rawPageSize,
      1,
      MAX_PAGE_SIZE,
    );
    const role = (req.query.role as AdminUserRole) ?? undefined;
    const status = (req.query.status as AdminUserStatus) ?? undefined;
    const provider =
      req.query.provider === "discord" || req.query.provider === "google"
        ? (req.query.provider as "discord" | "google")
        : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : "";
    const cursorId =
      typeof req.query.cursor === "string" && req.query.cursor.length
        ? req.query.cursor
        : undefined;

    const collectionRef = db.collection(USERS_COLLECTION);
    const baseQuery = collectionRef
      .orderBy("createdAt", "desc")
      .orderBy("userId", "desc");

    const { query: filteredQuery, statusNeedsClientFilter } = applyListQueryFilters(
      baseQuery,
      { role, status },
    );

    const needsClientFilters = Boolean(provider || search || statusNeedsClientFilter);
    const batchSize = Math.min(
      normalizedPageSize * (needsClientFilters ? 3 : 1),
      75,
    );

    const trimmedSearch = search.trim().toLowerCase();
    const effectiveStatusFilter = statusNeedsClientFilter ? "active" : undefined;

    const matchesFilters = (user: AdminUserResponse): boolean => {
      if (provider && !matchesProvider(user, provider)) {
        return false;
      }
      if (trimmedSearch && !matchesSearch(user, trimmedSearch)) {
        return false;
      }
      if (
        effectiveStatusFilter &&
        normalizeStatus(user.status) !== effectiveStatusFilter
      ) {
        return false;
      }
      return true;
    };

    let anchor: QueryDocumentSnapshot | null = null;
    if (cursorId) {
      const snapshot = await collectionRef.doc(cursorId).get();
      if (snapshot.exists) {
        anchor = snapshot as QueryDocumentSnapshot;
      }
    }

    const users: AdminUserResponse[] = [];
    let nextCursor: string | null = null;
    let reachedEnd = false;

    for (
      let i = 0;
      i < MAX_FETCH_BATCHES && users.length < normalizedPageSize;
      i += 1
    ) {
      let queryRef = filteredQuery;
      if (anchor) {
        queryRef = queryRef.startAfter(anchor);
      }
      queryRef = queryRef.limit(batchSize);

      const snapshot = await queryRef.get();
      if (snapshot.empty) {
        reachedEnd = true;
        nextCursor = null;
        break;
      }

      snapshot.docs.forEach((docSnap) => {
        const user = mapAdminUserDoc(docSnap);
        if (!needsClientFilters || matchesFilters(user)) {
          users.push(user);
        }
      });

      anchor = snapshot.docs[snapshot.docs.length - 1] ?? null;
      nextCursor = anchor?.id ?? null;

      if (snapshot.size < batchSize) {
        reachedEnd = true;
        break;
      }
    }

    res.json({
      users: users.slice(0, normalizedPageSize),
      nextPageCursor: reachedEnd ? null : nextCursor,
    });
  } catch (error) {
    console.error("[admin] Failed to list users", error);
    const err = error as { code?: string | number; details?: string; message?: string };
    const indexUrl = extractIndexUrl(err.details, err.message);

    if (err.code === "failed-precondition" || err.code === 9 || indexUrl) {
      return res.status(500).json({
        error: "missing_index",
        details: indexUrl ?? "Firestore index required for this query.",
      });
    }

    return res.status(500).json({
      error: "internal_error",
      details: err.message ?? "Failed to load admin users",
    });
  }
});

adminRouter.get("/users/:userId", async (req: Request, res: Response) => {
  try {
    const ref = db.collection(USERS_COLLECTION).doc(req.params.userId);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.json({ user: mapAdminUserDoc(snapshot as QueryDocumentSnapshot) });
  } catch (error) {
    console.error("[admin] Failed to fetch user", error);
    return res.status(500).json({ error: "Failed to fetch user" });
  }
});

const sanitizeRoles = (input: unknown[]): AdminUserRole[] => {
  const roles = input
    .map((role) => String(role) as AdminUserRole)
    .filter((role): role is AdminUserRole => ROLE_ORDER.includes(role));
  return roles.length ? normalizeRoles(roles) : ["user"];
};

const sanitizeStatus = (input: unknown): AdminUserStatus | null => {
  if (input === "active" || input === "suspended" || input === "banned") {
    return input;
  }
  return null;
};

const sanitizeNotes = (input: unknown): string | null | undefined => {
  if (input === null) return null;
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed.length ? trimmed : null;
  }
  return undefined;
};

const arrayEquals = (a: AdminUserRole[], b: AdminUserRole[]): boolean => {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
};

const computeChangeSet = (
  before: AdminUserResponse,
  after: AdminUserResponse,
  payload: Record<string, unknown>,
): AdminAuditChangeSet => {
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
};

const resolveAuditAction = (changes: AdminAuditChangeSet): string => {
  if (changes.roles) return "user.role.update";
  if (changes.status) return "user.status.update";
  return "user.notes.update";
};

const formatAuditSummary = (changes: AdminAuditChangeSet): string => {
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
};

const fetchUserDisplayName = async (userId: string): Promise<string | null> => {
  if (!userId) return null;
  try {
    const snapshot = await db.collection(USERS_COLLECTION).doc(userId).get();
    if (!snapshot.exists) return null;
    const data = snapshot.data() as AdminUserRecord;
    return data.profile?.displayName ?? data.displayName ?? null;
  } catch {
    return null;
  }
};

const logAuditEvent = async (
  actorUserId: string,
  actorDisplayName: string | null,
  targetUserId: string,
  action: string,
  summary: string,
  changes: AdminAuditChangeSet,
) => {
  await db.collection(AUDIT_COLLECTION).add({
    actorUserId,
    actorDisplayName,
    targetUserId,
    action,
    summary,
    changes,
    context: AUDIT_CONTEXT,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
};

adminRouter.patch(
  "/users/:userId",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const payload: Record<string, unknown> = {};
      const body = req.body ?? {};

      if (Object.prototype.hasOwnProperty.call(body, "roles")) {
        if (!Array.isArray(body.roles)) {
          return res.status(400).json({ error: "roles must be an array" });
        }
        payload.roles = sanitizeRoles(body.roles);
      }

      if (Object.prototype.hasOwnProperty.call(body, "status")) {
        const status = sanitizeStatus(body.status);
        if (!status) {
          return res.status(400).json({ error: "status must be active, suspended, or banned" });
        }
        payload.status = status;
      }

      if (Object.prototype.hasOwnProperty.call(body, "notes")) {
        const notes = sanitizeNotes(body.notes);
        if (typeof notes === "undefined") {
          return res.status(400).json({ error: "notes must be a string or null" });
        }
        payload.notes = notes;
      }

      if (!Object.keys(payload).length) {
        return res.status(400).json({ error: "No valid updates provided" });
      }

      const ref = db.collection(USERS_COLLECTION).doc(req.params.userId);
      const beforeSnapshot = await ref.get();
      if (!beforeSnapshot.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const beforeUser = mapAdminUserDoc(beforeSnapshot as QueryDocumentSnapshot);
      await ref.set(payload, { merge: true });

      const afterSnapshot = await ref.get();
      const updatedUser = mapAdminUserDoc(afterSnapshot as QueryDocumentSnapshot);

      const changes = computeChangeSet(beforeUser, updatedUser, payload);
      if (Object.keys(changes).length) {
        const actorUserId = req.sessionUser?.userId ?? "";
        const actorDisplayName = await fetchUserDisplayName(actorUserId);
        const action = resolveAuditAction(changes);
        const summary = formatAuditSummary(changes);
        await logAuditEvent(actorUserId, actorDisplayName, updatedUser.userId, action, summary, changes);
      }

      return res.json({ user: updatedUser });
    } catch (error) {
      console.error("[admin] Failed to update user", error);
      return res.status(500).json({ error: "Failed to update user" });
    }
  },
);

adminRouter.get("/audit-events", async (req: Request, res: Response) => {
  try {
    const limitParam = Number.parseInt(String(req.query.limit ?? ""), 10);
    const queryLimit = clamp(Number.isNaN(limitParam) ? 50 : limitParam, 1, 100);
    const actorUserId =
      typeof req.query.actorUserId === "string" ? req.query.actorUserId : undefined;
    const targetUserId =
      typeof req.query.targetUserId === "string" ? req.query.targetUserId : undefined;
    const action =
      typeof req.query.action === "string" && req.query.action.length
        ? req.query.action
        : undefined;
    const cursorId =
      typeof req.query.cursor === "string" && req.query.cursor.length
        ? req.query.cursor
        : undefined;

    let queryRef: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = db.collection(
      AUDIT_COLLECTION,
    );
    if (actorUserId) {
      queryRef = queryRef.where("actorUserId", "==", actorUserId);
    }
    if (targetUserId) {
      queryRef = queryRef.where("targetUserId", "==", targetUserId);
    }
    if (action) {
      queryRef = queryRef.where("action", "==", action);
    }
    queryRef = queryRef.orderBy("createdAt", "desc");

    if (cursorId) {
      const cursorSnapshot = await db.collection(AUDIT_COLLECTION).doc(cursorId).get();
      if (cursorSnapshot.exists) {
        queryRef = queryRef.startAfter(cursorSnapshot);
      }
    }

    queryRef = queryRef.limit(queryLimit);
    const snapshot = await queryRef.get();
    const events: AdminAuditEventResponse[] = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        createdAt: serializeTimestamp(data.createdAt),
        actorUserId: data.actorUserId,
        actorDisplayName: data.actorDisplayName ?? null,
        targetUserId: data.targetUserId,
        action: data.action,
        summary: data.summary,
        changes: data.changes ?? {},
        context: data.context,
      };
    });

    const nextCursor =
      snapshot.size < queryLimit
        ? null
        : snapshot.docs[snapshot.docs.length - 1]?.id ?? null;

    return res.json({ events, nextPageCursor: nextCursor });
  } catch (error) {
    console.error("[admin] Failed to list audit events", error);
    return res.status(500).json({ error: "Failed to load audit log" });
  }
});

export default adminRouter;
