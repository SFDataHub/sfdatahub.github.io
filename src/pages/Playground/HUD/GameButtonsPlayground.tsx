import React, { useEffect, useState } from "react";
import { Zap, Shield, Shapes, Diamond as DiamondIcon, Hexagon, Aperture, Layers } from "lucide-react";

/**
 * SFDataHub – Game Buttons Playground (EXTENDED + PRESETS)
 * - Shapes: Diamond, Hex, Octagon/Shield, Shard, Pill, Tabs, Icon
 * - CSS-only materials & FX using gradients/filters/clip-path
 * - 5 Presets (Arcade, Mythic, Tactical, Minimal, Holo)
 */

// ---- Palette ----
const C = {
  bg: "#0C1C2E",
  tile: "#152A42",
  tileHover: "#1E3A5C",
  active: "#1F3B5D",
  txt: "#FFFFFF",
  txt2: "#B0C4D9",
  title: "#F5F9FF",
  border: "#2B4C73",
  icon: "#5C8BC6",
  btn: "#1E2F47",
  btnHover: "#2A4C72",
  kachel: "#1A2F4A",
};

// ---- Global styles & keyframes ----
const GlobalStyles = () => (
  <style>{`
    @keyframes shineSweep { 0% { transform: translateX(-120%) skewX(-20deg); opacity: 0; } 40% { opacity: .35; } 100% { transform: translateX(120%) skewX(-20deg); opacity: 0; } }
    @keyframes pulseSoft { 0%,100% { box-shadow: 0 0 0 rgba(127,178,255,0);} 50% { box-shadow: 0 0 18px rgba(127,178,255,.35);} }
    @keyframes hologrid { 0% { background-position: 0 0, 0 0; } 100% { background-position: 100px 0, 0 60px; } }
    @keyframes sparkleFloat { 0% { transform: translateY(0); opacity:.7;} 50% { transform: translateY(-4px); opacity:1;} 100% { transform: translateY(0); opacity:.7;} }
    .noise::after { content:""; position:absolute; inset:0; pointer-events:none; opacity:.06; mix-blend:overlay;
      background-image:url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2"/></filter><rect width="100%" height="100%" filter="url(%23n)" opacity="0.8"/></svg>'); }
    .vignette::before { content:""; position:absolute; inset:-2px; pointer-events:none; border-radius:1rem; box-shadow: inset 0 0 40px rgba(0,0,0,.5); }
  `}</style>
);

// ---- Controls model ----
const initialFx = {
  size: "md", // "sm" | "md" | "lg"
  withIcon: true,
  disabled: false,
  // Global/Card Border
  baseBorder: true, // <- NEU: globaler Rahmen für Cards & Surfaces
  // Base FX
  glow: true,
  shine: true,
  scan: false,
  pulse: false,
  depth: true, // 3D extrusion
  bevel: true, // inner bevel
  outline: false, // sticker stroke (nur mit baseBorder)
  gradBorder: false, // fancy gradient border (nur mit baseBorder)
  hologram: false, // grid + slight chroma text
  vignette: false, // inner vignette
  press: true, // deeper press on :active
  material: "metal", // default
  // Extra +10 FX
  noiseTex: false,
  rimLight: false,
  innerGlow2: false,
  innerShadow2: false,
  sparkles: false,
  tilt: false,
  lift: false,
  doubleBorder: false,
  cornerNotch: false,
  stripesDiag: false,
};

// ---- Utility ----
function padForSize(sz: string) {
  return sz === "sm" ? "px-3 py-1.5 text-xs" : sz === "lg" ? "px-6 py-3 text-base" : "px-5 py-2 text-sm";
}

function buildBaseClasses(fx: any) {
  return [
    "relative select-none inline-flex items-center gap-2 font-semibold transition-all border",
    padForSize(fx.size),
    fx.disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
    fx.press ? "active:translate-y-[1px]" : "",
    fx.lift ? "hover:-translate-y-[1px]" : "",
    fx.tilt ? "[perspective:600px] hover:[transform:rotateX(3deg)_rotateY(-3deg)]" : "",
  ].join(" ");
}

