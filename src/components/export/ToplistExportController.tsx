import React from "react";
import html2canvas from "html2canvas";

import ToplistPngExportDialog, {
  type ToplistExportAmount,
} from "./ToplistPngExportDialog";

export type ToplistExportKind = "players" | "guilds";

export type ToplistCaptureStatus = {
  loading: boolean;
  rowCount: number;
  ready: boolean;
  stabilityKey: string;
  compareLoading?: boolean;
  compareExpected?: boolean;
  showCompare?: boolean;
  virtualRowHeight?: number;
  virtualTotalSize?: number;
};

export type ToplistExportControllerHandle = {
  open: () => void;
  notifyLiveCaptureStatus: (kind: ToplistExportKind, status: ToplistCaptureStatus) => void;
};

type ToplistCaptureContext = {
  color: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
};

type ToplistPresetRenderState = {
  kind: ToplistExportKind;
  amount: ToplistExportAmount;
  width: number;
  backgroundColor: string;
  context: ToplistCaptureContext;
};

type ToplistExportControllerProps = {
  activeKind: ToplistExportKind;
  liveTableRef: React.RefObject<HTMLDivElement>;
  renderPresetContent: (args: {
    kind: ToplistExportKind;
    amount: ToplistExportAmount;
    tableRef: React.RefObject<HTMLDivElement>;
    onCaptureStatusChange: (status: ToplistCaptureStatus) => void;
  }) => React.ReactNode;
};

const EMPTY_CAPTURE_STATUS: ToplistCaptureStatus = {
  loading: true,
  rowCount: 0,
  ready: false,
  stabilityKey: "uninitialized",
  compareLoading: false,
  compareExpected: false,
  showCompare: false,
  virtualRowHeight: 0,
  virtualTotalSize: 0,
};

const resolveExportBackground = (tableRoot: HTMLElement) => {
  let node: HTMLElement | null = tableRoot;
  while (node) {
    const color = window.getComputedStyle(node).backgroundColor;
    if (color && color !== "transparent" && color !== "rgba(0, 0, 0, 0)") {
      return color;
    }
    node = node.parentElement;
  }
  return "#0C1C2E";
};

const resolveExportContext = (tableRoot: HTMLElement): ToplistCaptureContext => {
  const styles = window.getComputedStyle(tableRoot);
  return {
    color: styles.color || "#D6E4F7",
    fontFamily: styles.fontFamily || "inherit",
    fontSize: styles.fontSize || "14px",
    fontWeight: styles.fontWeight || "400",
    lineHeight: styles.lineHeight || "normal",
    letterSpacing: styles.letterSpacing || "normal",
  };
};

const waitForAnimationFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const waitForStableNode = async (
  resolveNode: () => HTMLElement | null,
  opts?: { timeoutMs?: number; requiredStableFrames?: number },
): Promise<HTMLElement | null> => {
  const timeoutMs = opts?.timeoutMs ?? 3000;
  const requiredStableFrames = opts?.requiredStableFrames ?? 2;
  const deadline = Date.now() + timeoutMs;
  let lastNode: HTMLElement | null = null;
  let stableFrames = 0;

  while (Date.now() < deadline) {
    const node = resolveNode();
    if (node && node.isConnected && document.contains(node)) {
      if (node === lastNode) stableFrames += 1;
      else stableFrames = 1;
      lastNode = node;
      if (stableFrames >= requiredStableFrames) return node;
    } else {
      lastNode = null;
      stableFrames = 0;
    }
    await waitForAnimationFrame();
  }

  return resolveNode();
};

const waitForImagesInNode = async (node: HTMLElement) => {
  const images = Array.from(node.querySelectorAll<HTMLImageElement>("img"));
  await Promise.all(
    images.map(async (img) => {
      if (!img.complete) {
        await new Promise<void>((resolve) => {
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
        });
      }
      if (typeof img.decode === "function") {
        try {
          await img.decode();
        } catch {
          // Ignore decode failures caused by partial/cross-origin images.
        }
      }
    }),
  );
};

const waitForFontsReady = async () => {
  const fonts = typeof document !== "undefined" ? (document as Document & { fonts?: FontFaceSet }).fonts : null;
  if (!fonts?.ready) return;
  try {
    await fonts.ready;
  } catch {
    // Ignore font loading failures and continue with the capture.
  }
};

