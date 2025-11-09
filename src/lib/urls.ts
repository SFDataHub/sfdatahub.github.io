/** Extrahiert eine Google-Drive File-ID aus diversen Linkformaten oder roh übergebener ID. */
export function getDriveId(input?: unknown): string | null {
  if (input == null) return null;
  const v = typeof input === "string" ? input : String(input);
  if (!v.trim()) return null;

  // reine ID?
  if (/^[a-zA-Z0-9_-]{20,}$/.test(v)) return v;

  // /file/d/FILE_ID/...
  const m1 = v.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m1?.[1]) return m1[1];

  // ?id=FILE_ID
  const m2 = v.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (m2?.[1]) return m2[1];

  // /uc?…&id=FILE_ID
  const m3 = v.match(/\/uc\?[^#]*\bid=([a-zA-Z0-9_-]{20,})/);
  if (m3?.[1]) return m3[1];

  return null;
}

/** Direkte Ansicht (PNG/JPG/GIF) für <img src>. */
export function toDriveDirect(urlOrId?: unknown): string | undefined {
  if (urlOrId == null) return undefined;
  const id = getDriveId(urlOrId);
  return id ? `https://drive.google.com/uc?export=view&id=${id}` : String(urlOrId);
}

/** Thumbnail-Endpoint (seltener 403/Redirects). Größe in px. */
export function toDriveThumb(urlOrId?: unknown, size = 64): string | undefined {
  if (urlOrId == null) return undefined;
  const id = getDriveId(urlOrId);
  if (!id) return String(urlOrId);
  const w = Math.max(32, Math.round(size));
  return `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;
}

/**
 * Proxy über images.weserv.nl, um CORS/403 von Fremdquellen zu umgehen.
 * Achtung: Wenn das Upstream-Format umcodiert wird, können GIF-Animationen verloren gehen.
 */
export function viaImgProxy(
  url: string,
  opts?: { w?: number; h?: number; fit?: "contain" | "cover" }
) {
  const base = "https://images.weserv.nl/";
  const params = new URLSearchParams();
  if (opts?.w) params.set("w", String(Math.max(1, Math.floor(opts.w))));
  if (opts?.h) params.set("h", String(Math.max(1, Math.floor(opts.h))));
  if (opts?.fit) params.set("fit", opts.fit);
  return `${base}?url=${encodeURIComponent(url)}${params.toString() ? "&" + params.toString() : ""}`;
}

/** Bequeme Helfer-Kombi: direkte Drive-URL -> proxied */
export function toDriveDirectProxy(
  urlOrId?: unknown,
  w?: number,
  h?: number,
  fit?: "contain" | "cover"
) {
  const direct = toDriveDirect(urlOrId);
  return direct ? viaImgProxy(direct, { w, h, fit }) : undefined;
}
export function toDriveThumbProxy(urlOrId?: unknown, size = 64) {
  const thumb = toDriveThumb(urlOrId, size);
  return thumb ? viaImgProxy(thumb, { w: size, h: size, fit: "contain" }) : undefined;
}

/* ==================== RAW (für animierte GIFs) ==================== */

/** RAW-Bildpfad über googleusercontent – liefert Bytes direkt (GIF-Animation bleibt). */
export function toDriveRawImage(urlOrId?: unknown): string | undefined {
  if (urlOrId == null) return undefined;
  const id = getDriveId(urlOrId);
  if (id) return `https://lh3.googleusercontent.com/d/${id}`;

  // Nur echte URL-Strings akzeptieren – niemals Objekte in einen String casten
  if (typeof urlOrId === "string" && /^https?:\/\//i.test(urlOrId)) return urlOrId;

  // sonst kein gültiger RAW-URL-Wert
  return undefined;
}

/** Proxy, der die Bytes NICHT transformiert (n=-1) → Animation bleibt erhalten. */
export function viaImgProxyRaw(url: string): string {
  return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&n=-1`;
}

/**
 * Kompatibilitäts-Helper: `gdrive`
 *  - gdrive(urlOrId) -> Direct-URL
 *  - gdrive.thumb(urlOrId, size)
 *  - gdrive.proxy(urlOrId, w, h, fit)
 *  - gdrive.thumbProxy(urlOrId, size)
 *  - gdrive.raw(urlOrId) -> googleusercontent-RAW (für GIFs empfohlen)
 *  - gdrive.gif(urlOrId) -> Alias auf raw
 *  - gdrive.gifProxy(urlOrId) -> RAW über Proxy (keine Umwandlung, Animation bleibt)
 */
type GDriveHelper = ((
  urlOrId?: unknown
) => string | undefined) & {
  id: typeof getDriveId;
  direct: typeof toDriveDirect;
  thumb: typeof toDriveThumb;
  proxy: typeof toDriveDirectProxy;
  thumbProxy: typeof toDriveThumbProxy;
  raw: typeof toDriveRawImage;
  gif: typeof toDriveRawImage;
  gifProxy: (urlOrId?: unknown) => string | undefined;
};

export const gdrive: GDriveHelper = Object.assign(
  (urlOrId?: unknown) => toDriveDirect(urlOrId),
  {
    id: getDriveId,
    direct: toDriveDirect,
    thumb: toDriveThumb,
    proxy: toDriveDirectProxy,
    thumbProxy: toDriveThumbProxy,
    raw: toDriveRawImage,
    gif: toDriveRawImage,
    gifProxy: (urlOrId?: unknown) => {
      const raw = toDriveRawImage(urlOrId);
      // Nur proxyn, wenn wir wirklich eine HTTP-URL haben – sonst kein Proxy,
      // damit niemals "?url=%5Bobject%20Object%5D" entsteht.
      if (raw && /^https?:\/\//i.test(raw)) return viaImgProxyRaw(raw);
      // Fallback: direkte (view)-URL zurückgeben, die Browser-seitig geladen wird
      return toDriveDirect(urlOrId);
    },
  }
);
