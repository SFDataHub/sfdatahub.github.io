import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { subscribeYouTubeSnapshot, YouTubeClientError } from "../../lib/creators/youtubeClient";
import { trackYouTubeVideoClick } from "../../lib/analytics/localEvents";
import type { YouTubeSnapshot } from "../../lib/creators/shared";
import YouTubeCard, { YouTubeCardFrame } from "../creators/YouTubeCard";
import styles from "./HomeYouTube.module.css";

export default function HomeYouTube() {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<YouTubeSnapshot | null>(null);
  const [message, setMessage] = useState<"loading" | "loadError" | "snapshotMissing">("loading");
  useEffect(() => subscribeYouTubeSnapshot(setSnapshot, error => {
    setMessage(error instanceof YouTubeClientError && error.message === "snapshotMissing" ? "snapshotMissing" : "loadError");
  }), []);
  return snapshot ? <YouTubeCard snapshot={snapshot} onVideoActivate={trackYouTubeVideoClick} /> : <YouTubeCardFrame>
    <p className={styles.status} role="status" aria-live="polite">{t(`youtubeCard.${message}`)}</p>
  </YouTubeCardFrame>;
}