const TOPLIST_CAPTURE_TARGET_ATTR = "data-toplists-capture-target";
const TOPLIST_CAPTURE_SCROLL_ATTR = "data-toplists-capture-scroll-id";
const TOPLIST_PRESET_HOST_ATTR = "data-toplists-export-preset-host";
const TOPLIST_EXPORT_TOP_BLEED_ATTR = "data-toplists-export-top-bleed";
const TOPLIST_EXPORT_TOP_BLEED = 72;

type CaptureScrollState = Record<string, {
  top: number;
  left: number;
  offsetWidth: number;
  offsetHeight: number;
  clientWidth: number;
  clientHeight: number;
  isExportScroll: boolean;
}>;

const waitForStableLayout = async (node: HTMLElement) => {
  let previous = "";
  for (let i = 0; i < 6; i += 1) {
    await waitForAnimationFrame();
    const rect = node.getBoundingClientRect();
    const current = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
    if (current === previous) return;
    previous = current;
  }
};

const isScrollableNode = (node: HTMLElement) => {
  const verticalOverflow = node.scrollHeight - node.clientHeight > 1;
  const horizontalOverflow = node.scrollWidth - node.clientWidth > 1;
  return verticalOverflow || horizontalOverflow;
};

const markCaptureTarget = (node: HTMLElement) => {
  const previous = node.getAttribute(TOPLIST_CAPTURE_TARGET_ATTR);
  node.setAttribute(TOPLIST_CAPTURE_TARGET_ATTR, "1");
  return () => {
    if (previous == null) node.removeAttribute(TOPLIST_CAPTURE_TARGET_ATTR);
    else node.setAttribute(TOPLIST_CAPTURE_TARGET_ATTR, previous);
  };
};

const collectCaptureScrollState = (captureTarget: HTMLElement) => {
  const candidates = new Set<HTMLElement>();
  let current: HTMLElement | null = captureTarget;
  while (current) {
    candidates.add(current);
    current = current.parentElement;
  }
  captureTarget.querySelectorAll<HTMLElement>("*").forEach((node) => {
    candidates.add(node);
  });

  const scrollState: CaptureScrollState = {};
  const taggedNodes: Array<{ node: HTMLElement; previous: string | null }> = [];
  let index = 0;

  for (const node of candidates) {
    if (!isScrollableNode(node)) continue;
    const id = String(index++);
    const previous = node.getAttribute(TOPLIST_CAPTURE_SCROLL_ATTR);
    node.setAttribute(TOPLIST_CAPTURE_SCROLL_ATTR, id);
    taggedNodes.push({ node, previous });
    scrollState[id] = {
      top: node.scrollTop,
      left: node.scrollLeft,
      offsetWidth: node.offsetWidth,
      offsetHeight: node.offsetHeight,
      clientWidth: node.clientWidth,
      clientHeight: node.clientHeight,
      isExportScroll: node.getAttribute("data-toplists-export-scroll") === "true",
    };
  }

  const cleanup = () => {
    taggedNodes.forEach(({ node, previous }) => {
      if (previous == null) node.removeAttribute(TOPLIST_CAPTURE_SCROLL_ATTR);
      else node.setAttribute(TOPLIST_CAPTURE_SCROLL_ATTR, previous);
    });
  };

  return { scrollState, cleanup };
};

const applyCloneScrollState = (clonedDoc: Document, scrollState: CaptureScrollState) => {
  for (const [id, state] of Object.entries(scrollState)) {
    const clonedNode = clonedDoc.querySelector<HTMLElement>(`[${TOPLIST_CAPTURE_SCROLL_ATTR}='${id}']`);
    if (!clonedNode) continue;
    clonedNode.scrollTop = state.top;
    clonedNode.scrollLeft = state.left;
    if (!state.isExportScroll) continue;

    const scrollbarX = Math.max(0, Math.round(state.offsetWidth - state.clientWidth));
    const scrollbarY = Math.max(0, Math.round(state.offsetHeight - state.clientHeight));
    clonedNode.style.boxSizing = "border-box";
    clonedNode.style.width = `${Math.max(1, Math.round(state.offsetWidth))}px`;
    clonedNode.style.minWidth = `${Math.max(1, Math.round(state.offsetWidth))}px`;
    clonedNode.style.maxWidth = `${Math.max(1, Math.round(state.offsetWidth))}px`;
    clonedNode.style.height = `${Math.max(1, Math.round(state.offsetHeight))}px`;
    clonedNode.style.minHeight = `${Math.max(1, Math.round(state.offsetHeight))}px`;
    clonedNode.style.maxHeight = `${Math.max(1, Math.round(state.offsetHeight))}px`;
    clonedNode.style.overflowX = "hidden";
    clonedNode.style.overflowY = "hidden";
    clonedNode.style.scrollbarGutter = "auto";
    if (scrollbarX > 0) clonedNode.style.paddingRight = `${scrollbarX}px`;
    if (scrollbarY > 0) clonedNode.style.paddingBottom = `${scrollbarY}px`;
  }
};

