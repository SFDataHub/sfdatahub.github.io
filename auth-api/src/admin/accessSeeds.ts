import { admin } from "../firebase";

type FeatureStatus = "hidden" | "dev_only" | "beta" | "logged_in" | "public";
type Role = "guest" | "user" | "moderator" | "developer" | "admin";

type FeatureAccessSeed = {
  id: string;
  route: string;
  area: string;
  titleKey: string;
  status: FeatureStatus;
  minRole: Role;
  allowedRoles: Role[];
  allowedGroups: string[];
  allowedUserIds: string[];
  showInTopbar: boolean;
  showInSidebar: boolean;
  navOrder: number;
  isExperimental: boolean;
  description: string;
  createdAt: admin.firestore.FieldValue;
  updatedAt: admin.firestore.FieldValue;
};

type AccessGroupSeed = {
  id: string;
  label: string;
  description: string;
  userIds: string[];
  minRole: Role;
  allowedRoles: Role[];
  isSystem: boolean;
  createdAt: admin.firestore.FieldValue;
  updatedAt: admin.firestore.FieldValue;
};

const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();

export const featureAccessSeeds: FeatureAccessSeed[] = [
  {
    id: "controlPanelAccessFeatures",
    route: "/access",
    area: "controlPanel",
    titleKey: "nav.controlPanel.access",
    status: "logged_in",
    minRole: "admin",
    allowedRoles: ["admin"],
    allowedGroups: [],
    allowedUserIds: [],
    showInTopbar: false,
    showInSidebar: true,
    navOrder: 60,
    isExperimental: false,
    description: "Access control configuration page for the control panel.",
    createdAt: serverTimestamp,
    updatedAt: serverTimestamp,
  },
];

export const accessGroupSeeds: AccessGroupSeed[] = [
  {
    id: "beta_testers",
    label: "Beta Testers",
    description: "Users who get access to beta features before public release.",
    userIds: [],
    minRole: "user",
    allowedRoles: ["user", "moderator", "developer", "admin"],
    isSystem: true,
    createdAt: serverTimestamp,
    updatedAt: serverTimestamp,
  },
  {
    id: "dev_team",
    label: "Developer Team",
    description: "Internal developers who can access dev-only tools and debug views.",
    userIds: [],
    minRole: "developer",
    allowedRoles: ["developer", "admin"],
    isSystem: true,
    createdAt: serverTimestamp,
    updatedAt: serverTimestamp,
  },
  {
    id: "creator_program",
    label: "Creator Program",
    description: "Content creators with extra tools and stats.",
    userIds: [],
    minRole: "user",
    allowedRoles: ["user", "moderator", "developer", "admin"],
    isSystem: false,
    createdAt: serverTimestamp,
    updatedAt: serverTimestamp,
  },
];
