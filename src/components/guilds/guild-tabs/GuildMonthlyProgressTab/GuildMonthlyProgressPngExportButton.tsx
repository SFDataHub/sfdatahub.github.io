import React from "react";
import html2canvas from "html2canvas";
import styles from "./GuildMonthlyProgressPngExportButton.module.css";

type Props = {
  targetRef: React.RefObject<HTMLElement>;
  fileBaseName?: string;
  exportRootId?: string;
};

const waitForAnimationFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

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

const waitForImagesInNode = async (node: HTMLElement) => {
  const images = Array.from(node.querySelectorAll<HTMLImageElement>("img"));
  if (!images.length) return;

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
          // Ignore decode errors and let html2canvas attempt rendering.
        }
      }
    })
  );
};

const preloadImageSrc = async (src: string) =>
  new Promise<void>((resolve) => {
    const preloader = new Image();
    preloader.crossOrigin = "anonymous";
    preloader.referrerPolicy = "no-referrer";
    preloader.decoding = "async";
    preloader.addEventListener("load", () => resolve(), { once: true });
    preloader.addEventListener("error", () => resolve(), { once: true });
    preloader.src = src;
    if (preloader.complete) resolve();
  });

const warmImageCacheInNode = async (node: HTMLElement) => {
  const urls = new Set<string>();
  for (const img of Array.from(node.querySelectorAll<HTMLImageElement>("img"))) {
    const src = (img.currentSrc || img.src || "").trim();
    if (!src || src.startsWith("data:")) continue;
    urls.add(src);
  }
  if (!urls.size) return;
  await Promise.all(Array.from(urls).map((src) => preloadImageSrc(src)));
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

const sanitizeBaseName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "") || "guild-monthly-progress";

export default function GuildMonthlyProgressPngExportButton({ targetRef, fileBaseName, exportRootId }: Props) {
  const [isExporting, setIsExporting] = React.useState(false);

  const handleExport = async () => {
    if (typeof document === "undefined" || isExporting) return;
    const exportNode = targetRef.current;
    if (!exportNode) return;

    const safeBaseName = sanitizeBaseName(fileBaseName ?? "guild-monthly-progress");
    const fileName = `${safeBaseName}.png`;

    setIsExporting(true);
    try {
      await waitForAnimationFrame();
      await waitForAnimationFrame();
      await waitForImagesInNode(exportNode);
      await warmImageCacheInNode(exportNode);
      await waitForImagesInNode(exportNode);
      if (document.fonts?.ready) await document.fonts.ready;
      await waitForStableLayout(exportNode);

      const rect = exportNode.getBoundingClientRect();
      const targetWidth = Math.max(1, Math.ceil(rect.width));
      const targetHeight = Math.max(1, Math.ceil(rect.height));
      const viewportWidth = Math.max(
        1,
        Math.ceil(document.documentElement.clientWidth || window.innerWidth)
      );
      const viewportHeight = Math.max(
        1,
        Math.ceil(document.documentElement.clientHeight || window.innerHeight)
      );
      const captureWindowWidth = Math.max(viewportWidth, targetWidth);
      const captureWindowHeight = Math.max(viewportHeight, targetHeight);

      const canvas = await html2canvas(exportNode, {
        backgroundColor: null,
        scale: Math.max(1, Math.min(2, window.devicePixelRatio || 1)),
        foreignObjectRendering: false,
        useCORS: true,
        allowTaint: false,
        logging: false,
        imageTimeout: 20000,
        width: targetWidth,
        height: targetHeight,
        windowWidth: captureWindowWidth,
        windowHeight: captureWindowHeight,
        onclone: (clonedDoc) => {
          const clonedExportNode = exportRootId
            ? clonedDoc.querySelector<HTMLElement>(`[data-monthly-progress-export-root-id='${exportRootId}']`)
            : clonedDoc.querySelector<HTMLElement>("[data-monthly-progress-export-root='true']");
          if (clonedExportNode) {
            prepareCloneImages(clonedExportNode);
            clonedExportNode.style.width = `${targetWidth}px`;
            clonedExportNode.style.minWidth = `${targetWidth}px`;
            clonedExportNode.style.maxWidth = `${targetWidth}px`;
            clonedExportNode.style.minHeight = "0";
            clonedExportNode.style.height = "auto";
            clonedExportNode.style.overflow = "visible";
          }
        },
      });

      await new Promise<void>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to create PNG blob"));
              return;
            }
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.download = fileName;
            link.href = url;
            link.click();
            URL.revokeObjectURL(url);
            resolve();
          },
          "image/png",
          1
        );
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      type="button"
      className={styles.exportButton}
      onClick={handleExport}
      disabled={isExporting}
      aria-busy={isExporting}
    >
      {isExporting ? "Exporting..." : "Export PNG"}
    </button>
  );
}