const prepareCloneImages = (node: HTMLElement) => {
  const images = Array.from(node.querySelectorAll<HTMLImageElement>("img"));
  for (const img of images) {
    img.loading = "eager";
    img.decoding = "sync";
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
  }
};

const normalizeImageSrcKey = (value: string | null | undefined) => String(value ?? "").trim();

const isToplistIconSource = (value: string) => {
  const normalized = normalizeImageSrcKey(value).toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("images.weserv.nl") ||
    normalized.includes("drive.google.com") ||
    normalized.includes("googleusercontent.com")
  );
};

const readBlobAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image blob"));
    reader.readAsDataURL(blob);
  });

const resolveImageDataUrl = async (src: string): Promise<string | null> => {
  try {
    const response = await fetch(src, {
      mode: "cors",
      credentials: "omit",
      cache: "force-cache",
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return null;
    const dataUrl = await readBlobAsDataUrl(blob);
    return dataUrl || null;
  } catch {
    return null;
  }
};

const getCachedImageDataUrl = (
  cache: Map<string, Promise<string | null>>,
  src: string,
) => {
  const key = normalizeImageSrcKey(src);
  if (!key) return Promise.resolve<string | null>(null);
  const existing = cache.get(key);
  if (existing) return existing;
  const next = resolveImageDataUrl(key);
  cache.set(key, next);
  return next;
};

const buildToplistIconDataUrlMap = async (
  captureTarget: HTMLElement,
  cache: Map<string, Promise<string | null>>,
) => {
  const sourceKeys = new Set<string>();
  const iconNodes = Array.from(captureTarget.querySelectorAll<HTMLImageElement>("img.class-icon-toplist"));
  iconNodes.forEach((img) => {
    const attrSrc = normalizeImageSrcKey(img.getAttribute("src"));
    const currentSrc = normalizeImageSrcKey(img.currentSrc);
    if (attrSrc && isToplistIconSource(attrSrc)) sourceKeys.add(attrSrc);
    if (currentSrc && isToplistIconSource(currentSrc)) sourceKeys.add(currentSrc);
  });

  if (!sourceKeys.size) return new Map<string, string>();
  const entries = await Promise.all(
    Array.from(sourceKeys).map(async (src) => [src, await getCachedImageDataUrl(cache, src)] as const),
  );
  const resolvedMap = new Map<string, string>();
  entries.forEach(([src, dataUrl]) => {
    if (!dataUrl) return;
    resolvedMap.set(src, dataUrl);
  });
  return resolvedMap;
};

const applyToplistIconDataUrlMap = (
  captureRoot: HTMLElement,
  dataUrlBySource: Map<string, string>,
) => {
  if (!dataUrlBySource.size) return;
  const iconNodes = Array.from(captureRoot.querySelectorAll<HTMLImageElement>("img.class-icon-toplist"));
  iconNodes.forEach((img) => {
    const attrSrc = normalizeImageSrcKey(img.getAttribute("src"));
    const currentSrc = normalizeImageSrcKey(img.currentSrc);
    const dataUrl = dataUrlBySource.get(attrSrc) ?? dataUrlBySource.get(currentSrc);
    if (!dataUrl) return;
    img.src = dataUrl;
    img.removeAttribute("srcset");
  });
};

const isValueCrossfadeCloneNode = (node: HTMLElement): node is HTMLSpanElement => {
  if (!(node instanceof HTMLSpanElement)) return false;
  const children = Array.from(node.children).filter((child): child is HTMLSpanElement => child instanceof HTMLSpanElement);
  if (children.length < 3) return false;
  const [ghost, previous, next] = children;
  return ghost.style.visibility === "hidden" && previous.style.position === "absolute" && next.style.position === "absolute";
};

const collapseValueCrossfadeCloneNodes = (captureRoot: HTMLElement) => {
  const candidates = Array.from(captureRoot.querySelectorAll<HTMLElement>("span"));
  candidates.forEach((node) => {
    if (!isValueCrossfadeCloneNode(node)) return;
    const children = Array.from(node.children).filter((child): child is HTMLSpanElement => child instanceof HTMLSpanElement);
    const textCandidates = [
      children[2]?.textContent,
      children[0]?.textContent,
      node.textContent,
    ]
      .map((value) => String(value ?? "").replace(/\s+/g, " ").trim())
      .filter((value) => value.length > 0);
    const resolvedText = textCandidates[0] ?? "";
    node.textContent = resolvedText;
    node.style.position = "static";
    node.style.display = "inline-block";
    node.style.minWidth = "0";
    node.style.width = "auto";
    node.style.whiteSpace = "nowrap";
    node.style.lineHeight = "1";
    node.style.top = "0";
    node.style.bottom = "auto";
    node.style.transform = "none";
  });
};

const prependToplistExportTopBleed = (
  captureRoot: HTMLElement,
  backgroundColor: string,
) => {
  if (captureRoot.querySelector(`[${TOPLIST_EXPORT_TOP_BLEED_ATTR}='true']`)) return;
  const doc = captureRoot.ownerDocument;
  const spacer = doc.createElement("div");
  spacer.setAttribute(TOPLIST_EXPORT_TOP_BLEED_ATTR, "true");
  spacer.style.width = "100%";
  spacer.style.height = `${TOPLIST_EXPORT_TOP_BLEED}px`;
  spacer.style.minHeight = `${TOPLIST_EXPORT_TOP_BLEED}px`;
  spacer.style.maxHeight = `${TOPLIST_EXPORT_TOP_BLEED}px`;
  spacer.style.background = backgroundColor;
  spacer.style.flex = "0 0 auto";
  captureRoot.prepend(spacer);
};

const isValidCaptureCanvas = (canvas: HTMLCanvasElement | null | undefined): canvas is HTMLCanvasElement =>
  Boolean(canvas && canvas.width > 0 && canvas.height > 0);

const captureStatusReady = (status: ToplistCaptureStatus | null | undefined) => {
  if (!status) return false;
  if (status.loading) return false;
  if (status.rowCount <= 0) return false;
  return status.ready;
};

const ToplistExportController = React.forwardRef<ToplistExportControllerHandle, ToplistExportControllerProps>(
  function ToplistExportController({
    activeKind,
    liveTableRef,
    renderPresetContent,
  }, ref) {
    const presetTableRef = React.useRef<HTMLDivElement | null>(null);
    const iconDataUrlPromiseCacheRef = React.useRef<Map<string, Promise<string | null>>>(new Map());
    const liveCaptureStatusRef = React.useRef<Record<ToplistExportKind, ToplistCaptureStatus>>({
      players: EMPTY_CAPTURE_STATUS,
      guilds: EMPTY_CAPTURE_STATUS,
    });
    const presetCaptureStatusRef = React.useRef<ToplistCaptureStatus>(EMPTY_CAPTURE_STATUS);
    const [isExportDialogOpen, setIsExportDialogOpen] = React.useState(false);
    const [exportAmount, setExportAmount] = React.useState<ToplistExportAmount>(50);
    const [presetRenderState, setPresetRenderState] = React.useState<ToplistPresetRenderState | null>(null);
    const [isExportingPng, setIsExportingPng] = React.useState(false);

    const handlePresetCaptureStatusChange = React.useCallback((status: ToplistCaptureStatus) => {
      presetCaptureStatusRef.current = status;
    }, []);

    React.useImperativeHandle(ref, () => ({
      open: () => {
        setExportAmount(50);
        setIsExportDialogOpen(true);
      },
      notifyLiveCaptureStatus: (kind, status) => {
        liveCaptureStatusRef.current[kind] = status;
      },
    }), []);

    const waitForCaptureReady = React.useCallback(async ({
      resolveNode,
      resolveStatus,
      timeoutMs,
      requiredStableFrames,
    }: {
      resolveNode: () => HTMLElement | null;
      resolveStatus: () => ToplistCaptureStatus;
      timeoutMs?: number;
      requiredStableFrames?: number;
    }): Promise<HTMLElement | null> => {
      const deadline = Date.now() + (timeoutMs ?? 12000);
      const minStableFrames = requiredStableFrames ?? 4;
      let stableFrames = 0;
      let lastStableKey = "";

      while (Date.now() < deadline) {
        const node = resolveNode();
        const status = resolveStatus();
        const hasNode = Boolean(node && node.isConnected && document.contains(node));
        const ready = hasNode && captureStatusReady(status);
        const nodeRect = node?.getBoundingClientRect();
        const sizeKey = nodeRect ? `${Math.round(nodeRect.width)}x${Math.round(nodeRect.height)}` : "0x0";
        const stableKey = ready ? `${status.stabilityKey}|${sizeKey}` : "";

        if (ready && stableKey && stableKey === lastStableKey) {
          stableFrames += 1;
        } else if (ready && stableKey) {
          stableFrames = 1;
          lastStableKey = stableKey;
        } else {
          stableFrames = 0;
          lastStableKey = "";
        }

        if (stableFrames >= minStableFrames) {
          return waitForStableNode(resolveNode, {
            timeoutMs: 2000,
            requiredStableFrames: 2,
          });
        }
        await waitForAnimationFrame();
      }

      return null;
    }, []);

    const captureToplistCanvas = React.useCallback(async ({
      kind,
      amount,
      scale,
    }: {
      kind: ToplistExportKind;
      amount: ToplistExportAmount;
      scale: number;
    }): Promise<HTMLCanvasElement | null> => {
      if (typeof document === "undefined") return null;
      const tableRoot = liveTableRef.current;
      if (!tableRoot) return null;

      const width = Math.max(1, Math.round(tableRoot.getBoundingClientRect().width || tableRoot.offsetWidth || 1));
      const backgroundColor = resolveExportBackground(tableRoot);
      const context = resolveExportContext(tableRoot);

      let captureTarget: HTMLElement | null = null;
      try {
        presetCaptureStatusRef.current = {
          ...EMPTY_CAPTURE_STATUS,
          stabilityKey: "preset-mounting",
        };
        setPresetRenderState({
          kind,
          amount,
          width,
          backgroundColor,
          context,
        });
        await waitForAnimationFrame();
        await waitForAnimationFrame();
        captureTarget = await waitForCaptureReady({
          resolveNode: () => presetTableRef.current,
          resolveStatus: () => presetCaptureStatusRef.current,
          timeoutMs: 12000,
          requiredStableFrames: 4,
        });
        if (!captureTarget) return null;
        const resolvedCaptureTarget = captureTarget;

        await waitForFontsReady();
        await waitForImagesInNode(resolvedCaptureTarget);
        await waitForAnimationFrame();
        await waitForStableLayout(resolvedCaptureTarget);

        const rect = resolvedCaptureTarget.getBoundingClientRect();
        const targetWidth = Math.max(1, Math.ceil(rect.width || resolvedCaptureTarget.offsetWidth || 1));
        const targetHeight = Math.max(1, Math.ceil(rect.height || resolvedCaptureTarget.offsetHeight || 1));
        const captureRightBleed = 2;
        const captureTopBleed = TOPLIST_EXPORT_TOP_BLEED;
        const captureWidth = targetWidth + captureRightBleed;
        const captureHeight = targetHeight + captureTopBleed;
        const cloneCaptureHeight = targetHeight + captureTopBleed;
        const viewportWidth = Math.max(1, Math.ceil(document.documentElement.clientWidth || window.innerWidth || captureWidth));
        const viewportHeight = Math.max(1, Math.ceil(document.documentElement.clientHeight || window.innerHeight || captureHeight));
        const captureWindowWidth = Math.max(viewportWidth, captureWidth);
        const captureWindowHeight = Math.max(viewportHeight, captureHeight);
        const iconDataUrlBySource = await buildToplistIconDataUrlMap(
          resolvedCaptureTarget,
          iconDataUrlPromiseCacheRef.current,
        );

        const restoreCaptureTarget = markCaptureTarget(resolvedCaptureTarget);
        const { scrollState, cleanup: cleanupScrollState } = collectCaptureScrollState(resolvedCaptureTarget);
        try {
          const outputScale = Math.max(1, Math.min(2, Number.isFinite(scale) ? scale : 1));
          const runCapture = (useForeignObjectRendering: boolean) => html2canvas(resolvedCaptureTarget, {
            backgroundColor,
            foreignObjectRendering: useForeignObjectRendering,
            scale: outputScale,
            useCORS: true,
            allowTaint: false,
            logging: false,
            imageTimeout: 20000,
            width: captureWidth,
            height: captureHeight,
            windowWidth: captureWindowWidth,
            windowHeight: captureWindowHeight,
            onclone: (clonedDoc) => {
              applyCloneScrollState(clonedDoc, scrollState);
              const clonedTarget = clonedDoc.querySelector<HTMLElement>(`[${TOPLIST_CAPTURE_TARGET_ATTR}='1']`);
              if (!clonedTarget) return;
              applyToplistIconDataUrlMap(clonedTarget, iconDataUrlBySource);
              prependToplistExportTopBleed(clonedTarget, backgroundColor);
              prepareCloneImages(clonedTarget);
              clonedTarget.style.width = `${targetWidth}px`;
              clonedTarget.style.minWidth = `${targetWidth}px`;
              clonedTarget.style.maxWidth = `${targetWidth}px`;
              clonedTarget.style.height = `${cloneCaptureHeight}px`;
              clonedTarget.style.minHeight = `${cloneCaptureHeight}px`;
              clonedTarget.style.maxHeight = `${cloneCaptureHeight}px`;
              collapseValueCrossfadeCloneNodes(clonedTarget);
              const clonedPresetHost = clonedTarget.closest<HTMLElement>(`[${TOPLIST_PRESET_HOST_ATTR}='true']`);
              if (clonedPresetHost) {
                clonedPresetHost.style.transform = "none";
                clonedPresetHost.style.left = "0";
                clonedPresetHost.style.top = "0";
                clonedPresetHost.style.opacity = "1";
                clonedPresetHost.style.visibility = "visible";
              }
            },
          });
          try {
            const primaryCanvas = await runCapture(true);
            if (!isValidCaptureCanvas(primaryCanvas)) {
              throw new Error("Invalid canvas from foreignObject renderer");
            }
            return primaryCanvas;
          } catch {
            const fallbackCanvas = await runCapture(false);
            if (!isValidCaptureCanvas(fallbackCanvas)) {
              throw new Error("Invalid canvas from fallback renderer");
            }
            return fallbackCanvas;
          }
        } finally {
          cleanupScrollState();
          restoreCaptureTarget();
        }
      } finally {
        setPresetRenderState(null);
      }
    }, [liveTableRef, waitForCaptureReady]);

    const handleConfirmExportPng = React.useCallback(async () => {
      if (typeof document === "undefined") return;
      if (!liveTableRef.current || isExportingPng) return;

      setIsExportingPng(true);
      setIsExportDialogOpen(false);
      try {
        const canvas = await captureToplistCanvas({
          kind: activeKind,
          amount: exportAmount,
          scale: Math.max(1, Math.min(2, window.devicePixelRatio || 1)),
        });
        if (!canvas) return;
        await new Promise<void>((resolve, reject) => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Failed to create PNG blob"));
                return;
              }
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.download = "sfdatahub_toplist.png";
              link.href = url;
              link.click();
              URL.revokeObjectURL(url);
              resolve();
            },
            "image/png",
            1,
          );
        });
      } finally {
        setIsExportingPng(false);
      }
    }, [activeKind, captureToplistCanvas, exportAmount, isExportingPng, liveTableRef]);

    return (
      <>
        <ToplistPngExportDialog
          isOpen={isExportDialogOpen}
          amount={exportAmount}
          exporting={isExportingPng}
          onAmountChange={setExportAmount}
          onCancel={() => {
            if (isExportingPng) return;
            setIsExportDialogOpen(false);
          }}
          onExport={handleConfirmExportPng}
        />

        {presetRenderState && (
          <div
            aria-hidden
            data-toplists-export-preset-host="true"
            style={{
              position: "fixed",
              top: 0,
              left: -12000,
              opacity: 0,
              pointerEvents: "none",
              width: `${presetRenderState.width}px`,
              background: presetRenderState.backgroundColor,
              color: presetRenderState.context.color,
              fontFamily: presetRenderState.context.fontFamily,
              fontSize: presetRenderState.context.fontSize,
              fontWeight: presetRenderState.context.fontWeight,
              lineHeight: presetRenderState.context.lineHeight,
              letterSpacing: presetRenderState.context.letterSpacing,
              boxSizing: "border-box",
              overflow: "visible",
              padding: 0,
              margin: 0,
            }}
          >
            {renderPresetContent({
              kind: presetRenderState.kind,
              amount: presetRenderState.amount,
              tableRef: presetTableRef,
              onCaptureStatusChange: handlePresetCaptureStatusChange,
            })}
          </div>
        )}
      </>
    );
  },
);

export default ToplistExportController;
