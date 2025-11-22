import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { DocumentData, QueryDocumentSnapshot, Timestamp } from "firebase/firestore";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Loader2,
  RefreshCcw,
  ScrollText,
  Search,
  Shield,
  ShieldOff,
  StickyNote,
  UserCircle2,
  Users,
} from "lucide-react";
import ContentShell from "../../components/ContentShell";
import { useAuth } from "../../context/AuthContext";
import type { AdminAuditAction, AdminAuditEvent } from "../../types/adminAudit";
import type { AdminUser, AdminUserRole, AdminUserStatus } from "../../types/adminUser";
import {
  listAdminUsers,
  getAdminUserById,
  updateAdminUser,
  type ListAdminUsersResult,
  type ListAdminUsersOptions,
  type UpdateAdminUserInput,
} from "../../services/adminUsers";
import {
  listAdminAuditEvents,
  listAdminAuditEventsForUser,
} from "../../services/adminAuditLog";

type TabKey = "users" | "audit";
type RoleFilterValue = "all" | AdminUserRole;
type StatusFilterValue = "all" | AdminUserStatus;
type ProviderFilterValue = "all" | "discord" | "google";
type AuditActionFilter = "all" | AdminAuditAction;

const USERS_PAGE_SIZE = 20;
const AUDIT_PAGE_SIZE = 50;

const cardStyle: React.CSSProperties = {
  borderColor: "#2B4C73",
  background: "#152A42",
};

const tableHeaderStyle: React.CSSProperties = {
  background: "#1A2F4A",
};

export default function UsersAdminPage() {
  const { status, user } = useAuth();
  const roles = user?.roles ?? [];
  const isAdmin = roles.includes("admin");
  const isModerator = isAdmin || roles.includes("mod");

  const [activeTab, setActiveTab] = useState<TabKey>("users");

  if (status === "loading" || status === "idle") {
    return (
      <ContentShell title="Admin Users" subtitle="Checking permissions" centerFramed mode="page">
        <div className="flex h-full items-center justify-center text-[#B0C4D9]">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Validating session...
        </div>
      </ContentShell>
    );
  }

  if (!isModerator) {
    return (
      <ContentShell title="Admin Users" subtitle="Control panel access" centerFramed mode="page">
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-[#B0C4D9]">
          <ShieldOff className="h-10 w-10 text-[#FF6B6B]" aria-hidden="true" />
          <p className="text-base font-semibold text-white">Access restricted</p>
          <p>
            You need at least the <strong>mod</strong> role to view this section.
          </p>
        </div>
      </ContentShell>
    );
  }

  return (
    <ContentShell
      title="Admin user management"
      subtitle="Moderate accounts, roles, and audit events"
      centerFramed
      mode="page"
      actions={
        <div
          className="flex items-center rounded-full border px-3 py-1 text-xs"
          style={{ borderColor: "#2B4C73", color: "#B0C4D9" }}
        >
          <Shield className="mr-2 h-3.5 w-3.5 text-[#5C8BC6]" />
          {isAdmin ? "Admin" : "Moderator"} access
        </div>
      }
      stickyTopbar
      subheader={<TabSwitcher activeTab={activeTab} onChange={setActiveTab} />}
    >
      {activeTab === "users" ? (
        <UsersTab
          isAdmin={isAdmin}
          currentUserId={user?.id ?? ""}
          currentUserName={user?.displayName}
        />
      ) : (
        <AuditTab
          isAdmin={isAdmin}
          onSelectUser={(id) => {
            setActiveTab("users");
            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("sf-admin-open-user", { detail: { userId: id } }),
              );
            }
          }}
        />
      )}
    </ContentShell>
  );
}

