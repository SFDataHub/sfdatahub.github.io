import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ExternalLink, ImageOff, Info, Pencil, Search, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { getAppRoleFromUserRoles } from "../../lib/featureAccessConfig";
import { loadCreatorCatalog } from "../../lib/creators/hubClient";
import { loadChannelAvatar } from "../../lib/creators/channelAvatarCache";
import type { CatalogResponse, HubCreator } from "../../../auth-api/src/creatorHub/types";
import styles from "./CreatorHub.module.css";

function PlatformLogo({ platform }: { platform: "youtube" | "twitch" }) {
  return platform === "youtube" ? <svg className={styles.platformLogo} viewBox="0 0 60 42" aria-hidden="true"><rect width="60" height="42" rx="11" fill="#ff0033"/><path d="m24 11 18 10-18 10z" fill="white"/></svg>
    : <svg className={styles.platformLogo} viewBox="0 0 24 24" aria-hidden="true"><path fill="#b880f5" d="M4 1 1 5v16h6v3l4-3h5l7-7V1H4zm17 12-4 4h-5l-3 3v-3H5V3h16v10z"/><path fill="#b880f5" d="M10 6h2v6h-2zm6 0h2v6h-2z"/></svg>;
}
function CreatorImage({ creator }: { creator: HubCreator }) {
  const { t } = useTranslation();
  const [image, setImage] = useState<string>();
  const current = useRef<string>();
  const youtube = creator.channels.find(c => c.platform === "youtube");
  const channel = youtube?.platform === "youtube" ? youtube.channelId : `creator-hub:${creator.id}`;
  useEffect(() => {
    let active = true;
    void loadChannelAvatar(channel, creator.avatarUrl ?? "", blob => {
      if (!active) return;
      const next = URL.createObjectURL(blob);
      if (current.current) URL.revokeObjectURL(current.current);
      current.current = next; setImage(next);
    }).catch(() => {});
    return () => { active = false; if (current.current) URL.revokeObjectURL(current.current); };
  }, [channel, creator.avatarUrl]);
  return <span className={styles.avatar}>{image ? <img src={image} alt={t("creatorDirectory.avatar", { name: creator.name })}/> : <ImageOff aria-label={t("creatorDirectory.imageUnavailable")} role="img"/>}</span>;
}

