import React from "react";
import { useLocation } from "react-router-dom";
const listeners = new Set<() => void>();
let auth = { isLoading: false, status: "unauthenticated", user: null as any, logout: async () => setRole("guest") };
export function setRole(role: string) { auth = { ...auth, status: role === "guest" ? "unauthenticated" : "authenticated", user: role === "guest" ? null : { id: `synthetic-${role}`, roles: [role], linkedPlayers: [] } }; listeners.forEach(fn=>fn()); }
export function useAuth() { return React.useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},()=>auth); }
export function None() { return null; }
export function Children({children}: {children: React.ReactNode}) { return <>{children}</>; }
export function AccountProbe() { const l=useLocation();return <div data-account-probe>{l.pathname+l.search}</div>; }
export function Forbidden() { (globalThis as any).w124?.operations.push("forbidden-feature-render");throw Error("Unexpected feature job"); }
export const db = {};
export function Topbar() { return <div style={{height:72,background:'#152a42'}} aria-label="Test shell topbar" />; }
export function useLocalePreferences() { return { activeLocale: "en", preferredSecondaryLocale:"de", setActiveLocale:()=>{}, selectLocale:()=>{}, togglePrimarySecondary:()=>{} }; }
