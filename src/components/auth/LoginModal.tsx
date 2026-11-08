import React from "react";
import { createPortal } from "react-dom";
import { lockBodyScroll } from "../../lib/bodyScrollLock";
import { useTranslation } from "react-i18next";

import LoginCard from "./LoginCard";
import styles from "./LoginModal.module.css";

type LoginModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  React.useLayoutEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const unlockScroll = lockBodyScroll();
    dialog?.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled)')?.focus({ preventScroll: true });
    return () => {
      unlockScroll();
      if (dialog?.contains(document.activeElement) || document.activeElement === document.body) {
        const target = previousFocus?.isConnected && previousFocus !== document.body && previousFocus.getClientRects().length > 0 && !previousFocus.closest("[inert]")
          ? previousFocus : document.querySelector<HTMLElement>('button[aria-controls="sidebar-root"]');
        target?.focus({ preventScroll: true });
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={dialogRef}
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label={t("account.loginOverlay.modalAriaLabel")}
      onClick={(event) => {
        if (!cardRef.current?.contains(event.target as Node)) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className={styles.inner}>
        <LoginCard cardRef={cardRef} />
      </div>
    </div>,
    document.body
  );
};

export default LoginModal;

