/** Language-independent help structure. No guide routes, scan data or network access. */
export type QaSection = { id: string; questions: readonly string[] };
export type QaTopic = { id: string; nested: boolean; sections: readonly QaSection[] };
export const qaTopics: readonly QaTopic[] = [
  { id: "general", nested: false, sections: [{ id: "general", questions: ["what-is", "features", "account-needed"] }] },
  { id: "data-management", nested: true, sections: [
    { id: "pool", questions: ["local-pool", "missing-data", "browser-storage"] },
    { id: "archive", questions: ["load-archive", "archive-vs-import"] },
    { id: "imports", questions: ["import-file", "publish-import"] },
    { id: "freshness", questions: ["data-age", "different-values"] },
  ] },
  { id: "datahub", nested: true, sections: [
    { id: "dashboard", questions: ["find-tools", "scan-counts"] },
    { id: "toplists", questions: ["select-servers", "filters-views", "find-entity"] },
    { id: "players", questions: ["player-views", "comparison-scan", "compare-players"] },
    { id: "guilds", questions: ["trend-compare", "guild-deltas", "chart-period"] },
    { id: "identity", questions: ["identity-purpose", "identity-scans", "matching-status"] },
    { id: "fights", questions: ["create-tracker", "record-fights", "participation"] },
  ] },
  { id: "favorites", nested: false, sections: [{ id: "favorites", questions: ["add-remove", "guest-favorites", "edit-favorites", "context-actions", "favorites-devices"] }] },
  { id: "account", nested: false, sections: [{ id: "account", questions: ["sign-in", "account-benefits"] }] },
];

type QaReferences = { related?: readonly string[]; action?: { to: string; labelKey: string } };
const references: Record<string, QaReferences> = {
  features: { related: ["find-tools"] },
  "account-needed": { related: ["guest-favorites", "account-benefits"] },
  "local-pool": { related: ["load-archive", "import-file"] },
  "missing-data": { related: ["load-archive", "import-file", "identity-scans"] },
  "browser-storage": { related: ["favorites-devices"] },
  "load-archive": { action: { to: "/data-hub/scan-management?tab=archive", labelKey: "hubNavigation.scanManagement" } },
  "archive-vs-import": { related: ["load-archive", "import-file"] },
  "import-file": { action: { to: "/data-hub/scan-management", labelKey: "hubNavigation.scanManagement" } },
  "publish-import": { related: ["browser-storage"] },
  "data-age": { related: ["load-archive", "import-file"] },
  "different-values": { related: ["data-age"] },
  "find-tools": { action: { to: "/data-hub", labelKey: "nav.dataHub" } },
  "scan-counts": { related: ["local-pool", "archive-vs-import"] },
  "select-servers": { related: ["load-archive"] },
  "filters-views": { action: { to: "/settings?tab=datahub&section=toplists", labelKey: "nav.settings" } },
  "find-entity": { related: ["missing-data"] },
  "player-views": { related: ["missing-data"] },
  "comparison-scan": { related: ["load-archive", "import-file"] },
  "compare-players": { related: ["find-entity"] },
  "guild-deltas": { related: ["comparison-scan"] },
  "chart-period": { related: ["guild-deltas", "load-archive"] },
  "identity-purpose": { related: ["identity-scans"] },
  "identity-scans": { related: ["load-archive", "import-file"] },
  "matching-status": { related: ["identity-scans"] },
  "create-tracker": { related: ["local-pool"] },
  "record-fights": { related: ["create-tracker"] },
  "add-remove": { related: ["edit-favorites"] },
  "guest-favorites": { related: ["sign-in", "favorites-devices"] },
  "favorites-devices": { related: ["sign-in", "browser-storage"] },
  "account-benefits": { related: ["favorites-devices", "account-needed"] },
};
export type QaQuestion = QaReferences & { id: string; topic: QaTopic; section: QaSection };
export const qaQuestions: readonly QaQuestion[] = qaTopics.flatMap(topic => topic.sections.flatMap(section =>
  section.questions.map(id => ({ id, topic, section, ...references[id] }))));
const byId = new Map(qaQuestions.map(question => [question.id, question]));
export const getQaQuestion = (id: unknown): QaQuestion | undefined => typeof id === "string" ? byId.get(id) : undefined;

export function readQaAddress(search: string, hash = "") {
  const params = new URLSearchParams(search);
  const question = getQaQuestion(hash === "#linking" ? "sign-in" : params.get("question"));
  const topic = question?.topic ?? qaTopics.find(item => item.id === params.get("topic")) ?? qaTopics[0];
  const section = topic.nested ? question?.section ?? topic.sections.find(item => item.id === params.get("sub")) : undefined;
  const opened = new Set((params.get("open") ?? "").split(",").filter(id => !!getQaQuestion(id)));
  if (question) opened.add(question.id);
  return { topic, section, question, opened };
}

/** Stable public addresses for later wiki links and topic cards. */
export function qaQuestionHref(id: string) {
  const question = getQaQuestion(id);
  if (!question) return "/help?view=qa";
  const params = new URLSearchParams({ view: "qa", topic: question.topic.id });
  if (question.topic.nested) params.set("sub", question.section.id);
  params.set("question", id);
  return `/help?${params}`;
}

export const normalizeQaSearch = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
