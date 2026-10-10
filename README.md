# jevusecases

What people are actually shipping with [Jev](https://typesafe.ai) (TypeSafe AI's decision model), tracked as they ship. Live at [jevusecases.com](https://jevusecases.com).

A directory of real projects, filtered by what they replace, whether they've been benchmarked, and whether there's code to copy — not a marketing site for Jev itself.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The data the site renders (`src/data/projects.json`) is generated from `src/data/entries/*/entry.json` automatically before `dev`/`build`/`test` — it's gitignored, so there's nothing to keep in sync by hand. See [CONTRIBUTING.md](CONTRIBUTING.md) to add an entry.

```bash
npm test           # run tests
npm run lint        # lint
npx tsc --noEmit    # typecheck
```

## Cloudflare migration

Cloudflare serves a static export of the public Next.js site. A small Worker handles admin identity, analytics and submissions. D1 stores analytics and the admin allowlist. Production runs on Cloudflare at `www.jevusecases.com`; apex redirects to that hostname. Vercel and Neon are retained as a frozen rollback origin during the retirement window.

```bash
npm run cf:build                  # Export public pages and share images
npm run cf:preview                # Run the Worker and assets locally
npm run cf:deploy:preview         # Deploy the prepared preview
npm run db:migrate:preview        # Apply preview D1 schema changes
npm run admin:d1 -- lookup <IP> preview
```

The build generates `.cloudflare-build/out` and `src/data/worker-projects.json`. Both are ignored. The original Next.js server remains available for the rollback period.

Preview excludes analytics writes and disables submissions. It uses an isolated D1 database. Production uses `wrangler.production.jsonc` with writes and submissions enabled. Production workers.dev is disabled; zone routes serve both public hostnames.

Admin access requires a signed Cloudflare Access token and an active D1 admin record on every request. Configure `ACCESS_ISSUER` and `ACCESS_AUD` for the Access application. Protect both `/admin` and `/api/admin`; direct Worker requests without a valid token fail closed. `/admin/login` redirects an authenticated administrator to `/admin`. Access handles email codes and logout.

Set `VISITOR_HASH_SECRET` and `GITHUB_SUBMIT_TOKEN` through Wrangler secrets. Preserve the existing visitor secret during migration so historical hashes remain consistent. Keep production credentials outside the repository and build directory.

```bash
npm run admin:d1 -- invite <email> production
npm run admin:d1 -- revoke <email> production
npm run admin:d1 -- delete-visitor <IP> production
```

An invitation also needs an explicit matching Access policy. Revocation takes effect at the next allowlist check and deletes legacy sessions.

The deployment workflow runs validation, builds assets, applies D1 migrations and deploys the selected environment. Configure a scoped `CLOUDFLARE_API_TOKEN` in each GitHub environment before using it. The workflow is prepared for main-branch production deployments and manual preview or production deployments, but it is not operational until a deployment credential is configured. No deployment credential is stored in GitHub while the owner decides between local deployment and GitHub environment secrets.

`scripts/migration-data.ts` snapshots Neon in a consistent transaction, converts timestamps to UTC epoch microseconds, and checks per-table record hashes after import. `scripts/restore-neon.ts` reconciles D1 updates and deletions in a PostgreSQL transaction and revokes old sessions. Run rollback only while both hosts have writes disabled.

Cutover was verified at 2026-10-08T10:22:47Z. Retain the old Vercel deployment and Neon data until at least 2026-10-15T10:22:47Z. Delete only resources with confirmed JEV ownership.

## Sharing links

Add `?ref=` to a link you share (for example `https://www.jevusecases.com/?ref=newsletter`) and the admin traffic page can tell that source apart from others on the same site. Tags use letters, numbers, `-` and `_`, up to 40 characters.

## Contributing

Want to add a project to the site? See [CONTRIBUTING.md](CONTRIBUTING.md).
