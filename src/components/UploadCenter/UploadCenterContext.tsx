import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type UploadCenterState = {
  isOpen: boolean;
  open: (opts?: { tab?: "json" }) => void;
  close: () => void;
  activeTab: "json";
  // Optional: Rollen-/Gatekeeping
  canUse: boolean;
};

const Ctx = createContext<UploadCenterState | null>(null);

type Props = {
  children: React.ReactNode;
  // Rolle aus deinem User-System; z. B. "admin" oder "uploader"
  role?: string | null;
};

export function UploadCenterProvider({ children, role }: Props) {
  const [isOpen, setOpen] = useState(false);
  const [activeTab] = useState<"json">("json");

  const canUse = !!role && (role === "admin" || role === "uploader" || role === "dev");

  const open = useCallback((_opts?: { tab?: "json" }) => {
    if (!canUse) return; // falls kein Zugriff: einfach ignorieren
    setOpen(true);
  }, [canUse]);

  const close = useCallback(() => setOpen(false), []);

  const value = useMemo<UploadCenterState>(() => ({
    isOpen,
    open,
    close,
    activeTab,
    canUse,
  }), [isOpen, open, close, activeTab, canUse]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUploadCenter() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUploadCenter must be used within UploadCenterProvider");
  return ctx;
}