function TabSwitcher({
  activeTab,
  onChange,
}: {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
}) {
  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "users", label: "Users", icon: <Users className="h-4 w-4" /> },
    { key: "audit", label: "Audit Log", icon: <ScrollText className="h-4 w-4" /> },
  ];

  return (
    <div className="flex gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`flex items-center gap-2 rounded-2xl border px-3 py-1.5 text-xs transition ${
            activeTab === tab.key ? "bg-[#1F3A59] text-white" : "text-[#B0C4D9]"
          }`}
          style={{ borderColor: "#2B4C73" }}
          aria-pressed={activeTab === tab.key}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function UsersTab({
  isAdmin,
  currentUserId,
  currentUserName,
}: {
  isAdmin: boolean;
  currentUserId: string;
  currentUserName?: string;
}) {
  const [filters, setFilters] = useState<{
    role: RoleFilterValue;
    status: StatusFilterValue;
    provider: ProviderFilterValue;
    search: string;
  }>({
    role: "all",
    status: "all",
    provider: "all",
    search: "",
  });
  const [searchDraft, setSearchDraft] = useState("");
  const debouncedSearch = useDebounce(searchDraft, 350);
  useEffect(() => {
    setFilters((prev) =>
      prev.search === debouncedSearch ? prev : { ...prev, search: debouncedSearch },
    );
  }, [debouncedSearch]);

  const [listState, setListState] = useState<{
    items: AdminUser[];
    cursor: QueryDocumentSnapshot<DocumentData> | null;
    loading: boolean;
    loadingMore: boolean;
    error: string | null;
  }>({
    items: [],
    cursor: null,
    loading: true,
    loadingMore: false,
    error: null,
  });

  const [reloadToken, setReloadToken] = useState(0);

  const listOptions: ListAdminUsersOptions = useMemo(
    () => ({
      pageSize: USERS_PAGE_SIZE,
      role: filters.role === "all" ? undefined : filters.role,
      status: filters.status === "all" ? undefined : filters.status,
      provider: filters.provider === "all" ? undefined : filters.provider,
      search: filters.search,
    }),
    [filters],
  );

  useEffect(() => {
    let cancelled = false;
    setListState((prev) => ({ ...prev, loading: true, error: null }));
    listAdminUsers(listOptions)
      .then((result) => {
        if (cancelled) return;
        setListState({
          items: result.users,
          cursor: result.nextPageCursor,
          loading: false,
          loadingMore: false,
          error: null,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setListState((prev) => ({
          ...prev,
          loading: false,
          loadingMore: false,
          error: error instanceof Error ? error.message : "Failed to load users",
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [listOptions, reloadToken]);

  const handleRefresh = () => setReloadToken((token) => token + 1);

  const handleLoadMore = async () => {
    if (!listState.cursor) return;
    setListState((prev) => ({ ...prev, loadingMore: true, error: null }));
    try {
      const result: ListAdminUsersResult = await listAdminUsers({
        ...listOptions,
        cursor: listState.cursor,
      });
      setListState((prev) => ({
        items: [...prev.items, ...result.users],
        cursor: result.nextPageCursor,
        loading: false,
        loadingMore: false,
        error: null,
      }));
    } catch (error: any) {
      setListState((prev) => ({
        ...prev,
        loadingMore: false,
        error: error?.message ?? "Failed to load additional users",
      }));
    }
  };

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [auditEntries, setAuditEntries] = useState<AdminAuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const selectedUserRef = useRef<string | null>(null);
  useEffect(() => {
    selectedUserRef.current = selectedUserId;
  }, [selectedUserId]);

  const notesDirtyRef = useRef(false);
  useEffect(() => {
    notesDirtyRef.current = notesDirty;
  }, [notesDirty]);

  const refreshAudit = useCallback(async (userId: string) => {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const result = await listAdminAuditEventsForUser(userId, 12);
      if (selectedUserRef.current === userId) {
        setAuditEntries(result.events);
      }
    } catch (error: any) {
      if (selectedUserRef.current === userId) {
        setAuditError(error?.message ?? "Failed to load audit history");
      }
    } finally {
      if (selectedUserRef.current === userId) {
        setAuditLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!selectedUserId) {
      setSelectedUser(null);
      setNotesDraft("");
      setNotesDirty(false);
      setAuditEntries([]);
      setAuditError(null);
      setShowRawJson(false);
      return;
    }

    const currentSelection = selectedUserId;
    const listMatch = listState.items.find((entry) => entry.id === currentSelection);
    if (listMatch) {
      setSelectedUser(listMatch);
      setNotesDraft(listMatch.notes ?? "");
    } else {
      setSelectedUser(null);
      setNotesDraft("");
    }
    setNotesDirty(false);
    setDetailLoading(true);
    setDetailError(null);

    let cancelled = false;
    getAdminUserById(currentSelection)
      .then((result) => {
        if (cancelled || selectedUserRef.current !== currentSelection) return;
        setSelectedUser(result);
        setNotesDraft(result.notes ?? "");
        setNotesDirty(false);
        setDetailLoading(false);
      })
      .catch((error: any) => {
        if (cancelled || selectedUserRef.current !== currentSelection) return;
        setDetailLoading(false);
        setDetailError(error?.message ?? "Failed to load user");
      });

    refreshAudit(currentSelection);

    return () => {
      cancelled = true;
    };
  }, [selectedUserId, listState.items, refreshAudit]);

  useEffect(() => {
    if (!selectedUserId) return;
    const updated = listState.items.find((entry) => entry.id === selectedUserId);
    if (!updated) return;
    setSelectedUser((prev) => {
      if (prev && prev.id === updated.id) {
        return { ...prev, ...updated };
      }
      return updated;
    });
    if (!notesDirtyRef.current) {
      setNotesDraft(updated.notes ?? "");
    }
  }, [listState.items, selectedUserId]);

  const updateListEntry = useCallback((updated: AdminUser) => {
    setListState((prev) => ({
      ...prev,
      items: prev.items.map((entry) => (entry.id === updated.id ? updated : entry)),
    }));
  }, []);

  const applyUpdate = useCallback(
    async (patch: UpdateAdminUserInput) => {
      if (!selectedUser) return;
      setActionPending(true);
      setActionError(null);
      try {
        const updated = await updateAdminUser(selectedUser.id, patch, {
          actorUserId: currentUserId,
          actorDisplayName: currentUserName,
        });
        setSelectedUser(updated);
        updateListEntry(updated);
        if ("notes" in patch) {
          setNotesDirty(false);
          setNotesDraft(updated.notes ?? "");
        }
        await refreshAudit(updated.id);
      } catch (error: any) {
        setActionError(error?.message ?? "Failed to update user");
      } finally {
        setActionPending(false);
      }
    },
    [selectedUser, currentUserId, currentUserName, refreshAudit, updateListEntry],
  );

  const handleRoleToggle = (role: AdminUserRole) => {
    if (!selectedUser || !isAdmin || role === "user") return;
    const currentRoles = new Set(selectedUser.roles);
    if (currentRoles.has(role)) {
      currentRoles.delete(role);
    } else {
      currentRoles.add(role);
    }
    currentRoles.add("user");
    applyUpdate({ roles: Array.from(currentRoles) });
  };

  const handleStatusChange = (status: AdminUserStatus) => {
    if (!selectedUser || !isAdmin) return;
    const current = normalizeStatusLabel(selectedUser.status);
    if (current === status) return;
    if (status === "banned") {
      const confirmed = window.confirm(
        `Ban ${getDisplayName(selectedUser)}? They will lose access to the control panel.`,
      );
      if (!confirmed) return;
    }
    applyUpdate({ status });
  };

  const handleNotesChange = (value: string) => {
    setNotesDraft(value);
    setNotesDirty(true);
  };

  const handleNotesSave = () => {
    if (!selectedUser || !isAdmin || !notesDirty) return;
    applyUpdate({ notes: notesDraft.trim().length ? notesDraft : null });
  };

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId) {
        setSelectedUserId(detail.userId);
      }
    };
    window.addEventListener("sf-admin-open-user", handler as EventListener);
    return () => {
      window.removeEventListener("sf-admin-open-user", handler as EventListener);
    };
  }, []);

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border p-3 text-xs" style={cardStyle}>
        <div className="flex items-center gap-2 rounded-xl border px-3 py-1" style={{ borderColor: "#2B4C73" }}>
          <Search className="h-4 w-4 text-[#5C8BC6]" />
          <input
            type="text"
            placeholder="Search user id or name"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            className="w-48 bg-transparent text-sm text-white placeholder:text-[#6E86A6] focus:outline-none"
          />
        </div>
        <Select
          label="Role"
          value={filters.role}
          onChange={(value) => setFilters((prev) => ({ ...prev, role: value as RoleFilterValue }))}
          options={[
            { value: "all", label: "All" },
            { value: "admin", label: "Admin" },
            { value: "mod", label: "Mod" },
            { value: "creator", label: "Creator" },
            { value: "user", label: "User" },
          ]}
        />
        <Select
          label="Status"
          value={filters.status}
          onChange={(value) => setFilters((prev) => ({ ...prev, status: value as StatusFilterValue }))}
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "suspended", label: "Suspended" },
            { value: "banned", label: "Banned" },
          ]}
        />
        <Select
          label="Provider"
          value={filters.provider}
          onChange={(value) =>
            setFilters((prev) => ({ ...prev, provider: value as ProviderFilterValue }))
          }
          options={[
            { value: "all", label: "All" },
            { value: "discord", label: "Discord" },
            { value: "google", label: "Google" },
          ]}
        />
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            className="flex items-center gap-1 rounded-full border px-3 py-1 text-xs text-[#B0C4D9]"
            style={{ borderColor: "#2B4C73" }}
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-2xl border" style={cardStyle}>
          <header
            className="flex items-center justify-between border-b px-4 py-3 text-xs"
            style={{ borderColor: "#203650" }}
          >
            <span className="text-[#B0C4D9]">
              {listState.items.length} users {filters.search ? "filtered" : ""}
            </span>
            {listState.loading && (
              <span className="flex items-center gap-2 text-[#B0C4D9]">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading
              </span>
            )}
          </header>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm text-white">
              <thead style={tableHeaderStyle}>
                <tr className="text-xs uppercase tracking-wide text-[#8AA5C4]">
                  <th className="px-4 py-2">User ID</th>
                  <th className="px-4 py-2">Display name</th>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Providers</th>
                  <th className="px-4 py-2">Created</th>
                  <th className="px-4 py-2">Last login</th>
                </tr>
              </thead>
              <tbody>
                {listState.items.map((entry) => {
                  const isSelected = entry.id === selectedUserId;
                  return (
                    <tr
                      key={entry.id}
                      onClick={() => setSelectedUserId(entry.id)}
                      className={`cursor-pointer border-t text-xs transition hover:bg-[#1F3652] ${
                        isSelected ? "bg-[#1F3652]" : ""
                      }`}
                      style={{ borderColor: "#203650" }}
                    >
                      <td className="px-4 py-2 font-mono text-[#8AA5C4]">{entry.userId}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <Avatar url={getAvatar(entry)} name={getDisplayName(entry)} />
                          <div>
                            <div className="text-sm">{getDisplayName(entry)}</div>
                            {entry.profile?.displayName && entry.profile.displayName !== entry.displayName ? (
                              <div className="text-[11px] text-[#8AA5C4]">
                                {entry.profile.displayName}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <RoleBadge role={getPrimaryRole(entry.roles)} />
                      </td>
                      <td className="px-4 py-2">
                        <StatusBadge status={normalizeStatusLabel(entry.status)} />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1">
                          <ProviderBadge provider="discord" active={Boolean(entry.providers?.discord)} />
                          <ProviderBadge provider="google" active={Boolean(entry.providers?.google)} />
                        </div>
                      </td>
                      <td className="px-4 py-2 text-[#8AA5C4]">{formatTimestamp(entry.createdAt)}</td>
                      <td className="px-4 py-2 text-[#8AA5C4]">
                        {formatTimestamp(entry.lastLoginAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!listState.loading && !listState.items.length && (
              <div className="px-4 py-6 text-center text-sm text-[#8AA5C4]">
                No users match these filters.
              </div>
            )}
          </div>
          {listState.error && (
            <div
              className="flex items-center gap-2 border-t px-4 py-3 text-xs text-[#FFB347]"
              style={{ borderColor: "#203650" }}
            >
              <AlertCircle className="h-3.5 w-3.5" />
              {listState.error}
            </div>
          )}
          <footer
            className="flex items-center justify-between border-t px-4 py-3 text-xs"
            style={{ borderColor: "#203650" }}
          >
            <span className="text-[#8AA5C4]">
              {listState.cursor ? "More users available" : "End of list"}
            </span>
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={!listState.cursor || listState.loadingMore}
              className="rounded-full border px-3 py-1 text-[#B0C4D9] disabled:opacity-40"
              style={{ borderColor: "#2B4C73" }}
            >
              {listState.loadingMore ? "Loading..." : "Load more"}
            </button>
          </footer>
        </div>

        <aside className="rounded-2xl border p-3" style={cardStyle}>
          {selectedUser ? (
            <UserDetailPanel
              user={selectedUser}
              isAdmin={isAdmin}
              detailLoading={detailLoading}
              detailError={detailError}
              notesValue={notesDraft}
              notesDirty={notesDirty}
              onNotesChange={handleNotesChange}
              onNotesSave={handleNotesSave}
              onRoleToggle={handleRoleToggle}
              onStatusChange={handleStatusChange}
              actionError={actionError}
              actionPending={actionPending}
              auditEntries={auditEntries}
              auditLoading={auditLoading}
              auditError={auditError}
              onRefreshAudit={() => selectedUser && refreshAudit(selectedUser.id)}
              showRawJson={showRawJson}
              toggleRawJson={() => setShowRawJson((value) => !value)}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-[#8AA5C4]">
              <UserCircle2 className="h-10 w-10 text-[#5C8BC6]" />
              Select a user to see details.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function AuditTab({
  isAdmin,
  onSelectUser,
}: {
  isAdmin: boolean;
  onSelectUser: (userId: string) => void;
}) {
  const [filters, setFilters] = useState<{
    actor: string;
    target: string;
    action: AuditActionFilter;
  }>({
    actor: "",
    target: "",
    action: "all",
  });
  const [actorDraft, setActorDraft] = useState("");
  const [targetDraft, setTargetDraft] = useState("");
  const debouncedActor = useDebounce(actorDraft, 350);
  const debouncedTarget = useDebounce(targetDraft, 350);
  useEffect(() => {
    setFilters((prev) =>
      prev.actor === debouncedActor && prev.target === debouncedTarget
        ? prev
        : { ...prev, actor: debouncedActor, target: debouncedTarget },
    );
  }, [debouncedActor, debouncedTarget]);

  const [state, setState] = useState<{
    items: AdminAuditEvent[];
    cursor: QueryDocumentSnapshot<DocumentData> | null;
    loading: boolean;
    loadingMore: boolean;
    error: string | null;
  }>({
    items: [],
    cursor: null,
    loading: true,
    loadingMore: false,
    error: null,
  });
  const [reloadToken, setReloadToken] = useState(0);

  const auditOptions = useMemo(() => {
    const actionFilter = filters.action === "all" ? undefined : filters.action;
    const actorIdFilter = filters.actor.includes(":") ? filters.actor : undefined;
    const targetIdFilter = filters.target.includes(":") ? filters.target : undefined;
    return {
      limit: AUDIT_PAGE_SIZE,
      action: actionFilter,
      actorUserId: actorIdFilter,
      targetUserId: targetIdFilter,
    };
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    listAdminAuditEvents(auditOptions)
      .then((result) => {
        if (cancelled) return;
        setState({
          items: result.events,
          cursor: result.nextPageCursor,
          loading: false,
          loadingMore: false,
          error: null,
        });
      })
      .catch((error: any) => {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          loadingMore: false,
          error: error?.message ?? "Failed to load audit log",
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [auditOptions, reloadToken]);

  const handleLoadMore = async () => {
    if (!state.cursor) return;
    setState((prev) => ({ ...prev, loadingMore: true, error: null }));
    try {
      const result = await listAdminAuditEvents({
        ...auditOptions,
        cursor: state.cursor,
      });
      setState((prev) => ({
        items: [...prev.items, ...result.events],
        cursor: result.nextPageCursor,
        loading: false,
        loadingMore: false,
        error: null,
      }));
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        loadingMore: false,
        error: error?.message ?? "Failed to load more events",
      }));
    }
  };

  const visibleEvents = useMemo(() => {
    const actorTerm = filters.actor.trim().toLowerCase();
    const targetTerm = filters.target.trim().toLowerCase();
    return state.items.filter((event) => {
      const actorMatch =
        !actorTerm ||
        event.actorUserId.toLowerCase().includes(actorTerm) ||
        (event.actorDisplayName ?? "").toLowerCase().includes(actorTerm);
      const targetMatch = !targetTerm || event.targetUserId.toLowerCase().includes(targetTerm);
      return actorMatch && targetMatch;
    });
  }, [state.items, filters.actor, filters.target]);

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border p-3 text-xs" style={cardStyle}>
        <div className="flex items-center gap-2 rounded-xl border px-3 py-1" style={{ borderColor: "#2B4C73" }}>
          <Search className="h-4 w-4 text-[#5C8BC6]" />
          <input
            type="text"
            placeholder="Actor (id or name)"
            value={actorDraft}
            onChange={(event) => setActorDraft(event.target.value)}
            className="w-48 bg-transparent text-sm text-white placeholder:text-[#6E86A6] focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2 rounded-xl border px-3 py-1" style={{ borderColor: "#2B4C73" }}>
          <Search className="h-4 w-4 text-[#5C8BC6]" />
          <input
            type="text"
            placeholder="Target user id"
            value={targetDraft}
            onChange={(event) => setTargetDraft(event.target.value)}
            className="w-48 bg-transparent text-sm text-white placeholder:text-[#6E86A6] focus:outline-none"
          />
        </div>
        <Select
          label="Action"
          value={filters.action}
          onChange={(value) => setFilters((prev) => ({ ...prev, action: value as AuditActionFilter }))}
          options={[
            { value: "all", label: "All" },
            { value: "user.role.update", label: "Role update" },
            { value: "user.status.update", label: "Status update" },
            { value: "user.notes.update", label: "Notes update" },
          ]}
        />
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setReloadToken((token) => token + 1)}
            className="flex items-center gap-1 rounded-full border px-3 py-1 text-xs text-[#B0C4D9]"
            style={{ borderColor: "#2B4C73" }}
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </section>

      <div className="rounded-2xl border" style={cardStyle}>
        <header
          className="flex items-center justify-between border-b px-4 py-3 text-xs"
          style={{ borderColor: "#203650" }}
        >
          <span className="text-[#8AA5C4]">{visibleEvents.length} events</span>
          {state.loading && (
            <span className="flex items-center gap-2 text-[#B0C4D9]">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading
            </span>
          )}
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-white">
            <thead style={tableHeaderStyle}>
              <tr className="text-xs uppercase tracking-wide text-[#8AA5C4]">
                <th className="px-4 py-2">Time</th>
                <th className="px-4 py-2">Actor</th>
                <th className="px-4 py-2">Target User</th>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Summary</th>
              </tr>
            </thead>
            <tbody>
              {visibleEvents.map((event) => (
                <tr key={event.id} className="border-t text-xs text-[#E4ECF5]" style={{ borderColor: "#203650" }}>
                  <td className="px-4 py-2 text-[#8AA5C4]">{formatTimestamp(event.createdAt)}</td>
                  <td className="px-4 py-2">
                    <div className="text-white">{event.actorDisplayName ?? "N/A"}</div>
                    <div className="font-mono text-[11px] text-[#8AA5C4]">{event.actorUserId}</div>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      className="text-left font-mono text-[#5C8BC6] underline-offset-2 hover:underline"
                      onClick={() => onSelectUser(event.targetUserId)}
                    >
                      {event.targetUserId}
                    </button>
                  </td>
                  <td className="px-4 py-2">
                    <AuditActionBadge action={event.action} />
                  </td>
                  <td className="px-4 py-2 text-[#C8D6EC]">{event.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visibleEvents.length && !state.loading && (
            <div className="px-4 py-6 text-center text-sm text-[#8AA5C4]">
              No audit events match these filters.
            </div>
          )}
        </div>
        {state.error && (
          <div
            className="flex items-center gap-2 border-t px-4 py-3 text-xs text-[#FFB347]"
            style={{ borderColor: "#203650" }}
          >
            <AlertCircle className="h-3.5 w-3.5" />
            {state.error}
          </div>
        )}
        <footer
          className="flex items-center justify-between border-t px-4 py-3 text-xs"
          style={{ borderColor: "#203650" }}
        >
          <span className="text-[#8AA5C4]">
            {state.cursor ? "More events available" : "End of audit log"}
          </span>
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={!state.cursor || state.loadingMore}
            className="rounded-full border px-3 py-1 text-[#B0C4D9] disabled:opacity-40"
            style={{ borderColor: "#2B4C73" }}
          >
            {state.loadingMore ? "Loading..." : "Load more"}
          </button>
        </footer>
      </div>

      {!isAdmin && (
        <div
          className="rounded-2xl border px-4 py-3 text-xs text-[#8AA5C4]"
          style={{ borderColor: "#2B4C73" }}
        >
          You are viewing the audit log in read-only mode.
        </div>
      )}
    </div>
  );
}

function UserDetailPanel({
  user,
  isAdmin,
  detailLoading,
  detailError,
  notesValue,
  notesDirty,
  onNotesChange,
  onNotesSave,
  onRoleToggle,
  onStatusChange,
  actionError,
  actionPending,
  auditEntries,
  auditLoading,
  auditError,
  onRefreshAudit,
  showRawJson,
  toggleRawJson,
}: {
  user: AdminUser;
  isAdmin: boolean;
  detailLoading: boolean;
  detailError: string | null;
  notesValue: string;
  notesDirty: boolean;
  onNotesChange: (value: string) => void;
  onNotesSave: () => void;
  onRoleToggle: (role: AdminUserRole) => void;
  onStatusChange: (status: AdminUserStatus) => void;
  actionError: string | null;
  actionPending: boolean;
  auditEntries: AdminAuditEvent[];
  auditLoading: boolean;
  auditError: string | null;
  onRefreshAudit: () => void;
  showRawJson: boolean;
  toggleRawJson: () => void;
}) {
  const primaryRole = getPrimaryRole(user.roles);
  return (
    <div className="space-y-4 text-xs text-[#E4ECF5]">
      {detailLoading && (
        <div className="flex items-center gap-2 rounded-2xl border px-3 py-2" style={{ borderColor: "#2B4C73" }}>
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading user...
        </div>
      )}
      {detailError && (
        <div className="flex items-center gap-2 rounded-2xl border border-[#F9A825] bg-[#3A2B0F] px-3 py-2 text-[#FFD55F]">
          <AlertCircle className="h-3.5 w-3.5" />
          {detailError}
        </div>
      )}

      <div className="rounded-2xl border p-4" style={{ borderColor: "#2B4C73" }}>
        <div className="flex items-center gap-3">
          <Avatar url={getAvatar(user)} name={getDisplayName(user)} size={56} />
          <div className="min-w-0">
            <div className="truncate text-base text-white">{getDisplayName(user)}</div>
            <div className="font-mono text-[11px] text-[#8AA5C4]">{user.userId}</div>
            <div className="mt-1 flex gap-1">
              <RoleBadge role={primaryRole} />
              <ProviderBadge provider="discord" active={Boolean(user.providers?.discord)} />
              <ProviderBadge provider="google" active={Boolean(user.providers?.google)} />
            </div>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border p-4" style={{ borderColor: "#2B4C73" }}>
        <h3 className="mb-3 text-sm font-semibold text-white">Roles</h3>
        <div className="flex flex-wrap gap-2">
          {(["admin", "mod", "creator", "user"] as AdminUserRole[]).map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => onRoleToggle(role)}
              disabled={!isAdmin || role === "user"}
              className={`rounded-full px-3 py-1 text-xs ${
                user.roles.includes(role)
                  ? "bg-[#1F3A59] text-white"
                  : "bg-[#122033] text-[#6E86A6]"
              } disabled:opacity-50`}
            >
              {role}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border p-4" style={{ borderColor: "#2B4C73" }}>
        <h3 className="mb-3 text-sm font-semibold text-white">Status</h3>
        <div className="flex gap-2">
          {(["active", "suspended", "banned"] as AdminUserStatus[]).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => onStatusChange(status)}
              disabled={!isAdmin}
              className={`rounded-full border px-3 py-1 text-xs capitalize ${
                normalizeStatusLabel(user.status) === status
                  ? "border-[#5C8BC6] text-white"
                  : "border-[#2B4C73] text-[#8AA5C4]"
              } disabled:opacity-50`}
            >
              {status}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border p-4" style={{ borderColor: "#2B4C73" }}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Notes</h3>
          {!isAdmin && <span className="text-[11px] text-[#8AA5C4]">Read-only</span>}
        </div>
        <textarea
          value={notesValue}
          onChange={(event) => onNotesChange(event.target.value)}
          className="h-24 w-full rounded-xl border bg-[#0F1B2A] p-2 text-sm text-white placeholder:text-[#5C6E89] focus:outline-none disabled:opacity-60"
          style={{ borderColor: "#2B4C73" }}
          placeholder="Add context for moderators"
          disabled={!isAdmin}
        />
        <div className="mt-2 flex items-center justify-between text-[11px] text-[#8AA5C4]">
          {actionPending && (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving...
            </span>
          )}
          {notesDirty && isAdmin && (
            <button
              type="button"
              onClick={onNotesSave}
              className="ml-auto rounded-full border px-3 py-1 text-xs text-white"
              style={{ borderColor: "#2B4C73" }}
            >
              Save notes
            </button>
          )}
        </div>
        {actionError && (
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-[#F9A825] bg-[#3A2B0F] px-2 py-1 text-[11px] text-[#FFD55F]">
            <AlertCircle className="h-3 w-3" />
            {actionError}
          </div>
        )}
      </section>

      <section className="rounded-2xl border p-4" style={{ borderColor: "#2B4C73" }}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Audit log</h3>
          <button
            type="button"
            onClick={onRefreshAudit}
            className="flex items-center gap-1 rounded-full border px-2 py-1 text-[11px]"
            style={{ borderColor: "#2B4C73" }}
          >
            <RefreshCcw className="h-3 w-3" />
            Refresh
          </button>
        </div>
        {auditLoading && (
          <div className="flex items-center gap-2 text-[#8AA5C4]">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading entries...
          </div>
        )}
        {auditError && (
          <div className="flex items-center gap-2 rounded-xl border border-[#F9A825] bg-[#3A2B0F] px-2 py-1 text-[11px] text-[#FFD55F]">
            <AlertCircle className="h-3 w-3" />
            {auditError}
          </div>
        )}
        {!auditLoading && !auditEntries.length && (
          <div className="text-[11px] text-[#8AA5C4]">No actions logged.</div>
        )}
        <ul className="space-y-2">
          {auditEntries.map((entry) => (
            <li key={entry.id} className="rounded-xl border px-3 py-2 text-[11px]" style={{ borderColor: "#2B4C73" }}>
              <div className="flex items-center justify-between text-[#8AA5C4]">
                <span>{formatTimestamp(entry.createdAt)}</span>
                <AuditActionBadge action={entry.action} />
              </div>
              <div className="mt-1 text-white">{entry.actorDisplayName ?? entry.actorUserId}</div>
              <div className="text-[#C8D6EC]">{entry.summary}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border p-4" style={{ borderColor: "#2B4C73" }}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Meta</h3>
          <button
            type="button"
            onClick={toggleRawJson}
            className="flex items-center gap-1 text-[11px] text-[#5C8BC6]"
          >
            <StickyNote className="h-3 w-3" />
            {showRawJson ? "Hide raw JSON" : "Show raw JSON"}
          </button>
        </div>
        <dl className="space-y-1 text-[11px] text-[#C8D6EC]">
          <MetaRow label="Created" value={formatTimestamp(user.createdAt)} />
          <MetaRow label="Last login" value={formatTimestamp(user.lastLoginAt)} />
          <MetaRow label="Primary provider" value={user.primaryProvider} />
          <MetaRow label="Roles" value={user.roles.join(", ")} />
        </dl>
        {showRawJson && (
          <pre className="mt-3 max-h-48 overflow-auto rounded-xl bg-[#0F1B2A] p-3 text-[11px] text-[#8AA5C4]">
            {JSON.stringify(user, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
}

function AuditActionBadge({ action }: { action: AdminAuditAction }) {
  const label =
    action === "user.role.update"
      ? "Role update"
      : action === "user.status.update"
        ? "Status update"
        : "Notes update";
  return (
    <span className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: "#2B4C73", color: "#B0C4D9" }}>
      {label}
    </span>
  );
}

function MetaRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[#6E86A6]">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-[#8AA5C4]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border bg-[#0F1B2A] px-3 py-1 text-xs text-white focus:outline-none"
        style={{ borderColor: "#2B4C73" }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Avatar({
  url,
  name,
  size = 32,
}: {
  url?: string | null;
  name: string;
  size?: number;
}) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="rounded-full border object-cover"
        style={{ width: size, height: size, borderColor: "#2B4C73" }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-full border bg-[#0F1B2A] text-xs text-[#8AA5C4]"
      style={{ width: size, height: size, borderColor: "#2B4C73" }}
    >
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function RoleBadge({ role }: { role: AdminUserRole }) {
  const tone =
    role === "admin"
      ? "#F87171"
      : role === "mod"
        ? "#FBBF24"
        : role === "creator"
          ? "#34D399"
          : "#93C5FD";
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] capitalize"
      style={{ background: "rgba(255,255,255,0.08)", color: tone }}
    >
      {role}
    </span>
  );
}

function StatusBadge({ status }: { status: AdminUserStatus }) {
  const map: Record<
    AdminUserStatus,
    { label: string; color: string; icon: React.ReactNode }
  > = {
    active: { label: "Active", color: "#5CC689", icon: <CheckCircle2 className="h-3 w-3" /> },
    suspended: { label: "Suspended", color: "#F9A825", icon: <Shield className="h-3 w-3" /> },
    banned: { label: "Banned", color: "#FF6B6B", icon: <Ban className="h-3 w-3" /> },
  };
  const { label, color, icon } = map[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
      style={{ color, background: "rgba(255,255,255,0.06)" }}
    >
      {icon}
      {label}
    </span>
  );
}

function ProviderBadge({
  provider,
  active,
}: {
  provider: "discord" | "google";
  active: boolean;
}) {
  const label = provider === "discord" ? "D" : "G";
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
        active ? "bg-[#1F3A59] text-white" : "bg-[#0F1B2A] text-[#55637B]"
      }`}
      title={provider}
    >
      {label}
    </span>
  );
}

function getPrimaryRole(roles: AdminUserRole[]): AdminUserRole {
  const order: AdminUserRole[] = ["admin", "mod", "creator", "user"];
  for (const role of order) {
    if (roles.includes(role)) {
      return role;
    }
  }
  return "user";
}

function getDisplayName(user: AdminUser): string {
  return (
    user.displayName ??
    user.profile?.displayName ??
    user.providers?.discord?.displayName ??
    user.providers?.google?.displayName ??
    user.userId
  );
}

function getAvatar(user: AdminUser): string | null {
  return (
    user.avatarUrl ??
    user.providers?.discord?.avatarUrl ??
    user.providers?.google?.avatarUrl ??
    null
  );
}

function normalizeStatusLabel(status?: AdminUserStatus): AdminUserStatus {
  return status ?? "active";
}

function formatTimestamp(value?: Timestamp | null): string {
  if (!value) return "—";
  const date = value.toDate();
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
