import { useId, type ReactNode } from "react";

export type RankingIconVariant = "global" | "server" | "fusion";

// Simplified geographic silhouettes stay readable at badge size.
const CONTINENTS = [
  "M-41-23-32-34-22-37-14-30-18-23-10-18-16-9-24-8-27-1-32-7-34-16Z",
  "M-25 3-16 1-8 10-10 19-15 25-18 35-23 28-22 18-27 11Z",
  "M-6-33 3-38 17-33 30-28 39-18 34-10 23-12 17-5 8-10 3-18-5-16-11-23Z",
  "M-5-10 7-10 17-2 15 8 9 13 7 24 0 30-7 20-9 7-14 0Z",
  "M27 22 37 20 41 29 34 33 25 29Z",
];

// Uneven filled ribbons, pointed tails and broken highlights follow the game motif.
function SwirlSurface({ id }: { id: string }) {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <path
        d="M36-25 22-30 24-33C8-44-20-46-32-29L-30-29C-44-20-37-3-27 10L-28 7C-18 26 5 35 21 22C32 13 25-5 13-12C5-17-3-12-8-5C2-12 16-3 9 9C1 21-15 11-23 0L-22 2C-28-6-35-16-26-24C-11-36 11-32 36-25Z"
        fill={`url(#${id}-swirl-purple)`} stroke="#14273E" strokeWidth="2.2"
      />
      <path d="M-32-21C-31-10-22 10-11 17C0 26 15 27 23 14L20 17C11 29-7 26-20 12L-19 15C-30 4-37-10-32-21Z" fill="#5427A2" opacity=".8" />
      <path d="M-29-25C-20-39 4-40 23-30L13-32C-2-37-20-32-25-23L-26-18Z" fill="#F19AEF" opacity=".85" />
      <path d="M-22-31  -15-33M-7-36 3-35" stroke="#FAD3FA" strokeWidth="1.3" opacity=".8" />
      <path
        d="M-40 16-29 22-31 25C-15 39 20 39 30 18L27 19C37 3 23-22 7-27C-9-33-26-27-24-12L-22-13C-23 1-10 12 0 9C8 7 12 3 10-1C4 4-4 0-8-7C-14-18-2-21 9-13C24-1 20 17 5 24C-9 28-26 25-40 16Z"
        fill={`url(#${id}-swirl-blue)`} stroke="#102349" strokeWidth="2"
      />
      <path d="M-22-14C-23-24-9-28 4-24C13-21 20-14 23-5L18-10C11-20-2-24-13-20L-12-22-19-17Z" fill="#77C9F5" opacity=".9" />
      <path d="M-17-4C-9 7 3 10 10 1C9 12-6 17-16 5Z" fill="#183595" opacity=".85" />
      <path d="M-25 27C-9 35 16 32 24 23L19 26C4 36-15 37-25 27Z" fill="#57BEEA" opacity=".8" />
      <path d="M12-20 17-16M27 10 26 15M-13 31-5 32" stroke="#B6E5FF" strokeWidth="1.4" opacity=".85" />
      {/* A foreground fold crosses the blue ribbon to make the arms interweave. */}
      <path d="M-27 1C-18 17 2 26 17 14C25 7 16-7 8-9L14-3C18 5 8 12 1 12C-13 13-18 6-27 1Z" fill={`url(#${id}-swirl-purple)`} stroke="#291C58" strokeWidth="1.4" />
      <path d="M-19 9C-6 22 10 22 17 11L14 13C5 21-8 18-19 9Z" fill="#D97FEB" opacity=".75" />
      <path
        d="M-14-3-18-11-9-9-10-20-4-13 1-22 4-13 11-17 10-8 20-10 15-3 23 1 14 5 18 11 8 10 7 16 1 11-6 15-6 8-14 9-10 3Z"
        fill={`url(#${id}-swirl-core)`} stroke="#DCA62D" strokeWidth="1.2"
      />
      <path d="M-7-5-8-11-3-7 0-13 3-5 10-4 6 3 0 5-7 1Z" fill="#FFF6B8" opacity=".85" />
      <g fill="#FFDB72" stroke="#DCA62D" strokeWidth=".8">
        <path d="M-35-18-32-12-26-14-29-8-23-4-30-3-31 4-35-2-42 0-38-6-42-11-36-11Z" />
        <path d="M31 8 33 13 39 12 35 17 39 22 33 21 31 27 29 21 23 22 27 17 25 12 30 13Z" />
        <path d="M18-33 19-30 23-31 20-28 22-25 18-26 16-23 16-27 12-28 16-30Z" />
        <path d="M-8 30-7 33-3 33-6 35-5 39-8 37-11 39-10 35-13 33-9 33Z" />
      </g>
      <path d="M-35-10-34-7-30-6-34-5-35-1-36-5-39-6-36-7Z" fill="#FFF6B8" />
      <path d="M32 15 33 17 35 18 32 19 31 22 30 19 28 18 31 17Z" fill="#FFF0A7" />
    </g>
  );
}

