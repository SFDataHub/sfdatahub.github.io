import { runLookupChecks } from './checks';
(globalThis as any).lookupChecks = runLookupChecks().then(result => ({ result }), error => ({ error: error.stack }));
