import type { IncrementalCache } from "@opennextjs/aws/types/overrides.js";
import staticAssetsCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";
import { databaseBinding } from "./cloudflare";

const cacheKey = (key: string, type?: string) => `${process.env.OPEN_NEXT_BUILD_ID}/${type ?? "route"}/${key}`;

// Build assets hold prerendered pages. D1 retains on-demand project pages across isolates.
const cache: IncrementalCache = {
  name: "jev-d1-incremental-cache",
  async get(key, type) {
    const { results } = await databaseBinding().prepare("SELECT value,modified_at FROM incremental_cache WHERE cache_key = ?")
      .bind(cacheKey(key, type)).all<{ value: string; modified_at: number }>();
    if (results[0]) return { value: JSON.parse(results[0].value), lastModified: results[0].modified_at };
    return staticAssetsCache.get(key, type);
  },
  async set(key, value, type) {
    await databaseBinding().prepare(`INSERT INTO incremental_cache(cache_key,value,modified_at) VALUES (?,?,?)
      ON CONFLICT(cache_key) DO UPDATE SET value=excluded.value,modified_at=excluded.modified_at`)
      .bind(cacheKey(key, type), JSON.stringify(value), Date.now()).run();
  },
  async delete(key) {
    await databaseBinding().prepare("DELETE FROM incremental_cache WHERE cache_key LIKE ?")
      .bind(`${process.env.OPEN_NEXT_BUILD_ID}/%/${key}`).run();
  },
};
export default cache;
