import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import YouTubeCard from "../../components/creators/YouTubeCard";
import { loadYouTubeSnapshot, subscribeYouTubeSnapshot, YouTubeClientError } from "../../lib/creators/youtubeClient";
import type { YouTubeSnapshot } from "../../lib/creators/shared";
import type { YouTubeErrorCode } from "../../../auth-api/src/creators/diagnostics";
import styles from "./YouTubePlayground.module.css";
type Message = { key: "loadError" | "snapshotMissing" | "refreshError" | "initialRefreshError" | "busy" | "success"; code?: YouTubeErrorCode };
export default function YouTubePlayground() {
  const { t, i18n } = useTranslation();
  const { user, status } = useAuth();
  const [snapshot, setSnapshot] = useState<YouTubeSnapshot | null>(null);
  const [loading, setLoading] = useState(true), [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    return subscribeYouTubeSnapshot(value => {
      setSnapshot(value); setLoading(false);
      setMessage(previous => previous?.key === "loadError" || previous?.key === "snapshotMissing" ? null : previous);
    }, error => {
      setLoading(false);
      setMessage({
        key: error instanceof YouTubeClientError && error.message === "snapshotMissing" ? "snapshotMissing" : "loadError",
        code: error instanceof YouTubeClientError ? error.code : "YOUTUBE_SNAPSHOT_UNAVAILABLE",
      });
    });
  }, []);
  async function update() {
    if (busy.current) return;
    busy.current = true; setUpdating(true); setMessage(null);
    try { setSnapshot(await loadYouTubeSnapshot(true)); setMessage({ key: "success" }); }
    catch (error) {
      setMessage({
        key: error instanceof YouTubeClientError && error.message === "busy" ? "busy" : snapshot ? "refreshError" : "initialRefreshError",
        code: error instanceof YouTubeClientError ? error.code : "YOUTUBE_REFRESH_FAILED",
      });
    } finally { busy.current = false; setUpdating(false); }
  }
  const date = snapshot ? new Intl.DateTimeFormat(i18n.resolvedLanguage || "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(snapshot.generatedAt)) : "";
  return <div className={styles.page}>
    <div className={styles.toolbar}>
      <span>{snapshot ? t("youtubeCard.updated", { date }) : t("youtubeCard.noSnapshot")}</span>
      {status === "authenticated" && user?.roles.includes("admin") && <button disabled={updating || loading} onClick={update}>{t(updating ? "youtubeCard.updating" : "youtubeCard.update")}</button>}
    </div>
    <div role="status" aria-live="polite" className={styles.status}>{loading ? t("youtubeCard.loading") : message ? `${t(`youtubeCard.${message.key}`)}${message.code ? ` ${t("youtubeCard.errorCode", { code: message.code })}` : ""}` : ""}</div>
    {snapshot && Date.now() - Date.parse(snapshot.generatedAt) > 2 * 3600000 && <p className={styles.status}>{t("youtubeCard.stale")}</p>}
    {snapshot && <YouTubeCard snapshot={snapshot} />}
  </div>;
}
