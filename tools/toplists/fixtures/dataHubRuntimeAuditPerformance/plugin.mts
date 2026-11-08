import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import type { Plugin } from 'vite';

const observerURL = '/tools/toplists/fixtures/dataHubRuntimeAuditPerformance/observer.ts';
const boundaries = '/tools/toplists/fixtures/dataHubRuntimeAuditPerformance/boundaries.tsx';
const aliases: Record<string, string> = {
  '/src/context/AuthContext': 'useAuth',
  '/src/pages/GuildHub/hooks/useGuildHubSelection': 'useGuildHubSelection',
  '/src/components/ContentShell': 'default:Shell', '/src/components/ContentFrame/Frame': 'default:Shell',
  '/src/components/guilds/GuildContextBar': 'default:None',
  '/src/components/export/ToplistExportController': 'default:ExportController',
  '/src/context/ToplistsDataContext': 'Forbidden as ToplistsProvider',
  '/src/components/ProfileOverlay/ProfileOverlay': 'default:Forbidden', '/src/components/ProfileOverlay/GuildProfileOverlay': 'default:Forbidden',
  '/src/lib/api/toplistsFirestore': 'getPlayerToplistSnapshotByDocIdCached',
  '/src/components/Filters/HudFilters': 'default:HudFilters',
};
const names = new Set([
  'Toplist', 'loadLocalToplistArchiveContext', 'resolveSelectedToplistEntries', 'resolveMonthlyToplistEntries',
  'loadOrBuildLocalToplistSnapshots', 'loadOrDeriveSnapshot', 'provide', 'buildCombinedSnapshot', 'composeMonthlySet',
  'acquireExplicitLocalFirstArchiveScans', 'importArchiveEntry', 'acquireArchiveEntry', 'defaultDownloadArchiveEntry',
  'createGuildHubLocalScanImportPreview', 'commitGuildHubLocalScanPreview', 'requireRawScan', 'detectRawScanPayload', 'buildLocalScanRecord',
  'normalizeGuildScanMembers', 'normalizeGuildHubLocalScanForDerivation', 'deriveGuildHubLogicalScanSnapshots', 'createGuildHubScanSummary',
  'getGuildHubLocalScan', 'persistScanNormalizationIfNeeded', 'findGuildHubLocalScanByArchiveBinding', 'findGuildHubLocalScanByArchiveScanId',
  'bindGuildHubLocalScanToArchiveEntry', 'prepareImportedHubSearch', 'prepareGuildHubSearchProjection', 'buildHubSearchProjectionCooperatively',
  'materializeGuildAnalyticsScan', 'materializeGuildAnalyticsSource', 'materializeSourceIntoDb', 'buildAndCommitSourceIntoDb', 'buildDerivedRecords',
  'getLocalToplistSnapshot', 'putLocalToplistSnapshot', 'validateLocalToplistSnapshot', 'getGuildHubLocalToplistSnapshotRecord', 'putGuildHubLocalToplistSnapshotRecord',
  'captureLocalDataDependencies', 'revalidateLocalDataDependencies', 'withLocalDataWrite', 'commitLocalDataMutation', 'readGuildHubLocalScanSourceValidity',
  'deriveLocalToplistSnapshotsInWorker', 'deriveLocalToplistsFromConfirmedScans', 'deriveLocalToplistSnapshot',
  'handleInit', 'handleView', 'handleSearch', 'buildSearchIndex', 'buildLocalPlayerToplistBaseCohort', 'buildLocalPlayerToplistView',
  'buildLocalToplistNameFilter', 'buildPlayerToplistDecorMap', 'localToplistContentRevision', 'toPublicPlayerRow',
  'setData', 'requestView', 'requestSearch', 'request', 'loadScanArchiveSearchIndexSet', 'runRequest', 'gunzipArrayBuffer', 'sha256Hex', 'validateScanArchivePayload',
  'compareLocalToplists', 'enrichLocalPlayerCompareRows', 'summarizeLocalPlayerCompareRows', 'buildLocalToplistComparisonSnapshotSet',
]);
export function performancePlugin(oldSource = ''): Plugin {
  return {
    name: 'w29-observe-real-calls', enforce: 'pre',
    resolveId(source, importer) {
      if (source.startsWith('https://sf-libs')) return '\0w29:coa';
      if (!importer || !source.startsWith('.')) return;
      if (importer.replace(/\\/g, '/').endsWith('/dataHubRuntimeAuditPerformance/boundaries.tsx') && source.endsWith('/Filters/HudFilters')) return;
      const resolved = path.resolve(path.dirname(importer), source).replace(/\\/g, '/').replace(/\.(tsx?|jsx?)$/, '');
      const key = Object.keys(aliases).find(key => resolved.endsWith(key));
      if (key) return '\0w29:' + key;
    },
    async load(id) {
      const clean = id.replace(/\\/g, '/').split('?')[0];
      if (oldSource && !id.startsWith('\0') && clean.includes('/src/')) return readFile(path.join(oldSource, 'src', clean.split('/src/')[1]), 'utf8');
      if (id === '\0w29:coa') return 'export class CoaRenderer {}';
      if (!id.startsWith('\0w29:')) return;
      const value = aliases[id.slice(5)];
      return value.startsWith('default:') ? `export { ${value.slice(8)} as default } from '${boundaries}';` : `export { ${value} } from '${boundaries}';`;
    },
    transform(original, id) {
      const clean = id.replace(/\\/g, '/').split('?')[0];
      if (!clean.includes('/src/')) return;
      let code = original.replace(/\r\n/g, '\n');
      // Observational publication markers, no copied arrays or overridden results.
      if (clean.endsWith('/pages/DataHub/Toplist.tsx')) {
        code = code.replace('setDataState({ result, datasetId, refresh: dataRefresh, loading: false, error: null });', '(globalThis as any).w29?.loaded(result); setDataState({ result, datasetId, refresh: dataRefresh, loading: false, error: null });');
        code = code.replace('  const currentViewResult =', '  (globalThis as any).w29 && ((globalThis as any).w29.activeContext = activeViewRequest?.contextKey); const currentViewResult =');
        code = code.replace('    const complete = (value: LocalToplistFocusTarget)', '(globalThis as any).w29?.ack(ack); const complete = (value: LocalToplistFocusTarget)');
      }
      if (clean.endsWith('/guilds/localScanLibrary.ts')) code = code.replace('const rawData = JSON.parse(content);', 'const rawData = (globalThis as any).__w29.call("JSON.parse.import", () => JSON.parse(content));');
      if (clean.endsWith('/workers/scanArchiveDownload.worker.ts')) code = code.replace('const payload = JSON.parse(content)', 'const payload = (globalThis as any).__w29.call("JSON.parse.download", () => JSON.parse(content))');
      if (clean.endsWith('/guilds/localScanLibrary.ts')) {
        code = code.replace('const scans = await db.getAll(SCAN_STORE);\n  const match = scans.find((scan) => scan.archiveSource?', '(globalThis as any).__w29.note("archive-lookup-route", {reason:"baseline-full-inventory"}); const scans = await db.getAll(SCAN_STORE);\n  const match = scans.find((scan) => scan.archiveSource?');
        code = code.replace('const scans = await scanStore.getAll();', '(globalThis as any).__w29.note("archive-lookup-route", {reason:!candidate ? "no-metadata-candidate" : !rawCandidate ? "candidate-raw-missing" : "candidate-raw-mismatch"}); const scans = await scanStore.getAll();');
        code = code.replace('const earlierKeys = await scanStore.getAllKeys', '(globalThis as any).__w29.note("archive-lookup-route", {reason:"verified-candidate-prefix-check"}); const earlierKeys = await scanStore.getAllKeys');
      }
      const source = ts.createSourceFile(clean, code, ts.ScriptTarget.Latest, true, clean.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const edits: {start: number; end: number; text: string}[] = [];
      function visit(node: ts.Node) {
        let name: string | undefined;
        if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name) name = node.name.getText(source);
        else if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && ts.isVariableDeclaration(node.parent)) name = node.parent.name.getText(source);
        if (name && names.has(name) && (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && node.body && ts.isBlock(node.body)) {
          const body = node.body;
          const async = !!node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword);
          const arg = node.parameters[0] && ts.isIdentifier(node.parameters[0].name) ? node.parameters[0].name.text : 'undefined';
          const label = clean.split('/src/')[1] + ':' + name;
          edits.push({ start: body.getStart(source)+1, end: body.getStart(source)+1, text: `const __w29Span = (globalThis as any).__w29.start(${JSON.stringify(label)}, ${async}, ${arg}); try {` });
          edits.push({ start: body.end-1, end: body.end-1, text: '} catch(__w29Error) { (globalThis as any).__w29.end(__w29Span, {thrown:true}); throw __w29Error; } (globalThis as any).__w29.end(__w29Span);' });
          function returns(child: ts.Node) {
            if (child !== body && ts.isFunctionLike(child)) return;
            if (ts.isReturnStatement(child)) {
              if (child.expression) {
                edits.push({start:child.expression.getStart(source),end:child.expression.getStart(source),text:'(globalThis as any).__w29.ret(__w29Span, ('});
                edits.push({start:child.expression.end,end:child.expression.end,text:'))'});
              } else edits.push({start:child.getStart(source),end:child.end,text:'return (globalThis as any).__w29.ret(__w29Span, undefined);'});
            }
            ts.forEachChild(child, returns);
          }
          returns(body);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
      edits.sort((a,b) => b.start-a.start || b.end-a.end);
      for (const e of edits) code = code.slice(0,e.start) + e.text + code.slice(e.end);
      // Every real Worker realm gets the same epoch-clock observer.
      if (clean.includes('/src/workers/')) code = `import '${observerURL}';\n` + code;
      return {code, map:null};
    },
  };
}
