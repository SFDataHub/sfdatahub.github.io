import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useFeatureAccess } from "../../lib/featureAccessConfig";

type TabKey = "json" | "csv";

type UploadCenterState = {
  isOpen: boolean;
  open: (opts?: { tab?: TabKey }) => void;
  close: () => void;
  activeTab: TabKey;
  setTab: (t: TabKey) => void;
  canUse: boolean;
};

const Ctx = createContext<UploadCenterState | null>(null);

type Props = {
  children: React.ReactNode;
};

export function UploadCenterProvider({ children }: Props) {
  const { canAccessFeature } = useFeatureAccess();
  const [isOpen, setOpen] = useState(false);
  // CSV ist jetzt Standard
  const [activeTab, setActiveTab] = useState<TabKey>("csv");

  const canUse = canAccessFeature("main.uploadCenter");

  const open = useCallback((opts?: { tab?: TabKey }) => {
    if (!canUse) return;
    if (opts?.tab) {
      setActiveTab(opts.tab);
    } else {
      // Fallback weiterhin CSV
      setActiveTab("csv");
    }
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
