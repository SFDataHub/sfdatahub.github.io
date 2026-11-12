import { useEffect, useId, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { YouTubeSnapshot } from "../../lib/creators/shared";
import { loadChannelAvatar } from "../../lib/creators/channelAvatarCache";
import styles from "./YouTubeCard.module.css";
function ChannelAvatar({ channel, src, alt }: { channel: string; src: string; alt: string }) {
  const [image, setImage] = useState<string>();
  const [missing, setMissing] = useState(false);
  const current = useRef<string>();
  const { t } = useTranslation();
  useEffect(() => {
    let active = true;
    setMissing(false);
    void loadChannelAvatar(channel, src, blob => {
      if (!active) return;
      const next = URL.createObjectURL(blob), previous = current.current;
      current.current = next; setImage(next);
      if (previous) URL.revokeObjectURL(previous);
    }).then(found => { if (active) setMissing(!found); }).catch(() => { if (active && !current.current) setMissing(true); });
    return () => { active = false; };
  }, [channel, src]);
  useEffect(() => () => { if (current.current) URL.revokeObjectURL(current.current); }, []);
  return image ? <img className={styles.avatar} src={image} alt={alt} /> : missing
    ? <ImageOff className={styles.avatar} role="img" aria-label={`${alt}: ${t("youtubeCard.imageUnavailable")}`} />
    : <span className={styles.avatar} aria-hidden="true" />;
}
// Each source gets its own image lifetime. A new metadata URL remounts this
// component, clearing a previous error without retrying a failed URL.
function CardImage({ src, alt, className, thumbnail = false }: { src: string; alt: string; className?: string; thumbnail?: boolean }) {
  const [failed, setFailed] = useState(false);
  const { t } = useTranslation();
  return src && !failed ? <img src={src} alt={alt} className={className} loading={thumbnail ? "lazy" : undefined} onError={() => setFailed(true)} />
    : <ImageOff className={className} style={thumbnail ? { width: "100%", height: "100%" } : undefined} role={alt ? "img" : undefined}
        aria-label={alt ? `${alt}: ${t("youtubeCard.imageUnavailable")}` : undefined} aria-hidden={alt ? undefined : true} />;
}
export function durationLabel(iso: string) {
  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(iso);
  if (!match) return "";
  const hours = Number(match[1] || 0) * 24 + Number(match[2] || 0), minutes = Number(match[3] || 0), seconds = Math.floor(Number(match[4] || 0));
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${minutes}:${String(seconds).padStart(2, "0")}`;
}
function relativeDate(date: string, locale: string) {
  const seconds = Math.round((Date.parse(date) - Date.now()) / 1000);
  const [unit, divisor]: [Intl.RelativeTimeFormatUnit, number] = Math.abs(seconds) >= 86400 ? ["day", 86400] : Math.abs(seconds) >= 3600 ? ["hour", 3600] : ["minute", 60];
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(Math.round(seconds / divisor), unit);
}
export default function YouTubeCard({ snapshot }: { snapshot: YouTubeSnapshot }) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const listId = useId(), locale = i18n.resolvedLanguage || "en";
  const number = new Intl.NumberFormat(locale), dates = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const languages = new Intl.DisplayNames([locale], { type: "language" });
  const channels = [...snapshot.channels].sort((a, b) => (Date.parse(b.videos[0]?.publishedAt || "") || 0) - (Date.parse(a.videos[0]?.publishedAt || "") || 0) || a.id.localeCompare(b.id));
  return <section className={styles.card} aria-label={t("youtubeCard.title")}>
    <h1 className={styles.brand}><span /><svg aria-hidden="true" viewBox="0 0 60 42"><rect width="60" height="42" rx="11" fill="#ff0033"/><path d="m24 11 18 10-18 10z" fill="white"/></svg>YouTube<span /></h1>
    <div id={listId} className={styles.channels}>
      {channels.slice(0, expanded ? channels.length : 3).map(channel => <article key={channel.id} className={styles.channel}>
        <div className={styles.profile}>
          <ChannelAvatar channel={channel.id} src={channel.avatar} alt={t("youtubeCard.avatar", { name: channel.name })} />
          <h2>{channel.name}</h2>
          <div className={styles.languages}>{channel.languages.length ? channel.languages.map(code => <span key={code}>{languages.of(code) || code}</span>) : t("youtubeCard.languageUnknown")}</div>
          {channel.languageSource === "creator" && <small>{t("youtubeCard.creatorLanguage")}</small>}
          <div>{channel.subscribers === null ? t("youtubeCard.subscribersUnknown") : t("youtubeCard.subscribers", { count: channel.subscribers, value: number.format(channel.subscribers) })}</div>
          <div>{t(channel.complete ? "youtubeCard.recent" : "youtubeCard.recentPartial", { count: channel.recentVideoCount, value: number.format(channel.recentVideoCount) })}</div>
          {!channel.complete && <small>{t("youtubeCard.partial")}</small>}
          <a className={styles.channelLink} href={channel.url} target="_blank" rel="noopener noreferrer" aria-label={t("youtubeCard.openChannel", { name: channel.name })}>{t("youtubeCard.channel")} ↗</a>
        </div>
        <div className={styles.videos}>
          {channel.videos.length ? channel.videos.slice(0, 3).map(video => <a className={styles.video} key={video.id} href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`} target="_blank" rel="noopener noreferrer" aria-label={t("youtubeCard.openVideo", { title: video.title })}>
            <div className={styles.thumbnail}><CardImage key={video.thumbnail} src={video.thumbnail} alt="" thumbnail/><span className={styles.play} aria-hidden="true">▶</span>{durationLabel(video.duration) && <span className={styles.duration} aria-label={t("youtubeCard.duration", { value: durationLabel(video.duration) })}>{durationLabel(video.duration)}</span>}</div>
            <h3>{video.title}</h3>
            <div className={styles.metadata}><time dateTime={video.publishedAt} title={dates.format(new Date(video.publishedAt))}>{relativeDate(video.publishedAt, locale)}</time>{video.caption && <span> · <span className={styles.cc}>CC</span> {t("youtubeCard.captions")}</span>}</div>
          </a>) : <p className={styles.empty}>{t("youtubeCard.noVideos")}</p>}
        </div>
      </article>)}
    </div>
    {channels.length > 3 && <button className={styles.expand} aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded(value => !value)}>{expanded ? t("youtubeCard.collapse") : t("youtubeCard.expand", { count: channels.length - 3, value: number.format(channels.length - 3) })}</button>}
  </section>;
}
