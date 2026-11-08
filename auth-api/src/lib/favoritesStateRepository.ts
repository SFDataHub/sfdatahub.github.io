import { emptyFavoritesDocument, parseFavoritesDocument, applyFavoriteBatch, migrateLegacyFavorites, type FavoriteBatch, type FavoritesDocument } from "./favoritesState";

import type { Firestore } from "firebase-admin/firestore";

/** Atomic migration, validated merge and exact legacy-field removal. Admin adapter only. */
export async function transactFavoritesState(db: Pick<Firestore, "collection" | "runTransaction">, accountId: string, batch: FavoriteBatch | null, deleteField: unknown): Promise<FavoritesDocument> {
  const userRef = db.collection("users").doc(accountId), stateRef = userRef.collection("users_favorites").doc("state");
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(stateRef);
    const before = snapshot.exists ? parseFavoritesDocument(snapshot.data()) : emptyFavoritesDocument();
    const account = batch === null ? await tx.get(userRef) : null;
    if (account && !account.exists) throw Error("Account not found");
    const legacy = account?.data()?.favorites;
    let next = legacy === undefined ? before : migrateLegacyFavorites(before, legacy);
    if (batch) next = applyFavoriteBatch(next, batch);
    if (JSON.stringify(next) !== JSON.stringify(before)) tx.set(stateRef, next);
    if (legacy !== undefined) tx.update(userRef, { favorites: deleteField });
    return next;
  });
}
