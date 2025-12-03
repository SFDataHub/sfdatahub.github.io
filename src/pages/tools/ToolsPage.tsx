import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { collection, doc, serverTimestamp, setDoc, type Timestamp } from "firebase/firestore";
import ContentShell from "../../components/ContentShell";
import { GemCalculator } from "../../components/calculators/Gem";
import DungeonPauseOpenXPCalculator from "../../components/calculators/DungeonPauseOpenXPCalculator";
import type { GemSimState } from "../../components/calculators/Gem";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../lib/firebase";
import ToolsSyncBar from "./ToolsSyncBar";

type ToolId = "gemSim" | "dungeonPauseOpenXP" | "xpDungeon";
type ToolSetId = string;

type GemSimToolState = GemSimState & { updatedAt?: Timestamp };

interface DungeonPauseRange {
  from: number;
  to: number;
}

interface DungeonPauseToolState {
  light: Record<string, DungeonPauseRange>;
  shadow: Record<string, DungeonPauseRange>;
  special: Record<string, DungeonPauseRange>;
  updatedAt?: Timestamp;
}

type ToolStateMap = {
  gemSim?: GemSimToolState;
  dungeonPauseOpenXP?: DungeonPauseToolState;
};

interface ToolSet {
  id: ToolSetId;
  name: string;
  classLabel: string;
  serverLabel: string;
  tools?: ToolStateMap;
}

type ToolDef = {
  id: ToolId;
  labelKey: string;
  defaultLabel: string;
  descriptionKey: string;
  defaultDescription: string;
};

const MAX_SETS = 3;
const LOCAL_STORAGE_KEY = "sfdatahub.tools.sets.v1";

interface PersistedToolsState {
  version: 1;
  type: "toolSet";
  sets: ToolSet[];
  activeSetId: ToolSetId | null;
  activeToolId: ToolId;
}

const INITIAL_SETS: ToolSet[] = [
  {
    id: "set-main-dh",
    name: "Main DH",
    classLabel: "Demon Hunter",
    serverLabel: "DE-55",
  },
  {
    id: "set-twink-mage",
    name: "Twink Mage",
    classLabel: "Mage",
    serverLabel: "US-12",
  },
];

const TOOL_DEFS: ToolDef[] = [
  {
    id: "gemSim",
    labelKey: "tools.labels.gemSim",
    defaultLabel: "Gem Simulator",
    descriptionKey: "tools.descriptions.gemSim",
    defaultDescription: "Placeholder fuer kuenftige Gem-Berechnungen.",
  },
  {
    id: "dungeonPauseOpenXP",
    labelKey: "tools.labels.dungeonPause",
    defaultLabel: "Dungeon Pause",
    descriptionKey: "tools.descriptions.dungeonPause",
    defaultDescription: "Dummy-Ansicht fuer Dungeon-Pausen-Tools.",
  },
  {
    id: "xpDungeon",
    labelKey: "tools.labels.xpDungeon",
    defaultLabel: "XP Dungeon",
    descriptionKey: "tools.descriptions.xpDungeon",
    defaultDescription: "Slide fuer XP-Lauf-Planung als Platzhalter.",
  },
];

const COOLDOWN_MS = 5 * 60 * 1000;

async function saveToolsStateForUser(
  userId: string,
  payload: {
    sets: ToolSet[];
    activeSetId: ToolSetId | null;
    activeToolId: ToolId;
  },
): Promise<void> {
  const docRef = doc(collection(db, "user_tools_state"), userId);
  console.log("[ToolsSync] userId param:", userId, "doc path:", docRef.path);
  const data = {
    version: 1,
    updatedAt: serverTimestamp(),
    sets: payload.sets,
    activeSetId: payload.activeSetId,
    activeToolId: payload.activeToolId,
  };
  await setDoc(docRef, data, { merge: false });
}

const readPersistedState = (): PersistedToolsState | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || parsed.type !== "toolSet") {
      return null;
    }
    if (!Array.isArray(parsed.sets)) return null;
    return parsed as PersistedToolsState;
  } catch (error) {
    console.warn("Failed to parse persisted tools state", error);
    return null;
  }
};

