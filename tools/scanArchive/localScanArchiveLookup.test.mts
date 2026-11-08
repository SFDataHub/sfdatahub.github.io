import 'fake-indexeddb/auto';
import { runLookupChecks } from './fixtures/localScanArchiveLookup/checks.ts';
console.log(JSON.stringify(await runLookupChecks(), null, 2));
