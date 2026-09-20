import { Loader2, RotateCcw } from "lucide-react";
import styles from "./DataHubLoadingState.module.css";

export type DataHubLoadingStateVariant = "inline" | "page" | "overlay";

export type DataHubLoadingStateProps = {
  title?: string;
  message: string;
  current?: number;
  total?: number;
  variant?: DataHubLoadingStateVariant;
  error?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
};

const formatNumber = (value: number) => new Intl.NumberFormat().format(value);

export function DataHubLoadingState({
  title,
  message,
  current,
  total,
  variant = "inline",
  error = null,
  onRetry,
  retryLabel = "Retry",
  className,
}: DataHubLoadingStateProps) {
  const hasProgress = current != null && total != null;
  const classNames = [styles.state, styles[variant], error ? styles.error : null, className].filter(Boolean).join(" ");

  return (
    <div
      className={classNames}
      role={error ? "alert" : "status"}
      aria-live={error ? "assertive" : "polite"}
      aria-atomic="false"
      aria-busy={!error}
    >
      {!error ? <Loader2 className={styles.spinner} size={18} aria-hidden /> : null}
      <div className={styles.content}>
        {title ? <div className={styles.title}>{title}</div> : null}
        <div className={styles.message}>{message}</div>
        {error ? <div className={styles.errorMessage}>{error}</div> : null}
        {hasProgress ? (
          <div className={styles.progressCount} aria-label={`${formatNumber(current)} of ${formatNumber(total)}`}>
            {formatNumber(current)} / {formatNumber(total)}
          </div>
        ) : null}
        {error && onRetry ? (
          <button type="button" className={styles.retryButton} onClick={onRetry}>
            <RotateCcw size={15} aria-hidden />
            {retryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
