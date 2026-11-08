import path from "node:path";
import type { Plugin } from "vite";

// Original bootstrap, main, router, Toplist, HUD, tables, SW and worker graph.
// Only auth/session, global guild selection and archive transport are bounded.
export function updateFixturePlugin(stand: "old" | "current", fullPlayers = false): Plugin {
  // Only validation instrumentation is stand-specific. All actual application
  // and worker module addresses retain their original production/dev paths.
  const fixture = `/tools/toplists/fixtures/localScanArchiveLookupReload/fixture.ts?validation-stand=${stand}`;
  const boundaries = "/tools/toplists/fixtures/localScanArchiveLookupReload/boundaries.tsx";
  const aliases: Record<string, string> = {
    "/src/context/AuthContext": "AuthProvider,useAuth",
    "/src/pages/GuildHub/hooks/useGuildHubSelection": "useGuildHubSelection",
  };
  return { name: "w27-update-controlled-boundaries", enforce: "pre",
    resolveId(source, importer) {
      if (source.startsWith("https://sf-libs")) return "\0w27-update:coa";
      if (!importer || !source.startsWith(".")) return;
      const resolved = path.resolve(path.dirname(importer), source).replace(/\\/g, "/").replace(/\.(tsx?|jsx?)$/, "");
      const key = Object.keys(aliases).find(key => resolved.endsWith(key));
      if (key) return `\0w27-update:${key}`;
    },
    load(id) {
      if (id === "\0w27-update:coa") return "export class CoaRenderer {}";
      if (id.startsWith("\0w27-update:")) {
        const source = id.slice(12);
        return `export {${aliases[source]}} from '${boundaries}'; export * from '${source}';`;
      }
    },
    transform(code, id) {
      const name = id.replace(/\\/g, "/").split("?")[0];
      if (name.endsWith("/src/lib/guilds/localScanLibrary.ts")) return code.replace('export async function findGuildHubLocalScanByArchiveScanId(archiveScanId: string) {', 'export async function findGuildHubLocalScanByArchiveScanId(archiveScanId: string) { (globalThis as any).w27Update?.lookupIds.push(archiveScanId);');
      if (name.endsWith("/src/main.tsx")) return `import '${fixture}';\n${code}`;
      if (name.endsWith("/localScanArchiveLookupReload/fixture.ts")) return code.replace("__VALIDATION_STAND__", stand).replace("__VALIDATION_FULL_PLAYERS__", String(fullPlayers));
      if (name.endsWith("/src/pages/DataHub/localToplistPageModel.ts")) return code.replace('): Promise<LocalToplistArchiveContext> {', '): Promise<LocalToplistArchiveContext> { if ((globalThis as any).w27Update?.context) return (globalThis as any).w27Update.context;');
      if (name.endsWith("/src/lib/toplists/localToplistService.ts")) return code.replace('  ...defaultDependencies,', '  ...defaultDependencies, acquireEntries: (globalThis as any).w27Update?.acquire ?? defaultDependencies.acquireEntries,');
    },
  };
}