function World({ id, x, y, radius, eu = false, merged = false, swirl = false, plain = false, children }: {
  id: string; x: number; y: number; radius: number; eu?: boolean; merged?: boolean; swirl?: boolean; plain?: boolean; children?: ReactNode;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${radius / 46})`}>
      <circle r="46" fill={`url(#${id}-${swirl ? "swirl-base" : eu || plain ? "eu" : "ocean"})`} />
      <g clipPath={`url(#${id}-sphere)`}>
        {swirl ? <SwirlSurface id={id} /> : plain ? null : eu ? (
          <g fill="#FFDB72">
            {Array.from({ length: 12 }, (_, i) => {
              const angle = (i * 30 - 90) * Math.PI / 180;
              return <use key={i} href={`#${id}-star`} x={Math.cos(angle) * 24} y={Math.sin(angle) * 25} />;
            })}
          </g>
        ) : (
          <g fill={`url(#${id}-land)`} stroke="#224C60" strokeWidth="1.3" strokeLinejoin="round">
            {CONTINENTS.map((d) => <path key={d} d={d} />)}
          </g>
        )}
        <circle r="46" fill={`url(#${id}-shade)`} />
        <ellipse cx="-15" cy="-24" rx="21" ry="11" transform="rotate(-30 -15 -24)" fill="#E5F5FF" opacity=".12" />
        {merged && <path d="M-32-33Q-49 0-30 34" fill="none" stroke="#B8E5E8" strokeWidth="4" opacity=".22" />}
        {children}
      </g>
      <circle r="46" fill="none" stroke="#0A1728" strokeWidth="3" />
      <circle r="43.5" fill="none" stroke="#8DB9DC" strokeWidth="1.5" opacity=".6" />
    </g>
  );
}

function SurfaceRanking({ variant }: { variant: RankingIconVariant }) {
  const name = variant === "global" ? "Global" : variant === "server" ? "EU8" : "F28";
  return (
    <g fontFamily="Arial, sans-serif" fontWeight="700" stroke="#0A1728" strokeWidth="2.5" strokeLinejoin="round" paintOrder="stroke fill">
      <text x="0" y="-21" textAnchor="middle" dominantBaseline="middle" fontSize="16" fill="#F5F9FF">{name}</text>
      {[1, 2, 3].map((rank, i) => (
        <g key={rank}>
          <text x="-17" y={i * 13} textAnchor="middle" dominantBaseline="middle" fontSize="16" fill="#FFDB72">{rank}</text>
          <path d={`M-3 ${i * 13}h${25 - i * 3}`} stroke="#0A1728" strokeWidth="7" strokeLinecap="round" />
          <path d={`M-3 ${i * 13}h${25 - i * 3}`} stroke="#F5F9FF" strokeWidth="3.5" strokeLinecap="round" />
        </g>
      ))}
    </g>
  );
}

