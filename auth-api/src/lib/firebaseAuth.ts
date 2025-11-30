import type { UserDoc } from "../users";
import { admin } from "../firebase";

export const firebaseAuth = admin.auth();

export interface FirebaseTokenSubject {
  id: string;
  roles?: UserDoc["roles"];
}

export const createFirebaseCustomToken = async (
  user: FirebaseTokenSubject,
): Promise<string> => {
  const claims = {
    userId: user.id,
    roles: user.roles ?? [],
  };

  return firebaseAuth.createCustomToken(user.id, claims);
};
