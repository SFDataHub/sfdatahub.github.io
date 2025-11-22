import { Timestamp } from "firebase/firestore";

import { AUTH_BASE_URL } from "../lib/auth/config";
import type { AdminUser, AdminUserRole, AdminUserStatus, ProviderDetails } from "../types/adminUser";

const ADMIN_USERS_ENDPOINT = AUTH_BASE_URL ? `${AUTH_BASE_URL}/admin/users` : "";
const DEFAULT_PAGE_SIZE = 25;

export type ListAdminUsersOptions = {
  pageSize?: number;
  cursor?: string | null;
  role?: AdminUserRole;
  status?: AdminUserStatus;
  provider?: "discord" | "google";
  search?: string;
};

export type ListAdminUsersResult = {
  users: AdminUser[];
  nextPageCursor: string | null;
};

export type UpdateAdminUserInput = {
  roles?: AdminUserRole[];
  status?: AdminUserStatus;
  notes?: string | null;
};

type AdminUserApiPayload = {
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
  profile?: AdminUser["profile"];
  createdAt: number | null;
  lastLoginAt: number | null;
  status: AdminUserStatus;
  notes: string | null;
};

type ListAdminUsersApiResponse = {
  users: AdminUserApiPayload[];
  nextPageCursor: string | null;
};

type SingleAdminUserApiResponse = {
  user: AdminUserApiPayload;
};

const ensureAdminEndpoint = () => {
  if (!ADMIN_USERS_ENDPOINT) {
    throw new Error("Admin API base URL missing (set VITE_AUTH_BASE_URL).");
  }
};

const toTimestamp = (value?: number | null): Timestamp | null => {
  if (typeof value !== "number") return null;
  return Timestamp.fromMillis(value);
};

const mapAdminUser = (payload: AdminUserApiPayload): AdminUser => ({
  id: payload.id,
  userId: payload.userId,
  displayName: payload.displayName,
  avatarUrl: payload.avatarUrl,
  primaryProvider: payload.primaryProvider ?? "discord",
  roles: payload.roles,
  providers: payload.providers,
  profile: payload.profile,
  createdAt: toTimestamp(payload.createdAt),
  lastLoginAt: toTimestamp(payload.lastLoginAt),
  status: payload.status,
  notes: payload.notes,
});

const buildListQuery = (options: ListAdminUsersOptions): string => {
  const params = new URLSearchParams();
  params.set("pageSize", String(options.pageSize ?? DEFAULT_PAGE_SIZE));
  if (options.cursor) {
    params.set("cursor", options.cursor);
  }
  if (options.role) {
    params.set("role", options.role);
  }
  if (options.status) {
    params.set("status", options.status);
  }
  if (options.provider) {
    params.set("provider", options.provider);
  }
  if (options.search) {
    params.set("search", options.search);
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
    // ignore JSON parse failures
  }
  return new Error(message);
};

export async function listAdminUsers(
  options: ListAdminUsersOptions = {},
): Promise<ListAdminUsersResult> {
  ensureAdminEndpoint();
  const query = buildListQuery(options);
  const url = `${ADMIN_USERS_ENDPOINT}${query}`;

  try {
    const response = await fetch(url, {
      credentials: "include",
    });
    if (!response.ok) {
      throw await parseError(response);
    }
    const payload = (await response.json()) as ListAdminUsersApiResponse;
    return {
      users: payload.users.map(mapAdminUser),
      nextPageCursor: payload.nextPageCursor ?? null,
    };
  } catch (error) {
    console.error("[AdminUsers] listAdminUsers failed", error);
    throw error instanceof Error ? error : new Error("Failed to load admin users");
  }
}

export async function getAdminUserById(userId: string): Promise<AdminUser> {
  ensureAdminEndpoint();
  const response = await fetch(`${ADMIN_USERS_ENDPOINT}/${encodeURIComponent(userId)}`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as SingleAdminUserApiResponse;
  return mapAdminUser(payload.user);
}

export async function updateAdminUser(
  userId: string,
  updates: UpdateAdminUserInput,
): Promise<AdminUser> {
  ensureAdminEndpoint();
  const response = await fetch(`${ADMIN_USERS_ENDPOINT}/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  const payload = (await response.json()) as SingleAdminUserApiResponse;
  return mapAdminUser(payload.user);
}
