import type { Request, Response } from "express";
import { Router } from "express";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";

import { admin, db } from "../firebase";
import { requireAdmin, requireModerator } from "../middleware/auth";

const FEATURE_COLLECTION = "feature_access";
const GROUP_COLLECTION = "access_groups";

type FeatureStatus = "hidden" | "dev_only" | "beta" | "logged_in" | "public" | "active";

const FEATURE_STATUSES = new Set<FeatureStatus>([
  "dev_only",
  "beta",
  "logged_in",
  "public",
  "hidden",
  "active",
]);
const ROLES = new Set([
  "admin",
  "owner",
  "mod",
  "moderator",
  "creator",
  "developer",
  "user",
  "guest",
]);

type FeatureDoc = {
  route?: string;
  area?: string;
  titleKey?: string;
  status?: string;
  minRole?: string;
  allowedRoles?: string[];
  allowedGroups?: string[];
  allowedUserIds?: string[];
  showInTopbar?: boolean;
  showInSidebar?: boolean;
  navOrder?: number;
  isExperimental?: boolean;
  createdAt?: FirebaseFirestore.Timestamp | null;
  updatedAt?: FirebaseFirestore.Timestamp | null;
  createdBy?: string;
  updatedBy?: string;
};

type AccessGroupDoc = {
  label?: string;
  description?: string;
  userIds?: string[];
  minRole?: string;
  allowedRoles?: string[];
  isSystem?: boolean;
  createdAt?: FirebaseFirestore.Timestamp | null;
  updatedAt?: FirebaseFirestore.Timestamp | null;
  createdBy?: string;
  updatedBy?: string;
};

const serializeTimestamp = (value?: FirebaseFirestore.Timestamp | null): number | null =>
  value ? value.toMillis() : null;

const sanitizeStringArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null;
  const entries = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
  return entries.length ? entries : [];
};

const sanitizeRoles = (value: unknown): string[] | null => {
  const entries = sanitizeStringArray(value);
  if (entries === null) return null;
  const normalized = entries
    .map((role) => role.toLowerCase())
    .filter((role) => ROLES.has(role));
  return normalized.length ? normalized : [];
};

const sanitizeStatus = (value: unknown): FeatureStatus | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase() as FeatureStatus;
  return FEATURE_STATUSES.has(normalized) ? normalized : null;
};

const sanitizeMinRole = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return ROLES.has(normalized) ? normalized : null;
};

const mapFeatureDoc = (snapshot: QueryDocumentSnapshot): Record<string, unknown> => {
  const data = snapshot.data() as FeatureDoc;
  return {
    id: snapshot.id,
    route: data.route ?? null,
    area: data.area ?? null,
    titleKey: data.titleKey ?? null,
    status: data.status ?? null,
    minRole: data.minRole ?? null,
    allowedRoles: data.allowedRoles ?? [],
    allowedGroups: data.allowedGroups ?? [],
    showInSidebar: data.showInSidebar ?? false,
    showInTopbar: data.showInTopbar ?? false,
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
  };
};

const mapGroupDoc = (snapshot: QueryDocumentSnapshot): Record<string, unknown> => {
  const data = snapshot.data() as AccessGroupDoc;
  return {
    id: snapshot.id,
    label: data.label ?? null,
    description: data.description ?? null,
    minRole: data.minRole ?? null,
    allowedRoles: data.allowedRoles ?? [],
    userIds: data.userIds ?? [],
    isSystem: data.isSystem ?? false,
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
  };
};

const adminAccessControlRouter = Router();

adminAccessControlRouter.use(requireModerator);
adminAccessControlRouter.use(requireAdmin);

adminAccessControlRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const [featureSnap, groupSnap] = await Promise.all([
      db.collection(FEATURE_COLLECTION).get(),
      db.collection(GROUP_COLLECTION).get(),
    ]);

    const features = featureSnap.docs.map((doc) => mapFeatureDoc(doc));
    const groups = groupSnap.docs.map((doc) => mapGroupDoc(doc));

    return res.json({ ok: true, features, groups });
  } catch (error) {
    console.error("[admin-access] Failed to list access control data", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

adminAccessControlRouter.patch("/features/:id", async (req: Request, res: Response) => {
  const featureId = req.params.id;
  const body = req.body ?? {};
  const updates: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    const status = sanitizeStatus(body.status);
    if (!status) {
      return res.status(400).json({ ok: false, error: "invalid_status" });
    }
    updates.status = status;
  }

  if (Object.prototype.hasOwnProperty.call(body, "minRole")) {
    const minRole = sanitizeMinRole(body.minRole);
    if (!minRole) {
      return res.status(400).json({ ok: false, error: "invalid_minRole" });
    }
    updates.minRole = minRole;
  }

  if (Object.prototype.hasOwnProperty.call(body, "allowedRoles")) {
    if (!Array.isArray(body.allowedRoles)) {
      return res.status(400).json({ ok: false, error: "allowedRoles must be an array" });
    }
    const allowedRoles = sanitizeRoles(body.allowedRoles);
    if (allowedRoles === null) {
      return res.status(400).json({ ok: false, error: "invalid_allowedRoles" });
    }
    updates.allowedRoles = allowedRoles;
  }

  if (Object.prototype.hasOwnProperty.call(body, "allowedGroups")) {
    if (!Array.isArray(body.allowedGroups)) {
      return res.status(400).json({ ok: false, error: "allowedGroups must be an array" });
    }
    const allowedGroups = sanitizeStringArray(body.allowedGroups);
    if (allowedGroups === null) {
      return res.status(400).json({ ok: false, error: "invalid_allowedGroups" });
    }
    updates.allowedGroups = allowedGroups;
  }

  if (Object.prototype.hasOwnProperty.call(body, "showInSidebar")) {
    if (typeof body.showInSidebar !== "boolean") {
      return res.status(400).json({ ok: false, error: "showInSidebar must be boolean" });
    }
    updates.showInSidebar = body.showInSidebar;
  }

  if (Object.prototype.hasOwnProperty.call(body, "showInTopbar")) {
    if (typeof body.showInTopbar !== "boolean") {
      return res.status(400).json({ ok: false, error: "showInTopbar must be boolean" });
    }
    updates.showInTopbar = body.showInTopbar;
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ ok: false, error: "no_valid_updates" });
  }

  try {
    const ref = db.collection(FEATURE_COLLECTION).doc(featureId);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await ref.update(updates);
    const updatedSnap = (await ref.get()) as QueryDocumentSnapshot;
    console.log("[admin-access] feature updated", {
      actor: req.sessionUser?.userId,
      featureId,
      fields: Object.keys(updates),
    });

    return res.json({ ok: true, feature: mapFeatureDoc(updatedSnap) });
  } catch (error) {
    console.error("[admin-access] Failed to update feature", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

adminAccessControlRouter.patch("/groups/:id", async (req: Request, res: Response) => {
  const groupId = req.params.id;
  const body = req.body ?? {};
  const updates: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(body, "label")) {
    if (typeof body.label !== "string" || !body.label.trim()) {
      return res.status(400).json({ ok: false, error: "invalid_label" });
    }
    updates.label = body.label.trim();
  }

  if (Object.prototype.hasOwnProperty.call(body, "description")) {
    if (typeof body.description !== "string") {
      return res.status(400).json({ ok: false, error: "invalid_description" });
    }
    updates.description = body.description;
  }

  if (Object.prototype.hasOwnProperty.call(body, "minRole")) {
    const minRole = sanitizeMinRole(body.minRole);
    if (!minRole) {
      return res.status(400).json({ ok: false, error: "invalid_minRole" });
    }
    updates.minRole = minRole;
  }

  if (Object.prototype.hasOwnProperty.call(body, "allowedRoles")) {
    if (!Array.isArray(body.allowedRoles)) {
      return res.status(400).json({ ok: false, error: "allowedRoles must be an array" });
    }
    const allowedRoles = sanitizeRoles(body.allowedRoles);
    if (allowedRoles === null) {
      return res.status(400).json({ ok: false, error: "invalid_allowedRoles" });
    }
    updates.allowedRoles = allowedRoles;
  }

  if (Object.prototype.hasOwnProperty.call(body, "userIds")) {
    if (!Array.isArray(body.userIds)) {
      return res.status(400).json({ ok: false, error: "userIds must be an array" });
    }
    const userIds = sanitizeStringArray(body.userIds);
    if (userIds === null) {
      return res.status(400).json({ ok: false, error: "invalid_userIds" });
    }
    updates.userIds = userIds;
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ ok: false, error: "no_valid_updates" });
  }

  try {
    const ref = db.collection(GROUP_COLLECTION).doc(groupId);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await ref.update(updates);
    const updatedSnap = (await ref.get()) as QueryDocumentSnapshot;
    console.log("[admin-access] group updated", {
      actor: req.sessionUser?.userId,
      groupId,
      fields: Object.keys(updates),
    });

    return res.json({ ok: true, group: mapGroupDoc(updatedSnap) });
  } catch (error) {
    console.error("[admin-access] Failed to update group", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

export default adminAccessControlRouter;
