import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { LOCAL_SERVER_FUSION_EVENTS } from "../../src/data/serverFusions";
import { LOCAL_SERVER_REGISTRY } from "../../src/data/serverRegistry";
import { SERVERS } from "../../src/data/servers";
import { validateServerGraph } from "../../src/lib/servers/serverResolver";
import { serversOverviewEntrypoints, serversOverviewNodes } from "../../src/pages/servers/overview/serversOverview.config";

type FirestoreField = {
  stringValue?: string;
  integerValue?: string;
  booleanValue?: boolean;
  arrayValue?: { values?: FirestoreField[] };
  mapValue?: { fields?: Record<string, FirestoreField> };
};

type FirestoreDocument = {
  name: string;
  fields?: Record<string, FirestoreField>;
};

type SfgameConfigServer = {
  i?: number;
  d?: string;
  c?: string;
  md?: string;
  m?: string;
  p?: string;
};

const repoRoot = process.cwd();
const outPath = path.join(repoRoot, "tools/servers/server-fusion-coverage-audit.latest.txt");
const firestoreSnapshotPath = path.join(repoRoot, ".tmp/sfdatahub-firestore-servers.json");
const sfgameConfigPath = path.join(repoRoot, ".tmp/sfgame-config.json");

const today = "2026-09-23";

const lines: string[] = [];
const line = (value = "") => lines.push(value);

const codeCompare = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });

const table = (headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>) => {
  line(`| ${headers.join(" | ")} |`);
  line(`| ${headers.map(() => "---").join(" | ")} |`);
  rows.forEach((row) => {
    line(`| ${row.map((cell) => String(cell ?? "")).join(" | ")} |`);
  });
};

const unique = <T>(items: T[]) => [...new Set(items)];

const fieldValue = (field: FirestoreField | undefined): unknown => {
  if (!field) return undefined;
  if (field.stringValue != null) return field.stringValue;
  if (field.integerValue != null) return Number(field.integerValue);
  if (field.booleanValue != null) return field.booleanValue;
  if (field.arrayValue) return field.arrayValue.values?.map(fieldValue) ?? [];
  if (field.mapValue) return field.mapValue.fields ?? {};
  return undefined;
};

const readJson = <T>(filePath: string): T | null => {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
};

const hostToCode = (host: string) => {
  const lowered = host.toLowerCase();
  const fusion = lowered.match(/^f(\d+)\.sfgame\.net$/);
  if (fusion) return `F${fusion[1]}`;
  const eu = lowered.match(/^s(\d+)\.sfgame\.eu$/);
  if (eu) return `EU${eu[1]}`;
  const named = lowered.match(/^([a-z]+)\.sfgame\.net$/);
  if (named) return named[1].toUpperCase();
  const world = lowered.match(/^w(\d+)\.sfgame\.net$/);
  if (world) return `INT${world[1]}`;
  return host;
};

const compressHosts = (hosts: string[]) => {
  if (hosts.length <= 8) return hosts.join(", ");
  return `${hosts.slice(0, 8).join(", ")}, ... (${hosts.length} total)`;
};

const getLocalDuplicateReport = () => {
  const byCode = new Map<string, string[]>();
  const byHost = new Map<string, string[]>();
  const byNumeric = new Map<number, string[]>();

  LOCAL_SERVER_REGISTRY.forEach((server) => {
    byCode.set(server.code, [...(byCode.get(server.code) ?? []), server.displayName]);
    byHost.set(server.host.toLowerCase(), [...(byHost.get(server.host.toLowerCase()) ?? []), server.code]);
    if (server.numericId != null) {
      byNumeric.set(server.numericId, [...(byNumeric.get(server.numericId) ?? []), server.code]);
    }
  });

  return {
    duplicateCodes: [...byCode.entries()].filter(([, values]) => values.length > 1),
    duplicateHosts: [...byHost.entries()].filter(([, values]) => values.length > 1),
    duplicateNumericIds: [...byNumeric.entries()].filter(([, values]) => values.length > 1),
  };
};

