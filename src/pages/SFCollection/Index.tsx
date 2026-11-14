import { useLayoutEffect, useRef, useState } from "react";
import { trackCollectionDisplay, trackCollectionToolClick } from "../../lib/analytics/localEvents";
import styles from "./Index.module.css";

const DON_ORIGIN = "https://sfgame.12hp.de";

export default function SFCollection() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const displayCounted = useRef(false);
  const [height, setHeight] = useState<number | null>(null);

  function requestHeight() {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "dons-sf-collection:request-height" },
      DON_ORIGIN,
    );
  }

  useLayoutEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    let width = iframe.getBoundingClientRect().width;
    let resizeTimer = 0;
    let measurementFrame = 0;
    let remeasuring = false;

    function receiveHeight(event: MessageEvent<unknown>) {
      if (event.origin !== DON_ORIGIN || event.source !== iframe?.contentWindow) return;
      if (!event.data || typeof event.data !== "object") return;
      const message = event.data as { type?: unknown; height?: unknown; url?: unknown; toolName?: unknown };
      if (message.type === "dons-sf-collection:tool-link-click") {
        trackCollectionToolClick(message.url, message.toolName);
        return;
      }
      if (remeasuring) return;
      const reportedHeight = message.height;
      if (message.type !== "dons-sf-collection:height" ||
        typeof reportedHeight !== "number" || !Number.isFinite(reportedHeight) || reportedHeight <= 0) return;
      setHeight(current => current === reportedHeight ? current : reportedHeight);
      if (!displayCounted.current) {
        displayCounted.current = true;
        trackCollectionDisplay();
      }
    }

    const observer = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width === width) return;
      width = entry.contentRect.width;
      remeasuring = true;
      window.clearTimeout(resizeTimer);
      window.cancelAnimationFrame(measurementFrame);
      // Don's viewport-dependent scrollHeight cannot shrink from a taller frame.
      // Reset once after the width settles, then request the new actual height.
      resizeTimer = window.setTimeout(() => {
        setHeight(null);
        measurementFrame = window.requestAnimationFrame(() => {
          remeasuring = false;
          requestHeight();
        });
      }, 100);
    });

    window.addEventListener("message", receiveHeight);
    observer.observe(iframe);
    return () => {
      window.removeEventListener("message", receiveHeight);
      observer.disconnect();
      window.clearTimeout(resizeTimer);
      window.cancelAnimationFrame(measurementFrame);
    };
  }, []);

  return (
    <iframe
      ref={iframeRef}
      className={styles.frame}
      src="https://sfgame.12hp.de/"
      title="DonMuErtes SF Collection"
      style={height === null ? undefined : { height }}
      onLoad={requestHeight}
    />
  );
}
