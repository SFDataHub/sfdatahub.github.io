// src/lib/urls.ts

/** Extrahiert eine Google-Drive File-ID aus diversen Linkformaten oder roh übergebener ID. */
export function getDriveId(input?: string): string | null {
  if (!input) return null;
  // reine ID?
  if (/^[a-zA-Z0-9_-]{20,}$/.test(input)) return input;

  // /file/d/FILE_ID/...
  const m1 = input.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m1?.[1]) return m1[1];

  // ?id=FILE_ID
  const m2 = input.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (m2?.[1]) return m2[1];

  // /uc?…&id=FILE_ID
  const m3 = input.match(/\/uc\?[^#]*\bid=([a-zA-Z0-9_-]{20,})/);
  if (m3?.[1]) return m3[1];

  return null;
}

/** Direkte Ansicht (PNG/JPG) für <img src>. */
export function toDriveDirect(urlOrId?: string): string | undefined {
  if (!urlOrId) return undefined;
  const id = getDriveId(urlOrId);
  return id ? `https://drive.google.com/uc?export=view&id=${id}` : urlOrId;
}

/** Thumbnail-Endpoint (seltener 403/Redirects). Größe in px. */
export function toDriveThumb(urlOrId?: string, size = 64): string | undefined {
  if (!urlOrId) return undefined;
  const id = getDriveId(urlOrId);
  if (!id) return urlOrId;
  const w = Math.max(32, Math.round(size));
  return `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;
}

/**
 * Proxy über images.weserv.nl, um CORS/403 von Fremdquellen zu umgehen.
 * - Gibt ein öffentlich abrufbares Bild zurück (mit CORS-Headern).
 * - Du kannst width/height/fit steuern, Standard: passt nur Breite an.
 */
export function viaImgProxy(url: string, opts?: { w?: number; h?: number; fit?: "contain" | "cover" }) {
  const base = "https://images.weserv.nl/";
  const params = new URLSearchParams();
  if (opts?.w) params.set("w", String(Math.max(1, Math.floor(opts.w))));
  if (opts?.h) params.set("h", String(Math.max(1, Math.floor(opts.h))));
  if (opts?.fit) params.set("fit", opts.fit); // contain/cover
  // Cache-Buster klein halten, nur wenn nötig
  // params.set("n", "1"); // (optional) no-cache
  return `${base}?url=${encodeURIComponent(url)}${params.toString() ? "&" + params.toString() : ""}`;
}

/** Bequeme Helfer-Kombi: direkte Drive-URL -> proxied */
export function toDriveDirectProxy(urlOrId?: string, w?: number, h?: number, fit?: "contain"|"cover") {
  const direct = toDriveDirect(urlOrId);
  return direct ? viaImgProxy(direct, { w, h, fit }) : undefined;
}
export function toDriveThumbProxy(urlOrId?: string, size = 64) {
  const thumb = toDriveThumb(urlOrId, size);
  return thumb ? viaImgProxy(thumb, { w: size, h: size, fit: "contain" }) : undefined;
}

/**
 * Kompatibilitäts-Helper: `gdrive`
 *  - gdrive(urlOrId) -> Direct-URL
 *  - gdrive.thumb(urlOrId, size)
 *  - gdrive.proxy(urlOrId, w, h, fit)
 *  - gdrive.thumbProxy(urlOrId, size)
 */
type GDriveHelper = ((
  urlOrId?: string
) => string | undefined) & {
  id: typeof getDriveId;
  direct: typeof toDriveDirect;
  thumb: typeof toDriveThumb;
  proxy: typeof toDriveDirectProxy;
  thumbProxy: typeof toDriveThumbProxy;
};

export const gdrive: GDriveHelper = Object.assign(
  (urlOrId?: string) => toDriveDirect(urlOrId),
  {
    id: getDriveId,
    direct: toDriveDirect,
    thumb: toDriveThumb,
    proxy: toDriveDirectProxy,
    thumbProxy: toDriveThumbProxy,
  }
);
