# HeyDeer CLI

Reviews local changes with HeyDeer before a pull request exists.

```sh
cd path/to/your/repository
node path/to/heydeer-cli/src/cli.ts review [--base <ref>] [--include-untracked]
```

A review covers the current branch plus uncommitted changes to tracked files, against the merge
base with origin's default branch. Untracked files are left out unless you pass `--include-untracked`;
gitignored files are always left out. `origin` must be a GitHub repository and the merge
base must already be on it. Uploading isn't built yet: the command prints what it would send and
which files it would keep on the machine.

## Signing in

```sh
heydeer login    # sign in to HeyDeer
heydeer status   # who the CLI acts as
heydeer logout   # end the sign-in on this computer
```

`heydeer login` prints a link and a code: open the link, sign in to HeyDeer (with GitHub, which
also creates your account), enter the code and allow the sign-in. Reviews then work in any
repository HeyDeer is installed on where you have write access.

The CLI never sees your GitHub credentials. It keeps only a HeyDeer token, in `~/.config/heydeer/credentials.json`
(`%APPDATA%\heydeer` on Windows), readable only by you. It lasts 90 days after its last use.

For automation, set `HEYDEER_API_KEY` to a workspace review API key (`hdk_…`) instead; it
takes precedence over a sign-in. `HEYDEER_URL` points the CLI at another HeyDeer site.

Requires Node.js 22.18 or later, which runs the TypeScript sources directly.

## Development

```sh
pnpm install
pnpm typecheck
pnpm format
pnpm build      # single executable at dist/heydeer
```
