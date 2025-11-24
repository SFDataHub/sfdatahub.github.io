import { Timestamp } from "firebase-admin/firestore";

import { db } from "./firebase";

export type AuthProvider = "discord" | "google";

export interface ProviderUserInfo {
  provider: AuthProvider;
  providerId: string;
  displayName: string;
  avatarUrl?: string;
}

export interface UserProfile {
  displayName?: string;
}

export interface ProviderDocEntry {
  id: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface UserDoc {
  userId: string;
  primaryProvider: AuthProvider;
  providers: {
    [K in AuthProvider]?: ProviderDocEntry;
  };
  displayName: string;
  avatarUrl?: string;
  roles: string[];
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
  profile?: UserProfile;
}

const usersCollection = db.collection("users");

const buildProviderEntry = (info: ProviderUserInfo): ProviderDocEntry => {
  const entry: ProviderDocEntry = {
    id: info.providerId,
  };
  if (info.displayName) {
    entry.displayName = info.displayName;
  } else if ("displayName" in entry) {
    delete entry.displayName;
  }
  if (info.avatarUrl) {
    entry.avatarUrl = info.avatarUrl;
  } else if ("avatarUrl" in entry) {
    delete entry.avatarUrl;
  }
  return entry;
};

export async function ensureUser(info: ProviderUserInfo): Promise<UserDoc> {
  const userId = `${info.provider}:${info.providerId}`;
  const userRef = usersCollection.doc(userId);
  const snapshot = await userRef.get();
  const now = Timestamp.now();

  if (!snapshot.exists) {
    const newUser: UserDoc = {
      userId,
      primaryProvider: info.provider,
      providers: {
        [info.provider]: buildProviderEntry(info),
      },
      displayName: info.displayName,
      roles: ["user"],
      createdAt: now,
      lastLoginAt: now,
    };
    if (info.avatarUrl) {
      newUser.avatarUrl = info.avatarUrl;
    }

    await userRef.set(newUser);
    return newUser;
  }

  const existing = snapshot.data() as UserDoc;
  const updated: UserDoc = {
    ...existing,
    providers: {
      ...existing.providers,
      [info.provider]: buildProviderEntry(info),
    },
    displayName: info.displayName,
    lastLoginAt: now,
  };
  if (info.avatarUrl) {
    updated.avatarUrl = info.avatarUrl;
  }

  await userRef.set(updated, { merge: true });
  return updated;
}