const getLocalEventReport = () => {
  const futureEvents = LOCAL_SERVER_FUSION_EVENTS.filter(
    (event) => event.effectiveDate && event.effectiveDate > today,
  );
  const unknownPolicyEvents = LOCAL_SERVER_FUSION_EVENTS.filter(
    (event) => event.compensationPolicy === "unknown",
  );
  const missingEffectiveDateEvents = LOCAL_SERVER_FUSION_EVENTS.filter((event) => !event.effectiveDate);
  return { futureEvents, unknownPolicyEvents, missingEffectiveDateEvents };
};

const walk = (dir: string, out: string[] = []) => {
  const skip = new Set(["node_modules", ".git", "dist", "docs/assets", ".tmp"]);
  readdirSync(dir).forEach((entry) => {
    const full = path.join(dir, entry);
    const rel = path.relative(repoRoot, full).replaceAll("\\", "/");
    if ([...skip].some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))) return;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx|mts|md|json)$/.test(entry) && !entry.endsWith(".latest.txt")) {
      out.push(full);
    }
  });
  return out;
};

const hardcodeAudit = () => {
  const needle = /\b(F28|EU1|EU2|EU3|EU4|levelGoldV1|compensationPolicy)\b/;
  return walk(path.join(repoRoot, "src"))
    .concat(walk(path.join(repoRoot, "tools")))
    .flatMap((file) => {
      const rel = path.relative(repoRoot, file).replaceAll("\\", "/");
      const content = readFileSync(file, "utf8").split(/\r?\n/);
      return content.flatMap((text, index) => {
        if (!needle.test(text)) return [];
        const context = text.trim().replace(/\s+/g, " ");
        const legitimate =
          rel.includes(".test.") ||
          rel === "src/data/serverRegistry.ts" ||
          rel === "src/data/serverFusions.ts" ||
          rel.startsWith("tools/servers/");
        const analysisOnly = rel.startsWith("tools/identities/");
        const productHardcode =
          rel === "src/lib/identities/fusionIdentityManagement.ts" ||
          rel === "src/lib/identities/playerFusionPreviewAdapter.ts" ||
          rel === "src/pages/Scans/FusionIdentity.tsx";
        return [
          {
            file: rel,
            line: index + 1,
            kind: legitimate
              ? "fixture/local registry"
              : analysisOnly
                ? "analysis tool scope"
                : productHardcode
                  ? "product scope/copy"
                  : "incidental/demo/content",
            refactor: productHardcode ? "yes" : analysisOnly ? "later, if reused" : "no/implied by context",
            context,
          },
        ];
      });
    });
};

const firestoreSnapshot = readJson<{ documents?: FirestoreDocument[] }>(firestoreSnapshotPath);
const sfgameConfig = readJson<{ servers?: SfgameConfigServer[] }>(sfgameConfigPath);

const firestoreRows = (firestoreSnapshot?.documents ?? []).map((document) => {
  const fields = document.fields ?? {};
  const numericIdField = fields.numericId ? "numericId" : fields.numericID ? "numericID" : "";
  return {
    docId: document.name.split("/").at(-1) ?? "",
    code: String(fieldValue(fields.code) ?? ""),
    host: String(fieldValue(fields.host) ?? ""),
    numericId: fieldValue(fields.numericId) ?? fieldValue(fields.numericID),
    numericIdField,
    active: fieldValue(fields.active),
    type: fieldValue(fields.type),
    region: fieldValue(fields.region),
    hasReleaseDate: Boolean(fields.releaseDate),
    hasAliases: Boolean(fields.aliases),
  };
});

const configServers = sfgameConfig?.servers ?? [];
const configByHost = new Map(configServers.flatMap((server) => (server.d ? [[server.d, server]] : [])));
const configFusionGroups = new Map<string, SfgameConfigServer[]>();
configServers.forEach((server) => {
  if (!server.md) return;
  configFusionGroups.set(server.md, [...(configFusionGroups.get(server.md) ?? []), server]);
});

line("# Server / Fusion Coverage Audit");
line(`Generated: ${today}`);
line("Mode: local runtime foundation audit. Dashboard, matching, workers, and UI copy remain out of scope.");
line();

