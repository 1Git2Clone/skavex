# Contributing

## Where this repository lives

**[git.hu-tao.dev/skavex/skavex](https://git.hu-tao.dev/skavex/skavex) is the
repository.** It is a [Forgejo](https://forgejo.org/) instance, and it is where
the branches, issues, pull requests and CI runs are.

**GitHub, if you found this there, is a push-only mirror.** Its `main` is
overwritten by the next mirror push, so a commit made on the mirror does not
survive and a pull request merged there would be erased. Nothing on the mirror
is read back into this repository.

That does not make the mirror useless: it is a fine place to _show_ a patch, and
a branch you push there is not touched by mirroring. But the change has to be
applied here, so link it from an issue or a message rather than waiting for the
GitHub pull request to be merged.

## Reading without an account

Signing in is not required to read. Issues, pull requests, diffs, CI logs and
the Actions output are all visible anonymously, and the API answers anonymously
too:

```sh
B=https://git.hu-tao.dev/api/v1/repos/skavex/skavex
curl -s "$B/issues"                       # open issues and pull requests
curl -s "$B/actions/runs?limit=5"         # recent CI runs
curl -sL "$B/actions/jobs/<job-id>/logs"  # a run's full output
```

## Opening an issue or a pull request

**Registration on the instance is closed.** This is a personal server, not a
public forge, and leaving sign-ups open on it is not something worth
maintaining. So there is no self-service route to an account, and the honest
consequence is that you cannot open an issue or a pull request without one.

Two ways through, both of which work:

1. **Ask for an account.** Email <ivan@hu-tao.dev> with the username you want.
   This is the better route if you expect to send more than one change, or want
   to discuss something before writing it.
2. **Send a patch.** `git format-patch` against `main`, emailed to the same
   address. No account needed, and the commit keeps your authorship when it is
   applied.

Either way, say what the change is for. A patch with a reason attached is far
easier to act on than a diff.

## Working on the code

Everything comes from the flake, so the toolchain is the same one CI uses:

```sh
nix develop          # node, pnpm, the Playwright browsers, fonts, mdbook
pnpm install
nix develop -c pre-commit install --install-hooks -t pre-commit -t pre-push
```

The last line is worth running once per clone. `.pre-commit-config.yaml` is the
same file CI runs, so anything it catches locally is something that would have
failed the build — formatting, lint, a leaked credential on commit; typecheck
and unit tests on push.

Without Nix you will need Node 22.12 or newer and pnpm, plus Playwright's
browsers and mdbook if you intend to run those parts.

| Command               | What it does                                              |
| --------------------- | --------------------------------------------------------- |
| `pnpm lint`           | Prettier and ESLint                                       |
| `pnpm check`          | Three typecheck passes: `src`, everything else, `.svelte` |
| `pnpm test`           | Unit tests                                                |
| `pnpm test:coverage`  | Unit tests with the coverage gate                         |
| `pnpm test:e2e`       | Playwright, against a production build of the playground  |
| `pnpm bench`          | Build-time and Lighthouse benchmarks                      |
| `pnpm bench:isolated` | The same, pinned to dedicated cores                       |
| `pnpm demo`           | The playground, on a dev server                           |
| `pnpm docs`           | The book, with live reload                                |

CI runs the pre-commit hooks, then `check`, `test:coverage`, `test:e2e`,
`bench:check`, the docs build and `nix flake check`. There is no separate lint
step: prettier and eslint run as hooks, from the same file your commit hook
uses, so the two lists cannot drift.

## What the checks expect

- **No `any`.** `jsdoc/reject-any-type` is on across source, tests, benchmarks
  and components. The types are the JSDoc; there is no separate declaration to
  drift from it.
- **A cast is an assertion that the compiler is wrong.** `/** @type {X} */ (…)`
  around something that might be `null` hides a bug rather than narrowing one.
  Check the value and say what went wrong instead.
- **A benchmark number is a measurement.** If a run cannot measure something it
  prints `n/a`, not a zero. See [BENCHMARKS.md](BENCHMARKS.md) for what is
  gated and why some things deliberately are not.
- **Comments explain why.** The repository is heavy on them where a decision is
  not obvious from the code, and light where it is.

## Commits

Conventional commits — `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `perf:`,
`refactor:`. No scopes; this repository has not used them.

The body matters more than the subject. What was wrong, what it now does, and
how you know — a commit that says how a fix was verified is worth several that
say what was changed.