export default function CreatorHub() {
  const { t, i18n } = useTranslation();
  const { status, user } = useAuth();
  const canManage = status === "authenticated" && getAppRoleFromUserRoles(user?.roles) === "admin";
  const [catalog, setCatalog] = useState<CatalogResponse>();
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [language, setLanguage] = useState("all");
  const [selected, setSelected] = useState<string>();
  const detailId = useId(), noticeId = useId();
  useEffect(() => {
    let active = true, timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const result = await loadCreatorCatalog();
        if (!active) return;
        setCatalog(result.data); setFailed(false);
        timer = setTimeout(load, Math.max(1000, result.expiresAt - Date.now()));
      } catch { if (active) { setFailed(true); timer = setTimeout(load, 60000); } }
    };
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, []);
  const locale = i18n.resolvedLanguage || "en";
  const languageNames = useMemo(() => new Intl.DisplayNames([locale], { type: "language" }), [locale]);
  const languageLabel = (code: string) => languageNames.of(code) || code.toUpperCase();
  const languages = useMemo(() => [...new Set(catalog?.creators.flatMap(c => c.languages) ?? [])].sort(), [catalog]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (catalog?.creators ?? []).filter(c =>
      (platform === "all" || c.channels.some(a => a.platform === platform)) &&
      (language === "all" || (language === "unknown" ? !c.languages.length : c.languages.includes(language))) &&
      (!needle || [c.name, ...c.channels.flatMap(a => [a.name, a.platform, a.platform === "youtube" ? a.channelId : a.login,
        a.platform === "youtube" ? a.handle ?? "" : a.userId ?? ""])].some(v => v.toLowerCase().includes(needle))))
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [catalog, query, platform, language, locale]);
  const creator = visible.find(c => c.id === selected) ?? visible[0];
  const creatorLanguages = (c: HubCreator) => c.languages.length ? c.languages.map(code => `${code.toUpperCase()} · ${languageLabel(code)}`).join(", ") : t("creatorDirectory.languageUnknown");
  const adminButton = (kind: "add" | "edit") => canManage && <button type="button" disabled className={kind === "add" ? styles.add : styles.edit} title={t("creatorDirectory.editUnavailable")} aria-describedby={noticeId}>
    {kind === "add" ? <UserPlus aria-hidden="true"/> : <Pencil aria-hidden="true"/>}{t(`creatorDirectory.${kind}`)}
  </button>;
  return <section className={styles.hub} aria-labelledby="creator-directory-title">
    <header className={styles.header}>
      <div><h1 id="creator-directory-title">{t("creatorDirectory.title")}</h1><p>{t("creatorDirectory.description")}</p></div>
      {adminButton("add")}
    </header>
    {canManage && <p id={noticeId} className={styles.adminNotice}>{t("creatorDirectory.editUnavailable")}</p>}
    <div className={styles.filters}>
      <label className={styles.search}><Search aria-hidden="true"/><span className={styles.srOnly}>{t("creatorDirectory.search")}</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t("creatorDirectory.search")} /></label>
      <div className={styles.segmented} role="group" aria-label={t("creatorDirectory.platform")}>
        {(["all", "youtube", "twitch"] as const).map(value => <button type="button" key={value} aria-pressed={platform === value} onClick={() => setPlatform(value)}>{value === "all" ? t("creatorDirectory.all") : value === "youtube" ? "YouTube" : "Twitch"}</button>)}
      </div>
      <label className={styles.language}><span className={styles.srOnly}>{t("creatorDirectory.language")}</span><select aria-label={t("creatorDirectory.language")} value={language} onChange={e => setLanguage(e.target.value)}>
        <option value="all">{t("creatorDirectory.allLanguages")}</option>
        {languages.map(code => <option key={code} value={code}>{languageLabel(code)}</option>)}
        <option value="unknown">{t("creatorDirectory.languageUnknown")}</option>
      </select></label>
    </div>
    {!catalog && <p role="status">{t(`creatorDirectory.${failed ? "loadError" : "loading"}`)}</p>}
    {catalog && <>
      {(catalog.stale || failed) && <p role="status" className={styles.message}>{t("creatorDirectory.stale")}</p>}
      <p className={styles.count} role="status">{t("creatorDirectory.results", { count: visible.length })}</p>
      <div className={styles.columns}>
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label={t("creatorDirectory.title")}>
            <thead><tr><th scope="col">{t("creatorDirectory.creator")}</th><th scope="col">{t("creatorDirectory.language")}</th><th scope="col">YouTube</th><th scope="col">Twitch</th></tr></thead>
            <tbody>{visible.map(c => <tr key={c.id} className={creator?.id === c.id ? styles.selected : undefined} onClick={() => setSelected(c.id)}>
              <th scope="row"><button className={styles.creatorButton} type="button" aria-pressed={creator?.id === c.id} aria-controls={detailId} onClick={() => setSelected(c.id)}><CreatorImage key={c.id} creator={c}/><span>{c.name}</span></button></th>
              <td title={creatorLanguages(c)}>{c.languages.length ? c.languages.map(l => l.toUpperCase()).join(" · ") : "—"}</td>
              {(["youtube", "twitch"] as const).map(p => { const count = c.channels.filter(a => a.platform === p).length; return <td key={p}>{count ? <span className={styles.platformCount}><PlatformLogo platform={p}/><span>{count}</span></span> : "—"}</td>; })}
            </tr>)}</tbody>
          </table>
          {!visible.length && <p className={styles.empty}>{t(catalog.creators.length ? "creatorDirectory.noResults" : "creatorDirectory.noCreators")}</p>}
        </div>
        <aside id={detailId} className={styles.detail} aria-label={t("creatorDirectory.details")}>
          {creator ? <>
            <div className={styles.profile}><CreatorImage key={creator.id} creator={creator}/><div><h2>{creator.name}</h2><p>{creatorLanguages(creator)}</p></div></div>
            {(["youtube", "twitch"] as const).map(p => {
              const accounts = creator.channels.filter(a => a.platform === p);
              return accounts.length > 0 && <section className={styles.platformCard} key={p}>
                <h3><PlatformLogo platform={p}/>{p === "youtube" ? "YouTube" : "Twitch"}</h3>
                {accounts.map(a => <div className={styles.account} key={a.url}>
                  <a href={a.url} target="_blank" rel="noopener noreferrer" aria-label={t("creatorDirectory.openChannel", { name: a.name, platform: p === "youtube" ? "YouTube" : "Twitch" })}>{a.name}<ExternalLink size={16} aria-hidden="true"/></a>
                  <div className={styles.identifier}>{a.platform === "youtube" ? a.handle ?? a.channelId : a.login}</div>
                  {a.platform === "youtube" && a.handle && <div className={styles.channelId}>{a.channelId}</div>}
                </div>)}
                {adminButton("edit")}
              </section>;
            })}
            <p className={styles.info}><Info aria-hidden="true"/><span>{t("creatorDirectory.channelNote")}</span></p>
          </> : <p className={styles.empty}>{t("creatorDirectory.selectCreator")}</p>}
        </aside>
      </div>
    </>}
  </section>;
}
