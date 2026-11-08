import React from "react";
export { Shell, None, ExportController, HudFilters, Forbidden, getPlayerToplistSnapshotByDocIdCached } from "../../../toplists/fixtures/localToplistRevision/mocks";
export const db = {};
const listeners = new Set<() => void>();
let auth = { isLoading: false, status: "authenticated", user: { id: "", roles: ["admin"], favorites: { players: {}, guilds: {} }, linkedPlayers: [] }, logout: () => {} };
export function setRole(role: string) { auth = { ...auth, status: role === "guest" ? "unauthenticated" : "authenticated", user: { ...auth.user, roles: role === "guest" ? [] : [role] } }; listeners.forEach(fn => fn()); }
export function useAuth() { return React.useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => auth); }
export const useDataJobs = () => ({ isReady: true, runningSfToolsImportJob: null, runningScanMergeJob: null, startSfToolsImportJob: () => { throw Error("Unexpected fixture write"); }, startScanMergeJob: () => { throw Error("Unexpected fixture write"); } });
export const Portrait = () => null;
export function RegisteredPage() { return <div data-registered-page>Registered neighbor</div>; }
export function Topbar() { return <button data-scan-open onClick={() => (globalThis as any).w12.setScan(true)}>Scans</button>; }

export const getDataJobDetail = async () => null;

export const getDataJobProgress = () => 0;
export const getDataJobStatusLabel = () => "Fixture";
