// src/components/guilds/GuildBaseStatsBroadcastTile.tsx
import React, { useEffect, useMemo, useRef } from "react";
import { motion, useMotionValue, useTransform, useReducedMotion, animate } from "framer-motion";

type ClassShare = { key: string; percent: number; iconUrl?: string };

export type GuildBaseStatsBroadcastTileProps = {
  guildName: string;
  server: string;
  emblemUrl?: string;
  lastScanISO?: string;
  members: number;
  avgLevel: number;
  totalPower?: number;
  activity7d?: number;
  topClasses?: ClassShare[];
  tickerItems?: string[];
  href?: string;
  onClick?: () => void;
  className?: string;
};

export default function GuildBaseStatsBroadcastTile({
  guildName, server, emblemUrl, lastScanISO,
  members, avgLevel, totalPower, activity7d,
  topClasses, tickerItems, href, onClick, className,
}: GuildBaseStatsBroadcastTileProps) {
  const prefersReduced = useReducedMotion();

  // Freshness
  const freshness = useMemo(() => {
    if (!lastScanISO) return null;
    const diffMs = Date.now() - new Date(lastScanISO).getTime();
    const mins = Math.max(0, Math.floor(diffMs / 60000));
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const d = Math.floor(hrs / 24);
    return `${d}d`;
  }, [lastScanISO]);

  // Animated numbers
  const membersMv = useMotionValue(0), avgLevelMv = useMotionValue(0), powerMv = useMotionValue(0), activityMv = useMotionValue(0);
  const membersTxt = useTransform(membersMv, v => Math.round(v).toString());
  const avgLevelTxt = useTransform(avgLevelMv, v => Math.round(v).toString());
  const powerTxt   = useTransform(powerMv,   v => Math.round(v).toLocaleString());
  const activityTxt= useTransform(activityMv,v => `${Math.round(v)}%`);

  useEffect(() => {
    const dur = prefersReduced ? 0 : 0.6;
    if (dur === 0) {
      membersMv.set(members); avgLevelMv.set(avgLevel);
      powerMv.set(totalPower ?? 0); activityMv.set(activity7d ?? 0);
      return;
    }
    const ctrls = [
      animate(membersMv, members, { duration: dur }),
      animate(avgLevelMv, avgLevel, { duration: dur }),
      animate(powerMv, totalPower ?? 0, { duration: dur }),
      animate(activityMv, activity7d ?? 0, { duration: dur }),
    ];
    return () => ctrls.forEach(c => c.stop());
  }, [members, avgLevel, totalPower, activity7d, prefersReduced]);

  // Shimmer nur auf dem Emblem
  const shimmerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (prefersReduced || !shimmerRef.current) return;
    const el = shimmerRef.current; let id = 0, t = 0;
    const loop = () => { t += 0.016; const x = ((t * 14) % 140) - 20; el.style.setProperty("--s-x", `${x}%`); id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop); return () => cancelAnimationFrame(id);
  }, [prefersReduced]);

  // Theme
  const C = {
    bgFrom: "#0A1728",
    bgTo: "#152A42",
    border: "#2B4C73",
    title: "#F5F9FF",
    text: "#FFFFFF",
    soft: "#B0C4D9",
    accent: "#5C8BC6",
    line: "#2C4A73",
  };

  // einheitlicher Winkel für Linie & Emblem-Tilt
  const ANG = 100; // ~100° (leicht steiler als 98°)

  const TileWrapper: React.ElementType = href ? "a" : "div";
  const wrapperProps = href ? { href } : { onClick };

  return (
    <TileWrapper
      {...wrapperProps}
      className={[
        "group relative block w-full overflow-hidden rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5C8BC6]/70",
        className ?? "",
      ].join(" ")}
      style={{ background: `linear-gradient(135deg, ${C.bgFrom}, ${C.bgTo})` }}
    >
      {/* Vignette */}
      <div aria-hidden className="absolute inset-0" style={{ background: "radial-gradient(120% 120% at 0% 50%, rgba(0,0,0,0.45) 0%, transparent 45%)" }} />

      {/* Layout: Emblem links (schmaler), Stats rechts */}
      <div
        className="grid items-stretch gap-0 relative"
        style={{
          gridTemplateColumns: "minmax(220px, 22vw) 1fr", // <= schmaler als vorher, sicher < 50%
        }}
      >
        {/* ===== EMBLEM — bündig links, echter 3D-Tilt, weniger Zoom ===== */}
        <div className="relative">
          <div
            className="relative h-[170px] md:h-[190px] lg:h-[210px] w-full overflow-hidden"
            style={{ borderTopLeftRadius: 16, borderBottomLeftRadius: 16 }}
          >
            <div
              className="absolute inset-0 will-change-transform"
              style={{
                perspective: "1500px",
                // „nach hinten kippen“: stärkeres rotateX, dazu rotateY passend zur Trennlinie
                transform: `rotateY(-18deg) rotateX(8deg) rotateZ(-2deg) skewX(-3deg) scale(1.02)`,
                transformOrigin: "25% 50%",
              }}
            >
              {emblemUrl ? (
                <img src={emblemUrl} alt={`${guildName} Emblem`} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="h-full w-full grid place-items-center" style={{ background: "#14273E" }}>
                  <span className="text-3xl font-bold text-white/85">{server?.slice(0,3).toUpperCase() || "SRV"}</span>
                </div>
              )}

              {/* Shimmer direkt auf dem Bild */}
              <div
                ref={shimmerRef}
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "linear-gradient(100deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.40) 12%, rgba(255,255,255,0) 24%)",
                  backgroundSize: "200% 100%",
                  backgroundPosition: "var(--s-x, -20%) 0%",
                  mixBlendMode: "overlay",
                  filter: "blur(1px)",
                  opacity: 0.55,
                }}
              />
            </div>

            {/* Freshness Badge */}
            {freshness && (
              <div
                className="absolute left-2 top-2 rounded-md px-2 py-0.5 text-xs font-semibold"
                style={{ background: "rgba(10,23,40,0.75)", color: C.text, boxShadow: "0 4px 12px rgba(0,0,0,0.35)", border: `1px solid ${C.border}` }}
                title={`Last scan: ${new Date(lastScanISO!).toLocaleString()}`}
              >
                Updated {freshness}
              </div>
            )}

            {/* ==== Diagonaler Slice direkt am Bildrand (ohne Spalt) ==== */}
            <div
              aria-hidden
              className="pointer-events-none absolute right-0 top-0 h-full w-8"
              style={{
                backgroundImage:
                  `linear-gradient(${ANG}deg, rgba(255,255,255,0) 46%, rgba(92,139,198,0.98) 50%, rgba(255,255,255,0) 54%)`,
                opacity: 0.95,
              }}
            />
            {/* leichter Schatten auf Stats-Seite unmittelbar an der Kante */}
            <div
              aria-hidden
              className="pointer-events-none absolute -right-0.5 top-0 h-full w-14"
              style={{
                backgroundImage:
                  `linear-gradient(${ANG}deg, rgba(0,0,0,0) 44%, rgba(0,0,0,0.4) 58%, rgba(0,0,0,0) 70%)`,
                mixBlendMode: "multiply",
                opacity: 0.55,
              }}
            />
          </div>
        </div>

        {/* ===== STATS ===== */}
        <div className="relative">
          {/* feine diagonale Rillen */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage: `repeating-linear-gradient(${ANG}deg, transparent 0 46px, ${C.line}55 46px 47px)`,
              maskImage: "linear-gradient(to right, transparent, black 8%, black 100%)",
              WebkitMaskImage: "linear-gradient(to right, transparent, black 8%, black 100%)",
              opacity: 0.5,
            }}
          />
          <div className="relative h-full px-5 md:px-7 py-4 md:py-5 flex flex-col justify-center">
            {/* Kopfzeile */}
            <div className="mb-2 flex items-center gap-3">
              <h3 className="truncate font-extrabold" style={{ color: C.title, fontSize: 22 }}>{guildName}</h3>
              <span className="rounded-md px-2 py-0.5 text-[11px]" style={{ background: "rgba(30,47,71,0.9)", color: C.soft, border: `1px solid ${C.border}` }}>
                {server}
              </span>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
              <KPI label="Members" value={membersTxt} />
              <KPI label="Ø Level" value={avgLevelTxt} />
              <KPI label="Total Power" value={powerTxt} />
              {typeof activity7d === "number" && <KPI label="Activity (7d)" value={activityTxt} />}
            </div>

            {/* Optional: Top Classes */}
            {topClasses?.length ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[11px] uppercase tracking-wider" style={{ color: C.soft }}>Top Classes</span>
                {topClasses.slice(0, 3).map((c) => (
                  <span key={c.key} className="inline-flex items-center gap-2 rounded-md px-2 py-1" style={{ background: "rgba(30,47,71,0.9)", border: `1px solid ${C.border}`, color: C.text }}>
                    {c.iconUrl ? <img src={c.iconUrl} alt={c.key} className="h-4 w-4 object-contain" /> : <span className="h-4 w-4 rounded-sm" style={{ background: C.accent, opacity: .85 }} />}
                    <span className="text-xs">{c.key} <span className="opacity-70">({Math.round(c.percent)}%)</span></span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Footer-Ticker (optional) */}
      {tickerItems?.length ? (
        <div className="relative py-2" style={{ borderTop: `1px solid ${C.border}`, background: "linear-gradient(180deg, rgba(20,39,62,0.5), rgba(20,39,62,0.15))" }}>
          <Ticker items={tickerItems} muted={prefersReduced} color={C.soft} />
        </div>
      ) : null}
    </TileWrapper>
  );
}

/* ---------- Subparts ---------- */
function KPI({ label, value }: { label: string; value: any }) {
  return (
    <div className="relative z-10 min-w-0">
      <div className="text-[11px] md:text-xs uppercase tracking-wider text-[#B0C4D9]">{label}</div>
      <motion.div className="truncate text-xl md:text-2xl font-bold text-white" aria-live="polite">
        {value}
      </motion.div>
    </div>
  );
}

function Ticker({ items, muted, color }: { items: string[]; muted: boolean; color: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (muted || !ref.current) return;
    const el = ref.current; let t = 0, id = 0;
    const loop = () => { t += 0.016; const x = (t * 40) % (el.scrollWidth + 60); el.style.transform = `translateX(${-x}px)`; id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop); return () => cancelAnimationFrame(id);
  }, [muted]);
  return (
    <div className="overflow-hidden">
      <div ref={ref} className="whitespace-nowrap will-change-transform" style={{ color }}>
        {items.concat(items).map((it, i) => (<span key={i} className="mx-6 text-xs align-middle">{it}</span>))}
      </div>
    </div>
  );
}
