# jevusecases

What people are actually shipping with [Jev](https://typesafe.ai) (TypeSafe AI's decision model), tracked as they ship. Live at [jevusecases.com](https://jevusecases.com).

A directory of real projects, filtered by what they replace, whether they've been benchmarked, and whether there's code to copy — not a marketing site for Jev itself.

## Stack

Next.js (App Router) + TypeScript + Tailwind, tested with Vitest + React Testing Library, deployed on Vercel.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm test           # run tests
npm run lint        # lint
npx tsc --noEmit    # typecheck
```

## Contributing

`main` is protected. Every PR runs CI (typecheck, lint, test) and has to pass before it can merge.
