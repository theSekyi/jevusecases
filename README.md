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

## Sharing links

Add `?ref=` to a link you share (for example `https://www.jevusecases.com/?ref=newsletter`) and the admin traffic page can tell that source apart from others on the same site. Tags use letters, numbers, `-` and `_`, up to 40 characters.

## Contributing

Want to add a project to the site? See [CONTRIBUTING.md](CONTRIBUTING.md).
