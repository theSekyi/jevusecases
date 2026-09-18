import { main } from "./scripts/generate-projects-data";

// Regenerates src/data/projects.json before the test run starts, so tests work no matter how
// vitest was invoked (npm test, a direct `vitest` call, an IDE test runner) — not just when
// npm's pretest hook happened to fire first.
export default function setup() {
  main();
}
