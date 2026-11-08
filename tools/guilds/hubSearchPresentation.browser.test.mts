import { artifactPath } from '../codex/workspace.mjs';
// Run the production route harness with actual downloaded renderer modules.
// Only the modules' asset base URLs are redirected to a controlled static cache.
process.env.SFDATAHUB_SEARCH_PRESENTATION='1';
process.env.SFDATAHUB_SEARCH_EVIDENCE ??= artifactPath('tmp/w24/visual');
await import('./hubSearch.browser.test.mts');