export default function ToolsPage() {
  const { t } = useTranslation();
  const { user, status, loginWithDiscord } = useAuth();
  const isLoggedIn = status === "authenticated" && !!user;

  const persistedState = useMemo(() => readPersistedState(), []);
  const initialSets = useMemo(() => {
    if (persistedState?.sets?.length) {
      return persistedState.sets.slice(0, MAX_SETS);
    }
    return INITIAL_SETS;
  }, [persistedState]);
  const initialActiveSetId = useMemo(() => {
    const storedId = persistedState?.activeSetId;
    if (storedId && initialSets.some((set) => set.id === storedId)) {
      return storedId;
    }
    return initialSets[0]?.id ?? INITIAL_SETS[0]?.id ?? "set-main-dh";
  }, [persistedState, initialSets]);
  const initialToolId = useMemo(() => {
    const storedToolId = persistedState?.activeToolId;
    if (storedToolId && TOOL_DEFS.some((def) => def.id === storedToolId)) {
      return storedToolId;
    }
    return TOOL_DEFS[0]?.id ?? "gemSim";
  }, [persistedState]);

  const [sets, setSets] = useState<ToolSet[]>(initialSets);
  const [activeSetId, setActiveSetId] = useState<ToolSetId>(initialActiveSetId);
  const [activeToolId, setActiveToolId] = useState<ToolId>(initialToolId);
  const [renameTargetId, setRenameTargetId] = useState<ToolSetId | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState("");
  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const syncInitialRenderRef = useRef(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const payload: PersistedToolsState = {
        version: 1,
        type: "toolSet",
        sets,
        activeSetId: activeSetId ?? null,
        activeToolId,
      };
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn("Failed to persist tools state", error);
    }
  }, [sets, activeSetId, activeToolId]);

  useEffect(() => {
    if (!isLoggedIn) {
      setHasUnsyncedChanges(false);
      syncInitialRenderRef.current = true;
      return;
    }

    if (syncInitialRenderRef.current) {
      syncInitialRenderRef.current = false;
      return;
    }

    setHasUnsyncedChanges(true);
  }, [isLoggedIn, sets, activeSetId, activeToolId]);

  const activeSet = useMemo(() => sets.find((s) => s.id === activeSetId) ?? sets[0], [activeSetId, sets]);
  const activeToolDef = useMemo(() => TOOL_DEFS.find((t) => t.id === activeToolId) ?? TOOL_DEFS[0], [activeToolId]);
  const activeGemSimState = activeSet?.tools?.gemSim;
  const activeDungeonPauseState = activeSet?.tools?.dungeonPauseOpenXP;

  const currentCount = sets.length;
  const isAddDisabled = currentCount >= MAX_SETS;

  const handleAddSet = () => {
    if (isAddDisabled) return;
    const nextIndex = currentCount + 1;
    const defaultSetName = t("tools.sets.defaultName", "New Set");
    const newSet: ToolSet = {
      id: `set-${Date.now()}`,
      name: `${defaultSetName} ${nextIndex}`,
      classLabel: "Class TBD",
      serverLabel: "Server TBD",
    };
    setSets((prev) => [...prev, newSet]);
    setActiveSetId(newSet.id);
  };

  const handleLoginClick = () => {
    loginWithDiscord();
  };

  const handleExportActiveSet = () => {
    if (!activeSet) {
      console.warn("No active set to export.");
      return;
    }
    const payload = {
      version: 1,
      type: "toolSet",
      set: activeSet,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const fileNameSafe = activeSet.name.toLowerCase().replace(/\s+/g, "-");
    anchor.href = url;
    anchor.download = `sfdatahub-set-${fileNameSafe}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleDeleteSet = (setId: ToolSetId) => {
    if (sets.length <= 1) {
      alert(t("tools.sets.deleteLastForbidden"));
      return;
    }
    const confirmTitle = t("tools.sets.deleteConfirmTitle");
    const confirmText = t("tools.sets.deleteConfirmText");
    if (!window.confirm(`${confirmTitle}\n\n${confirmText}`)) {
      return;
    }
    const remaining = sets.filter((set) => set.id !== setId);
    const nextActiveId =
      setId === activeSetId ? remaining[0]?.id ?? null : activeSetId;
    setSets(remaining);
    if (nextActiveId) {
      setActiveSetId(nextActiveId);
    }
  };

  const handleStartRename = (setId: ToolSetId) => {
    const target = sets.find((set) => set.id === setId);
    if (!target) return;
    setRenameTargetId(setId);
    setRenameValue(target.name);
    setRenameError("");
  };

  const handleCancelRename = () => {
    setRenameTargetId(null);
    setRenameValue("");
    setRenameError("");
  };

  const handleConfirmRename = () => {
    if (!renameTargetId) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenameError(t("tools.sets.renameErrorEmpty"));
      return;
    }
    setSets((prev) =>
      prev.map((set) =>
        set.id === renameTargetId ? { ...set, name: trimmed } : set
      )
    );
    setRenameTargetId(null);
    setRenameValue("");
    setRenameError("");
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    try {
      if (sets.length >= MAX_SETS) {
        alert(t("tools.sets.importErrorMaxReached"));
        return;
      }
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (
        parsed?.version !== 1 ||
        parsed?.type !== "toolSet" ||
        typeof parsed?.set !== "object"
      ) {
        throw new Error("invalid payload");
      }
      const { set: imported } = parsed as {
        version: number;
        type: "toolSet";
        set: Partial<ToolSet>;
      };
      if (
        typeof imported?.name !== "string" ||
        typeof imported?.classLabel !== "string" ||
        typeof imported?.serverLabel !== "string"
      ) {
        throw new Error("invalid set");
      }
      const newSet: ToolSet = {
        ...imported,
        id: `imported-${Date.now()}`,
        name: imported.name,
        classLabel: imported.classLabel,
        serverLabel: imported.serverLabel,
      };
      setSets((prev) => [...prev, newSet]);
      setActiveSetId(newSet.id);
    } catch (error) {
      console.error("Failed to import set", error);
      alert(t("tools.sets.importErrorInvalid"));
    } finally {
      event.target.value = "";
    }
  };

  const handleGemSimStateChange = (nextState: GemSimState) => {
    if (!activeSetId) return;
    setSets((prev) =>
      prev.map((set) => {
        if (set.id !== activeSetId) return set;
        const nextTools: ToolStateMap = {
          ...(set.tools ?? {}),
          gemSim: nextState,
        };
        return { ...set, tools: nextTools };
      })
    );
    setHasUnsyncedChanges(true);
  };

  const handleDungeonPauseStateChange = (nextState: DungeonPauseToolState) => {
    if (!activeSetId) return;
    setSets((prev) =>
      prev.map((set) => {
        if (set.id !== activeSetId) return set;
        const nextTools: ToolStateMap = {
          ...(set.tools ?? {}),
          dungeonPauseOpenXP: nextState,
        };
        return { ...set, tools: nextTools };
      })
    );
    setHasUnsyncedChanges(true);
  };

  const setCounterLabel = `${currentCount}/${MAX_SETS}`;
  const activeToolLabel = t(activeToolDef.labelKey, activeToolDef.defaultLabel);
  const activeToolDescription = t(activeToolDef.descriptionKey, activeToolDef.defaultDescription);

  const handleSyncToAccount = async () => {
    if (!isLoggedIn) return;
    const userId = user?.id;
    if (!userId) return;
    if (isSyncing) return;
    const cooldownActive = cooldownUntil !== null && cooldownUntil > Date.now();
    if (cooldownActive) return;
    if (!hasUnsyncedChanges) return;

    setIsSyncing(true);
    setSyncError(null);

    try {
      await saveToolsStateForUser(userId, {
        sets,
        activeSetId,
        activeToolId,
      });

      const syncNow = Date.now();
      const until = syncNow + COOLDOWN_MS;
      setHasUnsyncedChanges(false);
      setLastSyncedAt(new Date(syncNow));
      setCooldownUntil(until);
    } catch (error) {
      console.error("Failed to sync tools state", error);
      setSyncError(t("tools.sync.error"));
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <ContentShell title="Tools" subtitle="Sets & Dummy-Tools" centerFramed={false}>
      <div className="flex flex-col gap-4 md:gap-6">
        {/* Sets-Leiste */}
        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-50">Sets</h2>
              <p className="text-sm text-slate-400">Waehle dein aktives Char-Set (max. 3 Slots)</p>
            </div>
            <span className="text-xs text-slate-400">{setCounterLabel}</span>
          </div>

          <div className="flex items-stretch gap-3 overflow-x-auto pb-1">
            {sets.map((set) => {
              const isActive = set.id === activeSetId;
              return (
                <div key={set.id} className="relative">
                  <button
                    type="button"
                    onClick={() => setActiveSetId(set.id)}
                    className={[
                      "flex min-w-[180px] flex-col gap-1 rounded-2xl border px-4 py-3 text-left transition duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-emerald-400/70",
                      isActive
                        ? "border-emerald-400/80 bg-emerald-500/10 shadow-[0_10px_40px_-20px_rgba(16,185,129,0.6)]"
                        : "border-slate-700/70 bg-slate-800/60 hover:border-emerald-400/60 hover:bg-slate-800/80",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-50">{set.name}</span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleStartRename(set.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            handleStartRename(set.id);
                          }
                        }}
                        aria-label={t("tools.sets.rename")}
                        className="rounded-full border border-transparent p-1 text-slate-300 transition hover:border-slate-500 hover:text-white"
                      >
                        <Pencil className="h-4 w-4" />
                      </span>
                    </div>
                    <div className="text-xs text-emerald-200/90">{set.classLabel}</div>
                    <div className="text-xs text-slate-400">{set.serverLabel}</div>
                    {isActive && <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">Aktiv</div>}
                  </button>
                  {sets.length > 1 && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteSet(set.id);
                      }}
                      className="absolute bottom-2 right-2 rounded-full border border-slate-600/60 bg-slate-900/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-slate-200 transition hover:border-slate-400 hover:text-white"
                    >
                      {t("tools.sets.delete")}
                    </button>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              onClick={handleAddSet}
              disabled={isAddDisabled}
              className={[
                "flex h-full min-w-[140px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-3 text-sm font-semibold transition",
                isAddDisabled
                  ? "cursor-not-allowed border-slate-700/70 bg-slate-800/40 text-slate-500"
                  : "border-emerald-400/60 bg-emerald-500/5 text-emerald-200 hover:border-emerald-400 hover:bg-emerald-500/10",
              ].join(" ")}
            >
              <span className="text-lg">+</span>
              <span>{sets.length >= 3 ? "Max erreicht" : "Neues Set"}</span>
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleExportActiveSet}
              className="rounded-xl border border-slate-600/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-slate-400/80 hover:bg-slate-800/60"
            >
              {t("tools.sets.exportActive")}
            </button>
            <button
              type="button"
              onClick={handleImportClick}
              className="rounded-xl border border-emerald-400/50 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:border-emerald-300 hover:bg-emerald-500/20"
            >
              {t("tools.sets.import")}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleFileChange}
          />
        </section>

        {/* Tool-Leiste */}
        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-50">Tools</h2>
              <p className="text-sm text-slate-400">Dummy-Tools, die das aktive Set verwenden</p>
            </div>
          </div>

          <div className="flex items-center gap-3 overflow-x-auto pb-1">
            {TOOL_DEFS.map((tool) => {
              const isActive = tool.id === activeToolId;
              const toolLabel = t(tool.labelKey, tool.defaultLabel);
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => setActiveToolId(tool.id)}
                  className={[
                    "flex flex-shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-400/70",
                    isActive
                      ? "border-emerald-400/80 bg-emerald-500/10 text-emerald-100 shadow-[0_10px_40px_-20px_rgba(16,185,129,0.7)]"
                      : "border-slate-700/70 bg-slate-800/70 text-slate-200 hover:border-emerald-400/60 hover:text-emerald-100",
                  ].join(" ")}
                >
                  <span className="text-base" aria-hidden>*</span>
                  <span>{toolLabel}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Gast vs Account Info-Bereich */}
        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4 md:p-5">
          {isLoggedIn ? (
            <>
              <div className="grid gap-4 md:grid-cols-[1.2fr_1fr] md:items-center">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-200/80">
                    {t("tools.banner.accountComingSoon")}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-50">
                    {t("tools.banner.accountTitle")}
                  </h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[t("tools.banner.featureSetComparison"), t("tools.banner.featureIntegration"), t("tools.banner.featureCloudSync")].map((copy) => (
                    <div
                      key={copy}
                      className="rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-3 text-sm text-emerald-50 shadow-[0_12px_45px_-30px_rgba(16,185,129,0.8)]"
                    >
                      <div className="text-xs uppercase tracking-wide text-emerald-200/90">
                        {t("tools.banner.accountComingSoon")}
                      </div>
                      <div className="mt-1 leading-snug text-emerald-50/90">{copy}</div>
                    </div>
                  ))}
                </div>
              </div>
              <ToolsSyncBar
                isLoggedIn={isLoggedIn}
                hasUnsyncedChanges={hasUnsyncedChanges}
                lastSyncedAt={lastSyncedAt}
                cooldownUntil={cooldownUntil}
                onSyncClick={handleSyncToAccount}
                isSaving={isSyncing}
                syncError={syncError}
              />
            </>
          ) : (
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-slate-50">
                  {t("tools.banner.guestTitle")}
                </h3>
                <p className="text-sm text-slate-400">
                  {t("tools.banner.guestDescription")}
                </p>
                <ul className="text-sm text-slate-300">
                  {[t("tools.banner.featureSetComparison"), t("tools.banner.featureIntegration"), t("tools.banner.featureCloudSync")].map((copy) => (
                    <li key={copy} className="flex items-start gap-2">
                      <span className="mt-[3px] h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
                      <span>{copy}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex gap-3 md:flex-col md:items-end">
                <button
                  type="button"
                  onClick={handleLoginClick}
                  className="rounded-xl border border-emerald-400/60 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-50 transition hover:border-emerald-300 hover:bg-emerald-500/20 focus:outline-none focus:ring-2 focus:ring-emerald-400/70"
                >
                  {t("tools.banner.guestLoginCta")}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Slider-/Diashow-Container */}
        <section className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Aktives Tool</p>
              <h3 className="text-xl font-semibold text-slate-50">{activeToolLabel}</h3>
              <p className="text-sm text-slate-400">Aktives Set: {activeSet?.name || "kein Set"}</p>
            </div>
            <div className="flex gap-2">
              {TOOL_DEFS.map((tool) => (
                <div
                  key={tool.id}
                  className={[
                    "h-2 w-8 rounded-full transition",
                    activeToolId === tool.id ? "bg-emerald-400" : "bg-slate-700",
                  ].join(" ")}
                  aria-hidden
                />
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
            <div className="rounded-2xl border border-slate-700/70 bg-slate-800/60 p-4">
              <div className="text-sm text-slate-300">{activeToolDescription}</div>
              <div className="mt-4">
                {activeToolId === "gemSim" ? (
                  <GemCalculator
                    initialState={activeGemSimState}
                    onStateChange={handleGemSimStateChange}
                  />
                ) : activeToolId === "dungeonPauseOpenXP" ? (
                  <DungeonPauseOpenXPCalculator
                    key={activeSetId}
                    initialState={activeDungeonPauseState}
                    onStateChange={handleDungeonPauseStateChange}
                  />
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-700/70 bg-slate-900/60 p-4 text-center text-sm text-slate-400">
                    Placeholder fuer kuenftige Tool-Komponente<br />
                    (z. B. {activeToolLabel})
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-700/70 bg-slate-800/60 p-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Set-Details</div>
                <div className="mt-1 text-sm font-semibold text-slate-100">{activeSet?.name}</div>
                <div className="text-sm text-emerald-200/90">{activeSet?.classLabel}</div>
                <div className="text-xs text-slate-400">{activeSet?.serverLabel}</div>
              </div>
              <div className="rounded-2xl border border-dashed border-emerald-400/40 bg-emerald-500/5 p-3 text-xs text-emerald-100">
                Lokaler State only - keine Firestore-Anbindung.<br />
                Slides wechseln, wenn du oben ein Tool auswaehlst.
              </div>
            </div>
          </div>
        </section>
        {renameTargetId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={handleCancelRename} />
            <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-900/95 p-6 shadow-2xl">
              <h3 className="text-lg font-semibold text-slate-50">{t("tools.sets.renameTitle")}</h3>
              <label className="mt-4 block text-xs uppercase tracking-[0.3em] text-slate-400">
                {t("tools.sets.renameLabel")}
              </label>
              <input
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                autoFocus
                className="mt-2 w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-4 py-2 text-sm text-slate-50 outline-none transition focus:border-emerald-400"
                placeholder={t("tools.sets.renamePlaceholder")}
              />
              {renameError && (
                <p className="mt-2 text-xs text-rose-400">{renameError}</p>
              )}
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCancelRename}
                  className="rounded-xl border border-slate-600/80 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-slate-400 hover:bg-slate-800/60"
                >
                  {t("tools.sets.renameCancel")}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRename}
                  className="rounded-xl border border-emerald-400/60 bg-emerald-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-50 transition hover:border-emerald-300 hover:bg-emerald-500/80"
                >
                  {t("tools.sets.renameSave")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ContentShell>
  );
}