function AdaptiveSurfaceRanking({ variant, compact, comic = false, serverCode = "EU8", strongOutline = false, labelLines, labelFontSize }: { variant: RankingIconVariant; compact: boolean; comic?: boolean; serverCode?: string; strongOutline?: boolean; labelLines?: readonly string[]; labelFontSize?: number }) {
  const name = variant === "global" ? "Global" : variant === "server" ? serverCode : "F28";
  const rankColors = ["#FFDB72", "#D6E4F7", "#C99262"];
  return (
    <g fontFamily="Arial, sans-serif" fontWeight="700" stroke="#0A1728" strokeWidth="2.5" strokeLinejoin="round" paintOrder="stroke fill">
      <text x="0" y={labelLines && labelLines.length > 1 ? -12 : compact ? 0 : -23} textAnchor="middle" dominantBaseline="middle" fontSize={labelFontSize ?? (compact ? variant === "global" ? strongOutline ? 23 : 24 : 30 : 16)} fontFamily={comic ? '"Comic Sans MS", "Comic Sans", "Chalkboard SE", "Chalkboard", cursive' : undefined} strokeWidth={strongOutline ? 4 : undefined} fill="#F5F9FF">{labelLines ? labelLines.length === 1 ? labelLines[0] : labelLines.map((line, index) => <tspan key={index} x="0" dy={index === 0 ? 0 : 24}>{line}</tspan>) : name}</text>
      {!compact && rankColors.map((color, i) => (
        <g key={color}>
          <text x="-17" y={i * 15} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill={color} strokeWidth="1.5">{i + 1}</text>
          <path d={`M-3 ${i * 15}h${25 - i * 3}`} stroke="#0A1728" strokeWidth="5" strokeLinecap="round" />
          <path d={`M-3 ${i * 15}h${25 - i * 3}`} stroke="#F5F9FF" strokeWidth="3" strokeLinecap="round" />
        </g>
      ))}
    </g>
  );
}