// ---- Materials (metal, crystal + 10 more) ----
function materialSurface(fx: any) {
  const depthShadow = fx.depth ? `0 6px 14px rgba(0,0,0,.35)` : `0 4px 10px rgba(0,0,0,.25)`;

  const metal = { background: `linear-gradient(180deg, #203757, #132338)`, boxShadow: `inset 0 1px 0 rgba(255,255,255,.06), ${depthShadow}` };
  const crystal = { background: `linear-gradient(135deg, rgba(127,178,255,.20), rgba(127,178,255,.05))`, backdropFilter: `saturate(1.2)`, boxShadow: `inset 0 0 10px rgba(127,178,255,.25), ${depthShadow}` };
  const carbon = { background: `repeating-linear-gradient(45deg, #1A2F4A 0 6px, #16283f 6px 12px)`, boxShadow: `inset 0 1px 0 rgba(255,255,255,.04), ${depthShadow}` };
  const chrome = { background: `linear-gradient(90deg, #8ca6bf, #e3edf7 40%, #8ca6bf 60%, #2b3e57)`, filter: `saturate(0.9)`, boxShadow: `inset 0 1px 0 rgba(255,255,255,.25), ${depthShadow}` };
  const gold = { background: `linear-gradient(135deg, #705c1f, #b9972e 35%, #ffd86a 55%, #7a6422)`, boxShadow: `inset 0 1px 0 rgba(255,255,255,.15), ${depthShadow}` };
  const obsidian = { background: `radial-gradient(100% 60% at 50% 0%, #0f1a2a, #0a1422)`, boxShadow: `inset 0 1px 0 rgba(255,255,255,.04), ${depthShadow}` };
  const neon = { background: `linear-gradient(135deg, rgba(92,139,198,.25), rgba(10,255,255,.1))`, boxShadow: `${depthShadow}` };
  const plasma = { background: `conic-gradient(from 200deg, rgba(120,180,255,.2), rgba(80,140,240,.08), rgba(120,180,255,.2))`, boxShadow: `${depthShadow}` };
  const aurora = { background: `linear-gradient(120deg, rgba(127,178,255,.18), rgba(127,255,212,.14), rgba(186,127,255,.14))`, boxShadow: `${depthShadow}` };
  const satin = { background: `linear-gradient(180deg, #1e3250, #1a2d49)`, filter: `saturate(0.9) contrast(1.05)`, boxShadow: `inset 0 1px 0 rgba(255,255,255,.05), ${depthShadow}` };
  const matte = { background: `#1b2f49`, filter: `saturate(0.8)`, boxShadow: `${depthShadow}` };
  const holo = { background: `linear-gradient(135deg, rgba(255,255,255,.06), rgba(127,178,255,.12)), repeating-conic-gradient(from 0deg, rgba(127,178,255,.18) 0 10deg, transparent 10deg 20deg)`, backgroundBlendMode: "screen", boxShadow: `${depthShadow}` };

  const byMat: Record<string, any> = { metal, crystal, carbon, chrome, gold, obsidian, neon, plasma, aurora, satin, matte, holo };
  return byMat[fx.material];
}

function surfaceStyles(fx: any) {
  const base: any = {
    color: C.title,
    borderColor: C.border,
    ...materialSurface(fx),
  };
  // Grad/DoubleBorder nur mit aktivem Basis-Rahmen
  if (fx.baseBorder && fx.gradBorder) {
    base.border = "1px solid transparent";
    base.backgroundImage = `${base.background}, conic-gradient(from 0deg, #5C8BC6, #7FB2FF, #5C8BC6)`;
    base.backgroundOrigin = "border-box";
    base.backgroundClip = "padding-box, border-box";
  }
  if (fx.baseBorder && fx.doubleBorder) {
    base.boxShadow = `${base.boxShadow}, 0 0 0 1px rgba(127,178,255,.25) inset`;
  }
  if (!fx.baseBorder) {
    base.border = "0 solid transparent"; // schlägt Tailwind .border
  }
  return base;
}

const Label = ({ children }: any) => <span className="relative z-10">{children}</span>;

// ---- Common overlays per-FX ----
function FxLayers({ fx, clip }: any) {
  return (
    <>
      {fx.shine && (
        <span className="pointer-events-none absolute inset-0 overflow-hidden" style={clip?{ clipPath: clip }:undefined}>
          <span className="pointer-events-none absolute top-0 left-0 h-full w-1/3 bg-white/12 blur-sm" style={{ animation: "shineSweep 2.3s linear infinite" }} />
        </span>
      )}
      {fx.scan && (
        <span className="pointer-events-none absolute inset-0 opacity-70" style={{ clipPath: clip, backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,.08) 0px, rgba(255,255,255,.08) 1px, transparent 1px, transparent 3px)" }} />
      )}
      {fx.hologram && (
        <span className="pointer-events-none absolute inset-0 opacity-25" style={{ clipPath: clip, backgroundImage: `linear-gradient(90deg, rgba(127,178,255,.25) 1px, transparent 1px), linear-gradient(0deg, rgba(127,178,255,.20) 1px, transparent 1px)`, backgroundSize: "20px 20px, 20px 20px", animation: "hologrid 5s linear infinite" }} />
      )}
      {fx.vignette && <span className="pointer-events-none vignette absolute inset-0 rounded-xl" style={clip?{ clipPath: clip }:undefined} />}
      {fx.glow && <span className="pointer-events-none absolute inset-0 rounded-xl" style={{ boxShadow: "0 0 12px rgba(127,178,255,.35)", clipPath: clip }} />}
      {fx.bevel && <span className="pointer-events-none absolute inset-0 rounded-xl" style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,.08), inset 0 -2px 0 rgba(0,0,0,.35)", clipPath: clip }} />}
      {/* Outline nur, wenn Basis-Rahmen aktiv */}
      {fx.baseBorder && fx.outline && <span className="pointer-events-none absolute -inset-[2px] rounded-xl" style={{ border: "2px solid rgba(127,178,255,.55)", clipPath: clip }} />}
      {fx.pulse && <span className="pointer-events-none absolute inset-0 rounded-xl" style={{ animation: "pulseSoft 2.2s ease-in-out infinite", clipPath: clip }} />}

      {fx.noiseTex && <span className="pointer-events-none noise absolute inset-0 rounded-xl" style={clip?{ clipPath: clip }:undefined} />}
      {fx.rimLight && (
        <span className="pointer-events-none absolute inset-0 rounded-xl" style={{ boxShadow: "inset 0 0 0 1px rgba(127,178,255,.18), 0 0 22px rgba(127,178,255,.25)", clipPath: clip }} />
      )}
      {fx.innerGlow2 && (
        <span className="pointer-events-none absolute inset-0 rounded-xl" style={{ boxShadow: "inset 0 0 18px rgba(127,178,255,.25)", clipPath: clip }} />
      )}
      {fx.innerShadow2 && (
        <span className="pointer-events-none absolute inset-0 rounded-xl" style={{ boxShadow: "inset 0 12px 24px rgba(0,0,0,.25)", clipPath: clip }} />
      )}
      {fx.sparkles && (
        <span className="pointer-events-none absolute inset-0 overflow-hidden" style={clip?{ clipPath: clip }:undefined}>
          {[...Array(10)].map((_,i)=> (
            <span key={i} className="absolute w-1 h-1 rounded-full bg-white/70" style={{
              top: `${Math.random()*90+5}%`, left:`${Math.random()*90+5}%`, animation:"sparkleFloat 2.6s ease-in-out infinite", animationDelay:`-${Math.random()*2.6}s` }} />
          ))}
        </span>
      )}
      {fx.stripesDiag && (
        <span className="pointer-events-none absolute inset-0 opacity-15" style={{ clipPath: clip, backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,.15) 0 2px, transparent 2px 8px)" }} />
      )}
      {fx.cornerNotch && (
        <span className="pointer-events-none absolute inset-0" style={{ clipPath: "polygon(8% 0, 92% 0, 100% 8%, 100% 92%, 92% 100%, 8% 100%, 0 92%, 0 8%)" }} />
      )}
    </>
  );
}

