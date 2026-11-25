# HeyDeer CLI

Review your changes with [HeyDeer](https://heydeer.ai) from the terminal, before you open a pull request.

This repository hosts the CLI's release binaries.

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

## Usage

```sh
cd path/to/your/repository
heydeer review "Description of the changes and related issues e.g. issue #123."
```

Run `heydeer --help` for all commands and options, or see the
[CLI documentation](https://www.npmjs.com/package/heydeer).

## Uninstall

```sh
rm ~/.local/bin/heydeer
rm -r ~/.config/heydeer
```

The second line removes your saved sign-in.

## About HeyDeer

HeyDeer reviews pull requests on GitHub and posts its findings as comments. Learn more at
[heydeer.ai](https://heydeer.ai), or [contact us](https://heydeer.ai/contact) with questions.
