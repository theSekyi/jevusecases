# Contributing a use case

This site tracks real projects people have built with [Jev](https://typesafe.ai). A "use case" entry is one specific project: something someone actually shipped, with a real description of how it calls Jev. Not a marketing claim, not a plan — something that exists.

There are two ways to add one.

## The form (fastest)

Go to [jevusecases.com/submit](https://jevusecases.com/submit) and fill it in. It opens a pull request here automatically with your entry. You don't need to touch this repo directly.

## Open a pull request by hand

Use this path if you'd rather fill in more of the researched fields yourself (a benchmark number, a `replaces` verdict), or you just prefer working in a PR over a form.

1. Fork this repo.
2. Copy [`TEMPLATE.jsonc`](TEMPLATE.jsonc). It's one fully-annotated example entry — every field explained inline, with the `//` comments stripped before it goes into real JSON.
3. Fill in your own values. Only fill in what you can honestly say is true — leave everything else `null`. An entry with most fields `null` is normal; that's what a freshly-added, not-yet-researched entry looks like, not something to apologize for.
4. Save it as `src/data/entries/<your-id>/entry.json`, where `<your-id>` matches the `id` field you filled in (e.g. `src/data/entries/yourhandle-your-project/entry.json`). Every entry gets its own folder — this is a new file, not an edit to an existing one, so your PR can't conflict with anyone else's.
5. Open a pull request against `main`.

## What happens after you open a PR

Every submission — form or manual — is reviewed by hand before it merges. Nothing goes live automatically. CI runs typecheck, lint, and tests on every PR; they need to pass before a maintainer will look at merging it. A reviewer may fill in more of the researched fields (`benchmark`, `replaces`, `security_status`) before merging, the same way the first entries in this dataset were built up.
