import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(".");
const staging = resolve(".cloudflare-build");
if (existsSync(staging)) renameSync(staging, `/tmp/jev-static-build-${Date.now()}`);
mkdirSync(staging, { recursive: true });
execFileSync(process.execPath, ["scripts/generate-projects-data.ts"], { stdio: "inherit" });
const excluded = ["/app/admin", "/app/api", "/proxy.ts", "/worker.ts", "/__tests__", "/components/admin/LoginForm.tsx", "/components/admin/ChangePasswordForm.tsx"];
cpSync(resolve("src"), resolve(staging, "src"), { recursive: true, filter: path => !excluded.some(part => path.replaceAll("\\", "/").includes(part)) });
if (existsSync(resolve("public"))) cpSync(resolve("public"), resolve(staging, "public"), { recursive: true });
cpSync(resolve("tsconfig.json"), resolve(staging, "tsconfig.json"));
cpSync(resolve("package.json"), resolve(staging, "package.json"));
cpSync(resolve("postcss.config.ts"), resolve(staging, "postcss.config.ts"));
writeFileSync(resolve(staging, "next.config.ts"), `export default { output: "export", turbopack: { root: ${JSON.stringify(root)} } };\n`);
for (const path of ["page.tsx", "opengraph-image.tsx"]) {
  const file = resolve(staging, "src/app/p/[id]", path);
  writeFileSync(file, readFileSync(file, "utf8").replace("return [];", "return getProjects().map(project => ({ id: project.id }));"));
}
for (const path of ["icon.tsx", "apple-icon.tsx", "opengraph-image.tsx", "robots.ts", "sitemap.ts"]) {
  const file = resolve(staging, "src/app", path);
  if (existsSync(file)) writeFileSync(file, `export const dynamic = "force-static";\n${readFileSync(file, "utf8")}`);
}
for (const [path, section] of [["", "dashboard"], ["traffic", "traffic"], ["account", "account"]]) {
  mkdirSync(resolve(staging, "src/app/admin", path), { recursive: true });
  writeFileSync(resolve(staging, "src/app/admin", path, "page.tsx"), `import { AdminClient } from "@/components/admin/AdminClient";\nexport default function Page() { return <AdminClient section="${section}" />; }\n`);
}
writeFileSync(resolve(staging, "src/app/admin/layout.tsx"), `export const metadata = { robots: { index: false, follow: false } };\nexport default function Layout({children}: {children: React.ReactNode}) { return children; }\n`);
execFileSync(process.execPath, [resolve("node_modules/next/dist/bin/next"), "build", staging], { stdio: "inherit" });