line("## A. Local Server Registry");
table(
  ["code", "displayName", "host", "numericId", "aliases", "releaseDate", "type", "region", "active"],
  [...LOCAL_SERVER_REGISTRY]
    .sort((left, right) => codeCompare(left.code, right.code))
    .map((server) => [
      server.code,
      server.displayName,
      server.host,
      server.numericId ?? "",
      server.aliases.join(", "),
      server.releaseDate ?? "",
      server.type,
      server.region,
      server.active,
    ]),
);
line();
line(`Local registry coverage: ${LOCAL_SERVER_REGISTRY.length} servers; releaseDate known for ${LOCAL_SERVER_REGISTRY.filter((server) => server.releaseDate).length}; numericId known for ${LOCAL_SERVER_REGISTRY.filter((server) => server.numericId != null).length}.`);
line();

line("## B. Local Fusion Events");
table(
  ["event", "origins", "target", "effectiveDate", "compensationPolicy"],
  [...LOCAL_SERVER_FUSION_EVENTS].map((event) => [
    event.id,
    event.origins.join(", "),
    event.target,
    event.effectiveDate ?? "unknown",
    event.compensationPolicy,
  ]),
);
line();
const eventReport = getLocalEventReport();
line(`Local fusion coverage: ${LOCAL_SERVER_FUSION_EVENTS.length} multi-origin events; future events: ${eventReport.futureEvents.map((event) => event.id).join(", ") || "none"}; unknown compensation policies: ${eventReport.unknownPolicyEvents.length}; missing effective dates: ${eventReport.missingEffectiveDateEvents.map((event) => event.id).join(", ") || "none"}.`);
line();

const duplicates = getLocalDuplicateReport();
const graphIssues = validateServerGraph();
line("## C. Local Graph Validation");
table(
  ["check", "result"],
  [
    ["duplicate codes", duplicates.duplicateCodes.length ? JSON.stringify(duplicates.duplicateCodes) : "none"],
    ["duplicate hosts", duplicates.duplicateHosts.length ? JSON.stringify(duplicates.duplicateHosts) : "none"],
    ["duplicate numeric IDs", duplicates.duplicateNumericIds.length ? JSON.stringify(duplicates.duplicateNumericIds) : "none"],
    ["schema/graph issues", graphIssues.length ? JSON.stringify(graphIssues) : "none"],
  ],
);
line();

line("## D. F28 / EU Hardcode Audit");
const hardcodes = hardcodeAudit();
table(
  ["file", "line", "hardcode type", "needs refactor?", "context"],
  hardcodes
    .filter((entry) => entry.kind !== "incidental/demo/content")
    .slice(0, 80)
    .map((entry) => [entry.file, entry.line, entry.kind, entry.refactor, entry.context.replaceAll("|", "\\|")]),
);
line(`Hardcode findings shown: ${Math.min(80, hardcodes.filter((entry) => entry.kind !== "incidental/demo/content").length)} of ${hardcodes.filter((entry) => entry.kind !== "incidental/demo/content").length} non-incidental matches.`);
line();

line("## E. Existing Firestore `servers` Registry Snapshot");
if (!firestoreRows.length) {
  line("No Firestore snapshot found. Expected optional input: .tmp/sfdatahub-firestore-servers.json");
} else {
  table(
    ["code", "docId", "host", "numericId", "numeric field", "type", "active", "releaseDate?", "aliases?"],
    firestoreRows
      .sort((left, right) => codeCompare(left.code, right.code))
      .map((row) => [
        row.code,
        row.docId,
        row.host,
        row.numericId == null ? "" : String(row.numericId),
        row.numericIdField || "missing",
        String(row.type ?? ""),
        String(row.active ?? ""),
        row.hasReleaseDate ? "yes" : "no",
        row.hasAliases ? "yes" : "no",
      ]),
  );
  line();
  line(`Firestore coverage: ${firestoreRows.length} docs. Missing numeric IDs: ${firestoreRows.filter((row) => row.numericId == null).map((row) => row.code).join(", ") || "none"}. Release dates: ${firestoreRows.filter((row) => row.hasReleaseDate).length}. Aliases: ${firestoreRows.filter((row) => row.hasAliases).length}.`);
  line(`Schema issues: numericId/numericID casing is mixed for ${firestoreRows.filter((row) => row.numericIdField === "numericID").map((row) => row.code).join(", ") || "none"}; string numeric IDs observed for EU26/EU9 in source snapshot; docId mismatch observed for ${firestoreRows.filter((row) => row.docId !== row.code).map((row) => `${row.docId}->${row.code}`).join(", ") || "none"}.`);
}
line();

