import type { Timestamp } from "firebase/firestore";

export type AdminUserRole = "user" | "creator" | "mod" | "admin";
export type AdminUserStatus = "active" | "suspended" | "banned";

export type ProviderDetails = {
  id?: string;
  displayName?: string;
  avatarUrl?: string;
};

export type AdminUserProfile = {
  displayName?: string | null;
};

export interface AdminUser {
  id: string;
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  primaryProvider: string | null;
  roles: AdminUserRole[];
  providers?: {
    discord?: ProviderDetails;
    google?: ProviderDetails;
  };
  profile?: AdminUserProfile;
  createdAt?: Timestamp | null;
  lastLoginAt?: Timestamp | null;
  status?: AdminUserStatus;
  notes?: string | null;
}
