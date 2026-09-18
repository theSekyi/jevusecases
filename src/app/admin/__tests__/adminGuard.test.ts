import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ADMIN_DIR = join(process.cwd(), "src/app/admin");

// Public on purpose: the login page has to be reachable while signed out, and it redirects the
// other way when someone is already signed in.
const PUBLIC_PAGES = new Set(["login/page.tsx"]);

function files(dir: string, prefix = ""): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    return statSync(path).isDirectory() && name !== "__tests__" ? files(path, relative) : [relative];
  });
}

describe("admin route guard", () => {
  const all = files(ADMIN_DIR);

  test("every admin page checks for a signed-in admin itself, since layouts don't re-run on navigation", () => {
    const pages = all.filter((file) => /(^|\/)page\.tsx$/.test(file) && !PUBLIC_PAGES.has(file));

    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      expect(readFileSync(join(ADMIN_DIR, page), "utf8"), page).toMatch(/await requireAdmin\(\)/);
    }
  });

  test("every admin Server Action except login and logout requires a signed-in admin first", () => {
    const source = readFileSync(join(ADMIN_DIR, "actions.ts"), "utf8");
    const bodies = source.split(/^export async function /m).slice(1);

    const guarded = bodies.filter((body) => !/^(login|logout)\b/.test(body));
    expect(guarded.length).toBeGreaterThan(0);
    for (const body of guarded) {
      const name = body.match(/^\w+/)![0];
      const firstStatement = body.slice(body.indexOf("{") + 1).trimStart();
      expect(firstStatement, name).toMatch(/^const admin = await requireAdmin\(\);/);
    }
  });

  test("no admin route handler exists that could bypass the page and action checks", () => {
    expect(all.filter((file) => /(^|\/)route\.ts$/.test(file))).toEqual([]);
  });
});
