import { collection, getDocs, orderBy, query, where, type Timestamp } from "firebase/firestore";
import { useEffect, useState } from "react";

import { db } from "../../lib/firebase";

export type ScanUploadDoc = {
  id: string;
  scanId?: string;
  queueId?: string;
  source?: string;
  discordUserId?: string | null;
  discordUsername?: string | null;
  serverCode?: string | null;
  hasPlayersCsv?: boolean;
  hasGuildsCsv?: boolean;
  status?: string;
  storagePaths?: {
    playersCsv?: string | null;
    guildsCsv?: string | null;
  };
  uploadedAt?: Timestamp | null;
  lastError?: string | null;
};

export type UseScanUploadsResult = {
  items: ScanUploadDoc[];
  loading: boolean;
  error: Error | null;
};

export const useScanUploads = (discordUserId?: string | null): UseScanUploadsResult => {
  const [items, setItems] = useState<ScanUploadDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!discordUserId) {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const scanUploadsRef = collection(db, "scan_uploads");
        const q = query(
          scanUploadsRef,
          where("discordUserId", "==", discordUserId),
          orderBy("uploadedAt", "desc"),
        );
        const snapshot = await getDocs(q);
        if (!active) return;
        const docs = snapshot.docs.map(
          (doc) =>
            ({
              id: doc.id,
              ...doc.data(),
            }) as ScanUploadDoc,
        );
        console.log(
          `[upload-center] Loaded ${docs.length} scan_uploads for current user (remote sessions)`,
        );
        setItems(docs);
      } catch (err) {
        if (!active) return;
        console.error("[upload-center] Failed to load scan_uploads for current user", err);
        setError(err instanceof Error ? err : new Error("Failed to load scan uploads"));
        setItems([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [discordUserId]);

  return { items, loading, error };
};