// ---- Shapes ----
function DiamondButton({ fx, children }: any) {
  const base = buildBaseClasses(fx);
  const surf = surfaceStyles(fx);
  const clip = "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)";
  return (
    <button disabled={fx.disabled} className={`${base} overflow-hidden`} style={surf}>
      <span className="pointer-events-none absolute inset-0" style={{ clipPath: clip, background: fx.material === 'crystal' ? 'linear-gradient(135deg, rgba(127,178,255,.12), rgba(127,178,255,.03))' : undefined }} />
      <FxLayers fx={fx} clip={clip} />
      {fx.withIcon && <DiamondIcon size={16} className="relative z-10"/>}
      <Label>{children}</Label>
    </button>
  );
}

function HexButton({ fx, children }: any) {
  const base = buildBaseClasses(fx);
  const surf = surfaceStyles(fx);
  const clip = "polygon(25% 0, 75% 0, 100% 50%, 75% 100%,25% 100%,0 50%)";
  return (
    <button disabled={fx.disabled} className={`${base} overflow-hidden`} style={surf}>
      <span className="pointer-events-none absolute inset-0" style={{ clipPath: clip }} />
      <FxLayers fx={fx} clip={clip} />
      {fx.withIcon && <Hexagon size={16} className="relative z-10"/>}
      <Label>{children}</Label>
    </button>
  );
}

function OctagonButton({ fx, children }: any) {
  const base = buildBaseClasses(fx);
  const surf = surfaceStyles(fx);
  const clip = "polygon(30% 0, 70% 0, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0 70%, 0 30%)";
  return (
    <button disabled={fx.disabled} className={`${base} overflow-hidden`} style={surf}>
      <span className="pointer-events-none absolute inset-0" style={{ clipPath: clip }} />
      <FxLayers fx={fx} clip={clip} />
      {fx.withIcon && <Shield size={16} className="relative z-10"/>}
      <Label>{children}</Label>
    </button>
  );
}

function ShardButton({ fx, children }: any) {
  const base = buildBaseClasses(fx);
  const surf = surfaceStyles(fx);
  const clip = "polygon(6% 0, 94% 0, 100% 38%, 88% 100%, 12% 100%, 0 38%)";
  return (
    <button disabled={fx.disabled} className={`${base} overflow-hidden`} style={surf}>
      <span className="pointer-events-none absolute inset-0" style={{ clipPath: clip, background: `linear-gradient(135deg, ${C.tile}, ${C.active})` }} />
      <FxLayers fx={fx} clip={clip} />
      {fx.withIcon && <Shapes size={16} className="relative z-10"/>}
      <Label>{children}</Label>
    </button>
  );
}

function PillChip({ fx, children }: any) {
  const base = buildBaseClasses(fx);
  const surf = surfaceStyles(fx);
  return (
    <button disabled={fx.disabled} className={`${base} rounded-full overflow-hidden`} style={surf}>
      <FxLayers fx={fx} />
      {fx.withIcon && <Aperture size={16} className="relative z-10"/>}
      <Label>{children}</Label>
    </button>
  );
}

// Segmented Tabs
function SegmentedTabs({ fx, tabs }: any) {
  const [active, setActive] = useState(0);
  return (
    <div className="inline-flex rounded-xl p-1"
         style={{ backgroundColor: C.tile, border: fx.baseBorder ? `1px solid ${C.border}` : "0 solid transparent" }}>
      {tabs.map((t: string, i: number) => (
        <button
          key={i}
          onClick={() => setActive(i)}
          className={`px-4 py-2 rounded-lg text-sm transition-colors ${i===active?"text-white":"text-[#B0C4D9] hover:text-white"}`}
          style={{ backgroundColor: i===active ? C.active : "transparent", border: i===active && fx.baseBorder ? `1px solid ${C.border}` : "0 solid transparent" }}
        >
          {fx.withIcon && i===active && <Aperture size={14} className="inline mr-1"/>}
          {t}
        </button>
      ))}
    </div>
  );
}

