import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type TabKey = "json" | "csv";

type UploadCenterState = {
  isOpen: boolean;
  open: (opts?: { tab?: TabKey }) => void;
  close: () => void;
  activeTab: TabKey;
  setTab: (t: TabKey) => void;
  // Rollen-/Gatekeeping
  canUse: boolean;
};

const Ctx = createContext<UploadCenterState | null>(null);

type Props = {
  children: React.ReactNode;
  role?: string | null;
};

export function UploadCenterProvider({ children, role }: Props) {
  const [isOpen, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("json");

  const canUse = !!role && (role === "admin" || role === "uploader" || role === "dev");

  const open = useCallback((opts?: { tab?: TabKey }) => {
    if (!canUse) return;
    if (opts?.tab) setActiveTab(opts.tab);
    setOpen(true);
  }, [canUse]);

  const close = useCallback(() => setOpen(false), []);

  const value = useMemo<UploadCenterState>(() => ({
    isOpen,
    open,
    close,
    activeTab,
    setTab: setActiveTab,
    canUse,
  }), [isOpen, open, close, activeTab, canUse]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUploadCenter() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUploadCenter must be used within UploadCenterProvider");
  return ctx;
}
