import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache';

// Every page except /login and /logout renders per request, and nothing uses
// revalidation, so the few prerendered pages are served straight from the
// Worker's static assets. No R2 bucket or KV namespace to provision.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