export default function RankingIcon({ variant, size = 32, className, presentation = "external", serverCode, labelLines, labelFontSize, sphereOnly = false }: {
  variant: RankingIconVariant; size?: number; className?: string; presentation?: "external" | "surface" | "adaptive" | "comic" | "name-only"; serverCode?: string; labelLines?: readonly string[]; labelFontSize?: number; sphereOnly?: boolean;
}) {
  // Each rendered instance owns its paint/clip IDs, including repeated previews.
  const id = `ranking-${useId().replace(/:/g, "")}`;
  return (
    <svg className={className} width={size} height={size} viewBox={sphereOnly ? "10 7 96 96" : "0 0 128 128"} fill="none" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}-ocean`} cx=".3" cy=".23" r=".85">
          <stop stopColor="#A8D7EE" /><stop offset=".35" stopColor="#5C8BC6" /><stop offset=".7" stopColor="#285781" /><stop offset="1" stopColor="#152A42" />
        </radialGradient>
        <radialGradient id={`${id}-eu`} cx=".3" cy=".23" r=".85">
          <stop stopColor="#508AD3" /><stop offset=".5" stopColor="#245BA7" /><stop offset="1" stopColor="#10294F" />
        </radialGradient>
        <linearGradient id={`${id}-land`} x1="-25" y1="-35" x2="30" y2="35" gradientUnits="userSpaceOnUse">
          <stop stopColor="#B9DABD" /><stop offset=".55" stopColor="#80BBAA" /><stop offset="1" stopColor="#4D918D" />
        </linearGradient>
        <radialGradient id={`${id}-shade`} cx=".32" cy=".25" r=".8">
          <stop offset=".35" stopColor="#0A1728" stopOpacity="0" /><stop offset="1" stopColor="#0A1728" stopOpacity=".55" />
        </radialGradient>
        <linearGradient id={`${id}-list`} x1="78" y1="78" x2="116" y2="120" gradientUnits="userSpaceOnUse">
          <stop stopColor="#294E75" /><stop offset="1" stopColor="#14273E" />
        </linearGradient>
        <clipPath id={`${id}-sphere`}><circle r="46" /></clipPath>
        <path id={`${id}-star`} d="M0-4.2 1.25-1.35 4.1-1.3 1.85.75 2.5 3.7 0 2.1-2.5 3.7-1.85.75-4.1-1.3-1.25-1.35Z" />
        {(presentation === "adaptive" || presentation === "comic" || presentation === "name-only") && variant === "fusion" && <>
          <radialGradient id={`${id}-swirl-base`} cx=".3" cy=".23" r=".85">
            <stop stopColor="#9865D0" /><stop offset=".6" stopColor="#4B267D" /><stop offset="1" stopColor="#152A42" />
          </radialGradient>
          <linearGradient id={`${id}-swirl-blue`} x1="-46" y1="-46" x2="46" y2="46" gradientUnits="userSpaceOnUse">
            <stop stopColor="#6DCBEE" /><stop offset=".5" stopColor="#255DCF" /><stop offset="1" stopColor="#142F84" />
          </linearGradient>
          <linearGradient id={`${id}-swirl-purple`} x1="-46" y1="-46" x2="46" y2="46" gradientUnits="userSpaceOnUse">
            <stop stopColor="#EA80EA" /><stop offset=".5" stopColor="#A24DD9" /><stop offset="1" stopColor="#5427A2" />
          </linearGradient>
          <radialGradient id={`${id}-swirl-core`} cx=".35" cy=".35" r=".75">
            <stop stopColor="#FFF6B8" /><stop offset=".35" stopColor="#FFEF42" /><stop offset=".75" stopColor="#FFDB72" /><stop offset="1" stopColor="#EAB530" />
          </radialGradient>
        </>}
      </defs>
      {presentation === "adaptive" || presentation === "comic" || presentation === "name-only" ? (
        <World id={id} x={58} y={55} radius={46} eu={variant === "server" && presentation !== "name-only"} plain={variant === "server" && presentation === "name-only"} swirl={variant === "fusion"}>
          <AdaptiveSurfaceRanking variant={variant} compact={size <= 32 || presentation === "name-only"} comic={presentation === "comic" || presentation === "name-only"} serverCode={presentation === "name-only" ? serverCode : undefined} strongOutline={presentation === "name-only"} labelLines={presentation === "name-only" ? labelLines ?? (serverCode && variant === "fusion" ? [serverCode] : undefined) : undefined} labelFontSize={labelFontSize} />
        </World>
      ) : variant === "fusion" ? (
        <>
          <World id={id} x={44} y={51} radius={36} />
          <World id={id} x={77} y={61} radius={36} merged>
            {presentation === "surface" && <SurfaceRanking variant={variant} />}
          </World>
        </>
      ) : (
        <World id={id} x={58} y={55} radius={46} eu={variant === "server"}>
          {presentation === "surface" && <SurfaceRanking variant={variant} />}
        </World>
      )}
      {/* Identical position and generous strokes for a legible 32px ranking list. */}
      {presentation === "external" && <g strokeLinejoin="round">
        <rect x="74" y="77" width="47" height="43" rx="8" fill={`url(#${id}-list)`} stroke="#0A1728" strokeWidth="4" />
        <rect x="76" y="79" width="43" height="39" rx="6" stroke="#8DB9DC" strokeWidth="2" />
        <path d="M83 88h3m-3 10h3m-3 10h3" stroke="#FFDB72" strokeWidth="4" strokeLinecap="round" />
        <path d="M94 88h16m-16 10h13m-13 10h10" stroke="#F5F9FF" strokeWidth="4" strokeLinecap="round" />
      </g>}
    </svg>
  );
}
