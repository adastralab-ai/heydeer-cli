# HeyDeer CLI

Review your changes with [HeyDeer](https://heydeer.ai) from the terminal, before you open a pull request.

This repository hosts the CLI's release binaries and skills that teach coding agents to work with HeyDeer.

## Install

On macOS and Linux:

```sh
curl -fsSL https://heydeer.ai/install.sh | sh
heydeer login
```

The script installs the latest release to `~/.local/bin/heydeer`. Run it again to update.

On Windows, or anywhere with Node.js 22 or later:

```sh
npm install -g heydeer
heydeer login
```

### Manual install

Download the archive for your platform from the [latest release](https://github.com/adastralab-ai/heydeer-cli/releases/latest), check it against `SHA256SUMS`, and put the `heydeer` binary on your `PATH`.

| Platform                        | Archive                           |
| ------------------------------- | --------------------------------- |
| macOS, Apple silicon            | `heydeer-darwin-arm64.tar.gz`     |
| macOS, Intel                    | `heydeer-darwin-x64.tar.gz`       |
| Linux, x64                      | `heydeer-linux-x64.tar.gz`        |
| Linux, arm64                    | `heydeer-linux-arm64.tar.gz`      |
| Alpine and other musl, x64      | `heydeer-linux-x64-musl.tar.gz`   |
| Alpine and other musl, arm64    | `heydeer-linux-arm64-musl.tar.gz` |

On Alpine, install `libgcc` and `libstdc++` first: `apk add libgcc libstdc++`.

## Usage

```sh
cd path/to/your/repository
heydeer review "Description of the changes and related issues e.g. issue #123."
```

Run `heydeer --help` for all commands and options, or see the
[CLI documentation](https://www.npmjs.com/package/heydeer).

## Use with coding agents

The [`heydeer` skill](skills/heydeer/SKILL.md) teaches your coding agent to
review its changes with HeyDeer before it pushes, fix the findings and review
again, then work through HeyDeer's review once the pull request is open.

### Claude Code

```
/plugin marketplace add adastralab-ai/heydeer-cli
/plugin install heydeer@heydeer
```

### Codex

```sh
codex plugin marketplace add adastralab-ai/heydeer-cli
codex plugin add heydeer@heydeer
```

### Cursor and other agents

For Cursor or any other agent that supports [Agent Skills](https://agentskills.io):

```sh
npx skills add adastralab-ai/heydeer-cli
```

## Uninstall

```sh
rm ~/.local/bin/heydeer
rm -r ~/.config/heydeer
```

The second line removes your saved sign-in.

## License

The skills and other files in this repository are available under the [MIT License](LICENSE),
except the HeyDeer name and logo, including `assets/icon.svg`. See the
[brand guidelines](https://heydeer.ai/brand) for how to refer to HeyDeer.

## About HeyDeer

HeyDeer reviews pull requests on GitHub and posts its findings as comments. Learn more at
[heydeer.ai](https://heydeer.ai), or [contact us](https://heydeer.ai/contact) with questions.