line("## F. Official sfgame.net Config Snapshot");
if (!configServers.length) {
  line("No official config snapshot found. Expected optional input: .tmp/sfgame-config.json");
} else {
  const relevantTargets = [...configFusionGroups.keys()].filter((target) => target.endsWith(".sfgame.net"));
  table(
    ["target host", "target code", "target numericId", "publish/open time", "origin count", "origin hosts"],
    relevantTargets
      .sort((left, right) => codeCompare(hostToCode(left), hostToCode(right)))
      .map((target) => {
        const targetEntry = configByHost.get(target);
        const origins = configFusionGroups.get(target) ?? [];
        return [
          target,
          hostToCode(target),
          targetEntry?.i ?? "",
          targetEntry?.p ?? "",
          origins.length,
          compressHosts(origins.map((origin) => origin.d ?? "").filter(Boolean)),
        ];
      }),
  );
  line();
  const localHosts = new Set(LOCAL_SERVER_REGISTRY.map((server) => server.host));
  const missingLocally = configServers.filter((server) => server.d && (server.md || server.c === "fu") && !localHosts.has(server.d));
  line(`Official config coverage: ${configServers.length} servers total; ${configFusionGroups.size} fusion/named target groups. Fusion-related hosts missing from local registry: ${missingLocally.length}.`);
  line("Important current/future config facts: f28.sfgame.net numericId=549, p=2026-02-06 15:00:00; f29.sfgame.net numericId=550, p=2026-10-16 15:00:00, origins EU5-EU8 with migration cutoff 2026-10-15 21:59:59. F29 is future relative to 2026-09-23.");
}
line();

line("## G. Other In-Repo Server Sources");
table(
  ["source", "coverage", "notes"],
  [
    ["src/data/servers.ts", `${SERVERS.length} picker entries`, "UI/toplist picker only; intentionally not authoritative for resolver coverage."],
    ["src/pages/servers/overview/serversOverview.config.ts", `${Object.keys(serversOverviewNodes).length} nodes; ${serversOverviewEntrypoints.length} entrypoints`, "Broad fusion tree sketch through F27 plus Maerwynn/Black Forest/Granogrim; no numeric IDs, hosts, release dates, effective dates, or source metadata. It says screenshot-derived and should not become authoritative without verification."],
    ["tools/backfill-monthly-*.mts", "named read aliases", "Maintains read aliases for MAERWYNN, BLACKFOREST, GNAROGRIM, STUMBLESTEPPE/STUMPLESTEPPE; these are currently outside serverResolver."],
    ["Firestore servers", firestoreRows.length ? `${firestoreRows.length} docs` : "snapshot unavailable", "Manually maintained operational registry; no releaseDate/aliases in snapshot."],
  ],
);
line();