// Icon Button
function NeonIconButton({ fx }: any) {
  const base = buildBaseClasses(fx);
  const surf = surfaceStyles(fx);
  return (
    <button disabled={fx.disabled} className={`${base} rounded-xl p-2`} style={surf} aria-label="Icon action">
      <Zap />
    </button>
  );
}

// ---- Presets ----
const PRESETS: Record<string,(s:any)=>any> = {
  Arcade: (s) => ({ ...s, material: "neon", glow: true, shine: true, pulse: true, hologram: true, rimLight: true, sparkles: true, depth: true, bevel: true, outline: false, gradBorder: false, innerGlow2: true, innerShadow2: false, stripesDiag: false, noiseTex: false, tilt: true, lift: true }),
  Mythic: (s) => ({ ...s, material: "gold", glow: true, shine: true, pulse: false, hologram: false, rimLight: true, sparkles: false, depth: true, bevel: true, outline: true, gradBorder: true, innerGlow2: true, innerShadow2: true, stripesDiag: false, noiseTex: false, tilt: false, lift: false, baseBorder: true }),
  Tactical: (s) => ({ ...s, material: "carbon", glow: false, shine: false, pulse: false, hologram: false, rimLight: false, sparkles: false, depth: true, bevel: true, outline: false, gradBorder: false, innerGlow2: false, innerShadow2: true, stripesDiag: true, noiseTex: true, tilt: false, lift: false }),
  Minimal: (s) => ({ ...s, material: "matte", glow: false, shine: false, pulse: false, hologram: false, rimLight: false, sparkles: false, depth: false, bevel: false, outline: false, gradBorder: false, innerGlow2: false, innerShadow2: false, stripesDiag: false, noiseTex: false, tilt: false, lift: false }),
  Holo: (s) => ({ ...s, material: "holo", glow: true, shine: true, pulse: true, hologram: true, rimLight: true, sparkles: false, depth: true, bevel: false, outline: false, gradBorder: true, innerGlow2: true, innerShadow2: false, stripesDiag: false, noiseTex: false, tilt: false, lift: true }),
};

