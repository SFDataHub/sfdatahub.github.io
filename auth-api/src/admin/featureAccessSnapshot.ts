import type { QueryDocumentSnapshot } from "firebase-admin/firestore";

import { db } from "../firebase";

const FEATURE_COLLECTION = "feature_access";
export const FEATURE_ACCESS_SNAPSHOT_COLLECTION = "stats_public";
export const FEATURE_ACCESS_SNAPSHOT_DOC = "feature_access_main_nav";

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
  description?: string;
};

export type FeatureAccessSnapshotItem = {
  id: string;
  route: string;
  area: string;
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
  description?: string;
};

const mapFeatureSnapshotItem = (
  snapshot: QueryDocumentSnapshot,
): FeatureAccessSnapshotItem | null => {
  const data = snapshot.data() as FeatureDoc;
  const route = typeof data.route === "string" ? data.route.trim() : "";
  const area = typeof data.area === "string" ? data.area.trim() : "";
  if (!route || !area) return null;

  const item: FeatureAccessSnapshotItem = {
    id: snapshot.id,
    route,
    area,
  };

  if (typeof data.titleKey === "string") item.titleKey = data.titleKey;
  if (typeof data.status === "string") item.status = data.status;
  if (typeof data.minRole === "string") item.minRole = data.minRole;
  if (Array.isArray(data.allowedRoles)) item.allowedRoles = data.allowedRoles;
  if (Array.isArray(data.allowedGroups)) item.allowedGroups = data.allowedGroups;
  if (Array.isArray(data.allowedUserIds)) item.allowedUserIds = data.allowedUserIds;
  if (typeof data.showInTopbar === "boolean") item.showInTopbar = data.showInTopbar;
  if (typeof data.showInSidebar === "boolean") item.showInSidebar = data.showInSidebar;
  if (typeof data.navOrder === "number") item.navOrder = data.navOrder;
  if (typeof data.isExperimental === "boolean") item.isExperimental = data.isExperimental;
  if (typeof data.description === "string") item.description = data.description;

  return item;
};

export const writeFeatureAccessSnapshot = async (): Promise<{
  count: number;
  path: string;
  updatedAt: number;
}> => {
  const snapshot = await db.collection(FEATURE_COLLECTION).get();
  const items = snapshot.docs
    .map((doc) => mapFeatureSnapshotItem(doc))
    .filter((item): item is FeatureAccessSnapshotItem => Boolean(item))
    .filter((item) => item.area.trim().toLowerCase() === "main");
  const updatedAt = Date.now();
  const docRef = db.collection(FEATURE_ACCESS_SNAPSHOT_COLLECTION).doc(FEATURE_ACCESS_SNAPSHOT_DOC);

  await docRef.set(
    {
      updatedAt,
      items,
    },
    { merge: false },
  );

  return {
    count: items.length,
    path: docRef.path,
    updatedAt,
  };
};
