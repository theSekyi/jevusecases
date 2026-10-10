import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import d1IncrementalCache from "./src/lib/d1IncrementalCache";

export default defineCloudflareConfig({ incrementalCache: d1IncrementalCache });