// ---- Top Togglebar (grouped) ----
function Togglebar({ fx, setFx }: any) {
  const set = (k: string, v: any) => setFx((s: any) => ({ ...s, [k]: v }));
  const togg = (k: string) => setFx((s: any) => ({ ...s, [k]: !s[k] }));

  const materials = ["metal","crystal","carbon","chrome","gold","obsidian","neon","plasma","aurora","satin","matte","holo"];

  const coreToggles: [string,string][] = [
    ["baseBorder","Border"], // NEU
    ["glow","Glow"],
    ["shine","Shine"],
    ["pulse","Pulse"],
    ["depth","3D"],
    ["bevel","Bevel"],
    ["outline","Outline"],
  ];

  const advancedToggles: [string,string][] = [
    ["scan","Scan"],
    ["hologram","Hologram"],
    ["gradBorder","Grad-Border"],
    ["vignette","Vignette"],
    ["noiseTex","Noise"],
    ["rimLight","Rim"],
    ["innerGlow2","InnerGlow"],
    ["innerShadow2","InnerShadow"],
    ["sparkles","Sparkles"],
    ["stripesDiag","Stripes"],
    ["tilt","Tilt"],
    ["lift","Lift"],
    ["doubleBorder","DoubleBorder"],
    ["cornerNotch","CornerNotch"],
  ];

  return (
    <div className="rounded-2xl p-3 md:p-4 flex flex-wrap items-center gap-2 md:gap-3"
         style={{ backgroundColor: C.tile, border: fx.baseBorder ? `1px solid ${C.border}` : "0 solid transparent" }}>
      <div className="flex items-center gap-2 pr-3 mr-2" style={{ borderRight: fx.baseBorder ? `1px solid ${C.border}` : "0" }}>
        <span className="text-xs font-semibold" style={{ color: C.title }}>Presets</span>
        {Object.keys(PRESETS).map((p) => (
          <button key={p} onClick={()=> setFx((s:any) => PRESETS[p](s))}
            className="px-2.5 py-1 rounded-md border text-xs"
            style={{ backgroundColor: C.btn, borderColor: C.border, color: C.title }}>{p}</button>
        ))}
      </div>

      <div className="flex items-center gap-2 pr-3 mr-2" style={{ borderRight: fx.baseBorder ? `1px solid ${C.border}` : "0" }}>
        <span className="text-xs font-semibold" style={{ color: C.title }}>Material</span>
        {materials.map(m => (
          <button key={m} onClick={()=>set("material", m)}
            className={`px-2.5 py-1 rounded-md border text-xs ${fx.material===m?"" : "opacity-70"}`}
            style={{ backgroundColor: fx.material===m? C.active : C.btn, borderColor: C.border, color: C.title }}>{m}</button>
        ))}
        <span className="ml-2 text-xs font-semibold" style={{ color: C.title }}>Size</span>
        {["sm","md","lg"].map(s => (
          <button key={s} onClick={()=>set("size", s)}
            className={`px-2.5 py-1 rounded-md border text-xs ${fx.size===s?"" : "opacity-70"}`}
            style={{ backgroundColor: fx.size===s? C.active : C.btn, borderColor: C.border, color: C.title }}>{s.toUpperCase()}</button>
        ))}
        <button onClick={()=>setFx((s:any)=>({ ...s, withIcon: !s.withIcon }))} className="ml-1 px-2.5 py-1 rounded-md border text-xs" style={{ backgroundColor: fx.withIcon? C.active : C.btn, borderColor: C.border, color: C.title }}>Icon</button>
        <button onClick={()=>setFx((s:any)=>({ ...s, disabled: !s.disabled }))} className="px-2.5 py-1 rounded-md border text-xs" style={{ backgroundColor: fx.disabled? C.active : C.btn, borderColor: C.border, color: C.title }}>Disabled</button>
      </div>

      <div className="flex items-center gap-2 pr-3 mr-2" style={{ borderRight: fx.baseBorder ? `1px solid ${C.border}` : "0" }}>
        <span className="text-xs font-semibold" style={{ color: C.title }}>Core FX</span>
        {coreToggles.map(([key,label]) => (
          <button key={key} onClick={()=>togg(key)}
            className={`px-2.5 py-1 rounded-md border text-xs ${fx[key as keyof typeof fx]?"" : "opacity-70"}`}
            style={{ backgroundColor: fx[key as keyof typeof fx]? C.active : C.btn, borderColor: C.border, color: C.title }}>{label}</button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold" style={{ color: C.title }}>Advanced</span>
        {advancedToggles.map(([key,label]) => (
          <button key={key} onClick={()=>togg(key)}
            className={`px-2.5 py-1 rounded-md border text-xs ${fx[key as keyof typeof fx]?"" : "opacity-70"}`}
            style={{ backgroundColor: fx[key as keyof typeof fx]? C.active : C.btn, borderColor: C.border, color: C.title }}>{label}</button>
        ))}
      </div>

      <button onClick={()=>setFx(initialFx)} className="ml-auto px-3 py-1.5 rounded-md border text-xs" style={{ backgroundColor: C.btn, borderColor: C.border, color: C.title }}>Reset</button>
    </div>
  );
}

// ---- Extra UI Components ----
function SurfaceBox({ fx, className = "", style = {}, children, clip }: any){
  const surf = surfaceStyles(fx);
  return (
    <div className={`relative ${className}`} style={{ ...surf, ...(style as any) }}>
      <FxLayers fx={fx} clip={clip} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function WrapCard({ fx, className = "", children }: any) {
  return (
    <div className={`rounded-xl p-3 ${className}`}
         style={{ backgroundColor: C.tile, border: fx.baseBorder ? `1px solid ${C.border}` : "0 solid transparent" }}>
      {children}
    </div>
  );
}

function ToggleChips({ fx }: any){
  const [active, setActive] = useState(["EU1","Demon Hunter"]);
  const all = ["EU1","EU2","Fusion","Mage","Demon Hunter","Warrior"];
  return (
    <WrapCard fx={fx}>
      <div className="text-sm mb-2" style={{ color: C.title }}>Toggle Chips</div>
      <div className="flex flex-wrap gap-2">
        {all.map(n => {
          const on = active.includes(n);
          return (
            <SurfaceBox key={n} fx={fx} className={`rounded-full border ${on?"" : "opacity-80"}`} style={{ borderColor: C.border }}>
              <button onClick={()=> setActive(a => on? a.filter((x:string)=>x!==n) : [...a,n])} className="px-3 py-1 text-xs text-white">{n}</button>
            </SurfaceBox>
          );
        })}
      </div>
    </WrapCard>
  );
}

function IconToolbar({ fx }: any){
  return (
    <WrapCard fx={fx} className="flex items-center gap-2">
      <span className="text-sm" style={{ color: C.title }}>Icon Toolbar</span>
      {[1,2,3,4,5].map(i => (
        <SurfaceBox key={i} fx={fx} className="rounded-xl border p-2" style={{ borderColor: C.border }}>
          <button className="relative">
            <Zap size={16}/>
            {i===3 && <span className="absolute -top-1 -right-1 grid place-items-center w-4 h-4 rounded-full text-[10px]" style={{ backgroundColor: "#E11D48", color: "white" }}>3</span>}
          </button>
        </SurfaceBox>
      ))}
    </WrapCard>
  );
}

function BreadcrumbHUD({ fx }: any){
  return (
    <SurfaceBox fx={fx} className="rounded-xl p-3"
      style={{ border: fx.baseBorder ? `1px solid ${C.border}` : "0 solid transparent" }}>
      <div className="text-sm mb-2" style={{ color: C.title }}>Breadcrumb HUD</div>
      <div className="flex items-center gap-2 text-xs text-white/90">
        {['Home','Guilds','Fusion Planner'].map((t)=> (
          <SurfaceBox key={t} fx={fx} className="rounded-md border px-2 py-1" style={{ borderColor: C.border }}>
            {t}
          </SurfaceBox>
        ))}
      </div>
    </SurfaceBox>
  );
}

function StatTiles({ fx }: any){
  const cards = [
    { k: "Players", v: "12,340", d: "+2.1%" },
    { k: "Scans/Day", v: "842", d: "+4.0%" },
    { k: "Hydra", v: "7/10", d: "-" },
  ];
  return (
    <WrapCard fx={fx}>
      <div className="text-sm mb-2" style={{ color: C.title }}>Stat Tiles</div>
      <div className="grid grid-cols-3 gap-2">
        {cards.map(c => (
          <SurfaceBox key={c.k} fx={fx} className="rounded-lg border p-2 text-white" style={{ borderColor: C.border }}>
            <div className="text-[10px] opacity-80">{c.k}</div>
            <div className="text-sm">{c.v}</div>
            <div className="text-[11px] opacity-80">{c.d}</div>
          </SurfaceBox>
        ))}
      </div>
    </WrapCard>
  );
}

function MeterBar({ fx }: any){
  const [val,setVal] = useState(0.66);
  return (
    <WrapCard fx={fx}>
      <div className="text-sm mb-2" style={{ color: C.title }}>Meter / Energy Bar</div>
      <SurfaceBox fx={fx} className="h-3 w-full rounded-full border overflow-hidden" style={{ borderColor: C.border }}>
        <div role="progressbar" aria-valuenow={Math.round(val*100)} aria-valuemin={0} aria-valuemax={100}
             className="h-full" style={{ width: `${val*100}%`, background: "linear-gradient(90deg, #5C8BC6, #7FB2FF)" }} />
      </SurfaceBox>
      <div className="mt-2 flex gap-2">
        {[0.25,0.5,0.75,1].map(n=> (
          <SurfaceBox key={n} fx={fx} className="rounded-md border" style={{ borderColor: C.border }}>
            <button onClick={()=>setVal(n)} className="px-2 py-1 text-xs text-white">{Math.round(n*100)}%</button>
          </SurfaceBox>
        ))}
      </div>
    </WrapCard>
  );
}

function BadgeMedal({ fx }: any){
  return (
    <WrapCard fx={fx} className="flex items-center gap-3">
      <div className="text-sm" style={{ color: C.title }}>Badge / Medal</div>
      <SurfaceBox fx={fx} className="relative grid place-items-center w-12 h-12 rounded-full border text-white" style={{ borderColor: C.border }}>
        <Shield size={16} />
        <span className="absolute -bottom-1 px-1 rounded bg-[#1F3B5D] text-[10px] text-white">LVL 50</span>
      </SurfaceBox>
    </WrapCard>
  );
}

function ToastDemo({ fx }: any){
  const [show,setShow] = useState(false);
  return (
    <WrapCard fx={fx}>
      <div className="flex items-center justify-between">
        <div className="text-sm" style={{ color: C.title }}>Toast / Notification</div>
        <SurfaceBox fx={fx} className="rounded-md border" style={{ borderColor: C.border }}>
          <button onClick={()=>setShow(true)} className="px-2 py-1 text-xs text-white">Show</button>
        </SurfaceBox>
      </div>
      {show && (
        <SurfaceBox fx={fx} className="mt-2 relative rounded-xl border p-2" style={{ borderColor: C.border }}>
          <span className="text-xs text-white">Scan complete • 14 new players</span>
          <button onClick={()=>setShow(false)} className="absolute right-2 top-1 text-xs text-white/80">×</button>
        </SurfaceBox>
      )}
    </WrapCard>
  );
}

function ToggleSwitch({ fx }: any){
  const [on,setOn] = useState(true);
  return (
    <WrapCard fx={fx} className="flex items-center justify-between">
      <div className="text-sm" style={{ color: C.title }}>Toggle Switch</div>
      <SurfaceBox fx={fx} className={`relative h-6 w-11 rounded-full border`} style={{ borderColor: C.border }}>
        <button onClick={()=>setOn((o:boolean)=>!o)} className={`absolute inset-0 rounded-full ${on?"" : "opacity-80"}`} />
        <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full transition-transform`} style={{ transform: `translateX(${on?20:0}px)`, background: "linear-gradient(180deg, #203757, #132338)" }} />
      </SurfaceBox>
    </WrapCard>
  );
}

function DropdownHUD({ fx }: any){
  const [open,setOpen] = useState(false);
  const items = ["Overview","Stats","Activity","Hydra"];
  return (
    <WrapCard fx={fx}>
      <div className="text-sm mb-2" style={{ color: C.title }}>Dropdown HUD</div>
      <SurfaceBox fx={fx} className="w-full text-left rounded-lg border text-xs" style={{ borderColor: C.border }}>
        <button onClick={()=>setOpen((o:boolean)=>!o)} className="w-full px-3 py-2 text-white">Select section…</button>
      </SurfaceBox>
      {open && (
        <SurfaceBox fx={fx} className="mt-2 rounded-lg border" style={{ borderColor: C.border }}>
          {items.map(it => (
            <div key={it} className="px-3 py-2 text-xs text-white/90 hover:bg-white/5">{it}</div>
          ))}
        </SurfaceBox>
      )}
    </WrapCard>
  );
}

function RadialMenuPreview({ fx }: any){
  const items = ["Map","Scan","Log","Info","Fav","Cfg"];
  return (
    <WrapCard fx={fx}>
      <div className="text-sm mb-2" style={{ color: C.title }}>Radial Menu (Preview)</div>
      <div className="relative mx-auto my-2 h-36 w-36">
        <div className="absolute inset-0 rounded-full"
             style={{ border: fx.baseBorder ? `1px solid ${C.border}` : "0 solid transparent" }} />
        {items.map((t,i)=>{
          const angle = (i/items.length) * Math.PI*2;
          const r = 56;
          const x = 56 + Math.cos(angle)*r;
          const y = 56 + Math.sin(angle)*r;
          return (
            <SurfaceBox key={t} fx={fx} className="absolute -ml-5 -mt-5 h-10 w-10 rounded-full border grid place-items-center text-[10px] text-white" style={{ left: x, top: y, borderColor: C.border }}>
              {t}
            </SurfaceBox>
          );
        })}
        <SurfaceBox fx={fx} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-12 w-12 rounded-full border grid place-items-center text-[11px] text-white" style={{ borderColor: C.border }}>
          Menu
        </SurfaceBox>
      </div>
    </WrapCard>
  );
}

function PaginationHUD({ fx }: any){
  const pages = [1,2,3,4,5];
  const [cur,setCur] = useState(2);
  return (
    <WrapCard fx={fx}>
      <div className="text-sm mb-2" style={{ color: C.title }}>Pagination HUD</div>
      <div className="flex items-center gap-2">
        {pages.map(p => (
          <SurfaceBox key={p} fx={fx} className={`rounded-md border px-3 py-1 text-xs ${p===cur?"" : "opacity-80"}`} style={{ borderColor: C.border }}>
            <button className="text-white" onClick={()=>setCur(p)}>{p}</button>
          </SurfaceBox>
        ))}
      </div>
    </WrapCard>
  );
}

function ModalHUD({ fx }: any){
  const [open,setOpen]=useState(false);
  return (
    <WrapCard fx={fx}>
      <div className="flex items-center justify-between">
        <div className="text-sm" style={{ color: C.title }}>Modal HUD</div>
        <SurfaceBox fx={fx} className="rounded-md border" style={{ borderColor: C.border }}>
          <button onClick={()=>setOpen(true)} className="px-2 py-1 text-xs text-white">Open</button>
        </SurfaceBox>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
          <SurfaceBox fx={fx} className="min-w-[260px] rounded-2xl border p-4 text-white" style={{ borderColor: C.border }}>
            <div className="text-sm mb-2">Mission Brief</div>
            <div className="text-xs opacity-80">Scan completed. 14 anomalies detected. Proceed?</div>
            <div className="mt-3 flex gap-2">
              <SurfaceBox fx={fx} className="rounded-md border" style={{ borderColor: C.border }}>
                <button className="px-2 py-1 text-xs" onClick={()=>setOpen(false)}>Cancel</button>
              </SurfaceBox>
              <SurfaceBox fx={fx} className="rounded-md border" style={{ borderColor: C.border }}>
                <button className="px-2 py-1 text-xs">Confirm</button>
              </SurfaceBox>
            </div>
          </SurfaceBox>
        </div>
      )}
    </WrapCard>
  );
}

function SearchHUD({ fx }: any){
  const [q,setQ]=useState("");
  return (
    <WrapCard fx={fx}>
      <div className="text-sm mb-2" style={{ color: C.title }}>Search HUD</div>
      <SurfaceBox fx={fx} className="rounded-lg border p-2" style={{ borderColor: C.border }}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Type to search…" className="w-full bg-transparent text-xs text-white outline-none placeholder:text-white/50" />
      </SurfaceBox>
    </WrapCard>
  );
}

function ListSelectableHUD({ fx }: any){
  const items = ["Alpha","Bravo","Charlie","Delta"];
  const [sel,setSel]=useState("Bravo");
  return (
    <WrapCard fx={fx}>
      <div className="text-sm mb-2" style={{ color: C.title }}>List Selectable</div>
      <div className="space-y-2">
        {items.map(it => (
          <SurfaceBox key={it} fx={fx} className={`rounded-md border px-3 py-2 text-xs text-white ${sel===it?"" : "opacity-80"}`} style={{ borderColor: C.border }}>
            <button className="w-full text-left" onClick={()=>setSel(it)}>{it}</button>
          </SurfaceBox>
        ))}
      </div>
    </WrapCard>
  );
}

function StepsHUD({ fx }: any){
  const steps=["Init","Scan","Verify","Done"];
  const [i,setI]=useState(1);
  return (
    <WrapCard fx={fx}>
      <div className="text-sm mb-2" style={{ color: C.title }}>Steps</div>
      <div className="flex items-center gap-3">
        {steps.map((s,idx)=> (
          <React.Fragment key={s}>
            <SurfaceBox fx={fx} className={`grid h-8 w-8 place-items-center rounded-full border text-xs text-white ${idx<=i?"" : "opacity-70"}`} style={{ borderColor: C.border }}>{idx+1}</SurfaceBox>
            {idx<steps.length-1 && <div className="h-px w-8 bg-white/20" />}
          </React.Fragment>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <SurfaceBox fx={fx} className="rounded-md border" style={{ borderColor: C.border }}>
          <button className="px-2 py-1 text-xs text-white" onClick={()=>setI(Math.max(0,i-1))}>Back</button>
        </SurfaceBox>
        <SurfaceBox fx={fx} className="rounded-md border" style={{ borderColor: C.border }}>
          <button className="px-2 py-1 text-xs text-white" onClick={()=>setI(Math.min(steps.length-1,i+1))}>Next</button>
        </SurfaceBox>
      </div>
    </WrapCard>
  );
}

function DockBarHUD({ fx }: any){
  const items=["⚡","◆","⬡","⛨","◎","☰"];
  return (
    <WrapCard fx={fx}>
      <div className="text-sm mb-2" style={{ color: C.title }}>Dock Bar</div>
      <div className="flex items-center gap-2">
        {items.map((t,idx)=> (
          <SurfaceBox key={idx} fx={fx} className="grid h-10 w-10 place-items-center rounded-xl border text-white" style={{ borderColor: C.border }}>{t}</SurfaceBox>
        ))}
      </div>
    </WrapCard>
  );
}

// ---- Main Screen ----
export default function GameButtonsPlayground() {
  const [fx, setFx] = useState(initialFx);
  return (
    <div className="min-h-screen p-6 md:p-10 space-y-6" style={{ backgroundColor: C.bg, color: C.txt }}>
      <GlobalStyles />
      <header className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Layers />
            <h1 className="text-xl font-bold" style={{ color: C.title }}>Game Buttons Playground</h1>
            <span className="text-xs" style={{ color: C.txt2 }}>(Materials + FX extended + Presets)</span>
          </div>
        </div>
        <Togglebar fx={fx} setFx={setFx} />
      </header>

      <section className="grid gap-4">
        {/* Shapes Card */}
        <div className="rounded-2xl p-4"
             style={{ backgroundColor: C.tile, border: fx.baseBorder ? `1px solid ${C.border}` : "0 solid transparent" }}>
          <h2 className="font-semibold mb-3" style={{ color: C.title }}>Shapes</h2>
          <div className="flex flex-wrap gap-3">
            <DiamondButton fx={fx}><DiamondIcon size={16}/> Diamond</DiamondButton>
            <HexButton fx={fx}><Hexagon size={16}/> Hex</HexButton>
            <OctagonButton fx={fx}><Shield size={16}/> Octagon/Shield</OctagonButton>
            <ShardButton fx={fx}><Shapes size={16}/> Shard</ShardButton>
            <PillChip fx={fx}><Aperture size={16}/> Pill/Chip</PillChip>
            <NeonIconButton fx={fx} />
          </div>
        </div>

        {/* Tabs Card */}
        <div className="rounded-2xl p-4 space-y-3"
             style={{ backgroundColor: C.tile, border: fx.baseBorder ? `1px solid ${C.border}` : "0 solid transparent" }}>
          <h2 className="font-semibold" style={{ color: C.title }}>Tabs</h2>
          <SegmentedTabs fx={fx} tabs={["Overview","Stats","Activity","Hydra"]} />
        </div>
      </section>

      <section className="grid gap-4">
        {/* More HUD Patterns Card */}
        <div className="rounded-2xl p-4"
             style={{ backgroundColor: C.tile, border: fx.baseBorder ? `1px solid ${C.border}` : "0 solid transparent" }}>
          <h2 className="font-semibold mb-3" style={{ color: C.title }}>More HUD Patterns</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <ToggleChips fx={fx} />
            <IconToolbar fx={fx} />
            <BreadcrumbHUD fx={fx} />
            <StatTiles fx={fx} />
            <MeterBar fx={fx} />
            <BadgeMedal fx={fx} />
            <ToastDemo fx={fx} />
            <ToggleSwitch fx={fx} />
            <DropdownHUD fx={fx} />
            <RadialMenuPreview fx={fx} />
            <PaginationHUD fx={fx} />
            <ModalHUD fx={fx} />
            <SearchHUD fx={fx} />
            <ListSelectableHUD fx={fx} />
            <StepsHUD fx={fx} />
            <DockBarHUD fx={fx} />
          </div>
        </div>
      </section>

      <DevTests />
      <footer className="text-center text-xs" style={{ color: C.txt2 }}>SFDataHub palette • Tailwind • No external assets</footer>
    </div>
  );
}

// ---- Dev Tests ----
function DevTests(){
  useEffect(()=>{
    try {
      const materials = ["metal","crystal","carbon","chrome","gold","obsidian","neon","plasma","aurora","satin","matte","holo"];
      console.assert(materials.includes(initialFx.material), "Material type present");
      const surf = surfaceStyles(initialFx);
      console.assert(surf && typeof surf === 'object', 'surfaceStyles returns object');
      materials.forEach(m=>{
        const s = materialSurface({ ...initialFx, material:m });
        console.assert(s && typeof s === 'object', `materialSurface ok for ${m}`);
      });
      const toggleKeys = [
        'baseBorder',
        'glow','shine','scan','pulse','depth','bevel','outline','gradBorder','hologram','vignette','press',
        'noiseTex','rimLight','innerGlow2','innerShadow2','sparkles','tilt','lift','doubleBorder','cornerNotch','stripesDiag'
      ];
      toggleKeys.forEach(k=> { console.assert(typeof (initialFx as any)[k] === 'boolean', `toggle ${k} is boolean`); });
      Object.entries(PRESETS).forEach(([name,fn])=>{
        console.assert(typeof fn === 'function', `preset ${name} is function`);
        const next = fn({ ...initialFx });
        console.assert(next && typeof next === 'object', `preset ${name} returns state`);
      });
      console.log('%cGame Buttons Playground – Dev tests ok','color:#7FB2FF');
    } catch (e) { console.error('DevTests error', e); }
  },[]);
  return null;
}