line("## H. Coverage Matrix: Local vs Firestore vs Official Config");
const knownServerCodes = unique([
  ...LOCAL_SERVER_REGISTRY.map((server) => server.code),
  ...firestoreRows.map((row) => row.code).filter(Boolean),
  ...configServers.filter((server) => server.d).map((server) => hostToCode(server.d!)),
]).sort(codeCompare);
table(
  ["server", "local", "firestore", "official config", "numericId local/firestore/config", "host local/firestore/config"],
  knownServerCodes
    .filter((code) => /^F\d+$|^EU\d+$|MAERWYNN|BLACKFOREST|GNAROGRIM|STUMBLESTEPPE/.test(code))
    .map((code) => {
      const local = LOCAL_SERVER_REGISTRY.find((server) => server.code === code);
      const firestore = firestoreRows.find((row) => row.code === code);
      const config = configServers.find((server) => server.d && hostToCode(server.d) === code);
      return [
        code,
        local ? "yes" : "no",
        firestore ? "yes" : "no",
        config ? "yes" : "no",
        `${local?.numericId ?? ""}/${firestore?.numericId ?? ""}/${config?.i ?? ""}`,
        `${local?.host ?? ""}/${firestore?.host ?? ""}/${config?.d ?? ""}`,
      ];
    }),
);
line();

line("## I. Compensation Matrix and Policy Findings");
table(
  ["event", "policy", "oldest origin", "release dates complete?", "formula applicable?", "evidence/confidence"],
  [
    ["F1-F23", "none or historical coupon only", "varies", "not required for levelGoldV1", "no", "Project assumption; needs event-by-event confirmation for exact wording."],
    ["F24-F27", "unknown", "event-specific", "not used until policy confirmed", "no", "Policy remains explicit unknown; no F24+ heuristic is applied."],
    ["F28", "levelGoldV1", "EU1", "yes for EU1-EU4", "yes", "Existing local validated EU release dates and F28 behavior preserved as regression baseline."],
    ["Maerwynn", "none", "F1", "ambiguous", "no", "Steam announcement explicitly says no compensation other than usual fusion coupon for fusion-of-fused-worlds."],
    ["Blackforest/Gnarogrim/Stumble Steppe", "unknown", "fusion targets", "ambiguous", "unknown", "Need official announcement pages to confirm whether Maerwynn rule was repeated."],
    ["F29", "unknown", "EU5", "release dates needed for EU5-EU8 if policy changes", "no", "Official config schedules event for 2026-10-16; compensation remains unknown until event-specific confirmation."],
  ],
);
line();
line("Current helper status: fusionCompensation.ts evaluates compensation against the direct FusionEvent participant set and refuses unknown policies instead of inferring them from dates or ancestry.");
line();

line("## J. Missing Data");
line("Blocking unknowns:");
line("- ReleaseDate coverage remains intentionally limited to currently validated EU1-EU4 values.");
line("- Compensation policy is not explicit per event except F28 local relations; Blackforest/Gnarogrim/Stumble Steppe/F29 need official announcement verification.");
line("- Named server canonicalization conflict: official/config uses blackforest and stumblesteppe hosts; local backfill code accepts BLACKFOREST, BLACK_FOREST, STUMBLESTEPPE and typo STUMPLESTEPPE; overview uses BLACK_FOREST and GRANOGRIM.");
line();
line("Non-blocking unknowns:");
line("- Missing release dates on policy=none/unknown events do not block resolution.");
line("- UI picker completeness is separate from resolver completeness; obsolete fusion targets need to remain resolvable but do not all need dashboard tiles.");
line("- Raw scan values should remain raw; resolver aliases can grow without rewriting imported scans.");
line();

line("## K. Data Model Recommendation");
line("Implemented foundation: ServerDefinition has hosts[] and aliases[], numericId stays optional, type/active semantics are explicit, and releaseDate remains optional.");
line("Implemented foundation: FusionEvent is event-shaped with id, origins[], target, effectiveDate?, and explicit compensationPolicy.");
line("Implemented foundation: Resolver validation checks unknown endpoints, cycles, duplicate outgoing origin events, duplicate event ids, duplicate targets, duplicate hosts, duplicate aliases, and duplicate numeric IDs.");
line();

line("## L. Implementation Phases");
line("Completed in this block: canonical aliases, bulk local registry from official config, FusionEvent model, DAG validation, direct/transitive lineage helpers, future event status, and event-bound compensation policy handling.");
line("Next block should integrate this foundation into Fusion Identity dashboard/matching scopes deliberately, replacing the temporary F28-only compatibility adapter only after UI and worker behavior are covered.");
line();

writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Wrote ${path.relative(repoRoot, outPath)}`);
