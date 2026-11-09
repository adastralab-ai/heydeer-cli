# HeyDeer CLI

Reviews local changes with HeyDeer before a pull request exists.

```sh
cd path/to/your/repository
node path/to/heydeer-cli/src/cli.ts review [--base <ref>] [--untracked]
```

A review covers the current branch plus uncommitted changes to tracked files, against the merge
base with origin's default branch. Untracked files are left out unless you pass `--untracked`;
gitignored files are always left out. `origin` must be a GitHub repository and the merge
base must already be on it. Uploading isn't built yet: the command prints what it would send and
which files it would keep on the machine.

Requires Node.js 22.18 or later, which runs the TypeScript sources directly.

## Development

```sh
pnpm install
pnpm typecheck
pnpm format
pnpm build      # single executable at dist/heydeer
```
