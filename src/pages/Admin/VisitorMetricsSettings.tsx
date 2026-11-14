import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AUTH_BASE_URL } from "../../lib/auth/config";
import { useAuth } from "../../context/AuthContext";

export async function visitorAdminRequest(action: string, init?: RequestInit) {
  if (!AUTH_BASE_URL) throw new Error("Auth API is not configured");
  const response = await fetch(`${AUTH_BASE_URL}/api/admin/stats/visitor/${action}`, { credentials: "include", ...init });
  if (!response.ok) throw new Error(`Visitor analytics request failed (${response.status})`);
  return response.json();
}
export default function VisitorMetricsSettings() {
  const { status, user } = useAuth();
  return status === "authenticated" && user?.roles.includes("admin") ? <VisitorMetricsSettingsForm key={user.id} /> : null;
}
function VisitorMetricsSettingsForm() {
  const { t, i18n } = useTranslation();
  const [start, setStart] = useState("");
  const [sessionsVerified, setSessionsVerified] = useState(false);
  const [confirmedStart, setConfirmedStart] = useState<string | null>(null);
  const [status, setStatus] = useState("loading");
  const [configReady, setConfigReady] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    request.current = controller;
    void visitorAdminRequest("config", { signal: controller.signal }).then(config => {
      if (!active) return;
      setStart(config.startDate ?? ""); setSessionsVerified(config.sessionsVerified === true);
      setConfirmedStart(config.sessionsVerified ? config.startDate : null); setConfigReady(true); setStatus("idle");
    }, () => { if (active) setStatus("error"); });
    return () => { active = false; request.current?.abort(); };
  }, []);
  const save = async () => {
    if (!configReady || status === "saving") return;
    const controller = new AbortController();
    request.current = controller;
    setStatus("saving");
    try {
      const config = await visitorAdminRequest("config", { method: "PUT", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startDate: start, sessionsVerified }) });
      if (controller.signal.aborted) return;
      setConfirmedStart(config.sessionsVerified ? config.startDate : null); setStatus("saved");
    } catch { if (!controller.signal.aborted) setStatus("error"); }
  };
  return (
    <section className="rounded-2xl border p-4 space-y-3 text-sm text-[#B0C4D9]" style={{ borderColor: "#2B4C73", background: "#152A42" }}>
      <h2 className="font-semibold text-[#F5F9FF]">{t("footer.admin.title")}</h2>
      <p>{t("footer.admin.explanation")}</p>
      <label className="flex flex-wrap items-center gap-3">
        <span>{t("footer.admin.start")}</span>
        <input type="date" value={start} disabled={status === "loading" || status === "saving"} onChange={event => setStart(event.target.value)} className="rounded border border-[#2B4C73] bg-[#1A2F4A] p-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#82BBFF]" />
      </label>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={sessionsVerified} disabled={status === "loading" || status === "saving"} onChange={event => setSessionsVerified(event.target.checked)} className="mt-1" />
        <span>{t("footer.admin.sessions")}</span>
      </label>
      <p>{confirmedStart ? t("footer.admin.collection", { start: new Intl.DateTimeFormat(i18n.resolvedLanguage || "en", { dateStyle: "medium", timeZone: "Europe/Berlin" }).format(new Date(confirmedStart + "T12:00:00Z")) }) : t("footer.admin.activation")}</p>
      <button type="button" onClick={() => void save()} disabled={!configReady || !start || status === "loading" || status === "saving"} className="rounded border border-[#2B4C73] bg-[#1A2F4A] px-4 py-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#82BBFF] disabled:opacity-50">{t(status === "saving" ? "footer.admin.saving" : "footer.admin.save")}</button>
      <span role="status" className="ml-3">{status === "saved" ? t("footer.admin.saved") : status === "error" ? t("footer.admin.error") : ""}</span>
    </section>
  );
}
