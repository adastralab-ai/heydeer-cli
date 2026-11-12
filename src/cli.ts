#!/usr/bin/env node
import { parseArgs, styleText } from 'node:util';
import { login, logout, resolveCredential, status, type Credential } from './auth.ts';
import { collectChanges, type Changes } from './changes.ts';

const USAGE = `Usage: heydeer <command>

Commands:
  review [--base <ref>] [--include-untracked]
                       Review the current branch and uncommitted changes to
                       tracked files against the merge base with origin's
                       default branch
  login                Sign in with GitHub
  logout               Sign out on this computer
  status               Show who the CLI acts as

Options:
  --base <ref>         Branch or commit to compare against
  --include-untracked  Also review untracked files that aren't gitignored
  -h, --help           Show this help

Environment:
  HEYDEER_API_KEY      A workspace review API key (hdk_…), used instead of
                       a sign-in, for automation
  HEYDEER_URL          The HeyDeer site, https://heydeer.ai by default`;

async function main(): Promise<number> {
  let args;
  try {
    args = parseArgs({
      allowPositionals: true,
      options: {
        base: { type: 'string' },
        'include-untracked': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (error) {
    console.error(`${(error as Error).message}\n\n${USAGE}`);
    return 2;
  }
  if (args.values.help) {
    console.log(USAGE);
    return 0;
  }
  const command = args.positionals.length === 1 ? args.positionals[0] : undefined;
  if (!command || !['review', 'login', 'logout', 'status'].includes(command)) {
    console.error(USAGE);
    return 2;
  }

  try {
    if (command === 'login') {
      const user = await login((line) => console.log(line));
      console.log(`Signed in to HeyDeer as ${user}.`);
      return 0;
    }
    if (command === 'logout') {
      console.log((await logout()) ? 'Signed out.' : 'Not signed in.');
      return 0;
    }
    if (command === 'status') return await printStatus();
    const credential = resolveCredential();
    printSummary(
      collectChanges(process.cwd(), {
        base: args.values.base,
        includeUntracked: args.values['include-untracked'],
      }),
      credential,
    );
    return 0;
  } catch (error) {
    console.error(styleText('red', (error as Error).message));
    return 1;
  }
}

async function printStatus(): Promise<number> {
  const current = await status();
  if (current.kind === 'api-key') {
    console.log(`Using the API key ${current.prefix}… from HEYDEER_API_KEY.`);
    return 0;
  }
  if (current.kind === 'session') {
    const until = current.expiresAt ? `, until ${current.expiresAt.slice(0, 10)} unless used` : '';
    console.log(`Signed in as ${current.login} on ${current.name}${until}.`);
    return 0;
  }
  console.log(current.reason ?? 'Not signed in. Run heydeer login.');
  return 1;
}

function describeCredential(credential: Credential | undefined): string {
  if (!credential) return 'not signed in; run heydeer login';
  if (credential.kind === 'api-key')
    return `${credential.token.slice(0, 12)}… from HEYDEER_API_KEY`;
  return `signed in as ${credential.login}`;
}

function printSummary(changes: Changes, credential: Credential | undefined) {
  const head = [changes.branch, `at ${changes.head.slice(0, 8)}`].filter(Boolean).join(' ');
  console.log(`${styleText('dim', 'Repository')}  ${changes.repository}`);
  console.log(
    `${styleText('dim', 'Base      ')}  ${changes.baseRef}, merge base ${changes.mergeBase.slice(0, 8)}`,
  );
  console.log(
    `${styleText('dim', 'Head      ')}  ${head}${changes.uncommitted ? ', with uncommitted changes' : ''}`,
  );
  console.log(`${styleText('dim', 'HeyDeer   ')}  ${describeCredential(credential)}`);
  console.log();

  if (changes.files.length === 0 && changes.excluded.length === 0) {
    console.log(`No changes against ${changes.baseRef}.`);
    printSkippedUntracked(changes);
    return;
  }

  const width = Math.max(...[...changes.files, ...changes.excluded].map(({ path }) => path.length));
  const added = changes.files.reduce((sum, file) => sum + file.added, 0);
  const deleted = changes.files.reduce((sum, file) => sum + file.deleted, 0);
  console.log(
    `Would send ${plural(changes.files.length, 'file')} (+${added} −${deleted}), ${formatBytes(changes.patch.length)}`,
  );
  for (const file of changes.files) {
    const counts = `${styleText('green', `+${file.added}`.padStart(6))} ${styleText('red', `−${file.deleted}`.padStart(6))}`;
    const untracked = file.untracked ? styleText('dim', '  untracked') : '';
    console.log(`  ${file.status}  ${file.path.padEnd(width)}  ${counts}${untracked}`);
  }

  if (changes.excluded.length > 0) {
    console.log();
    console.log(`Left on this machine: ${plural(changes.excluded.length, 'file')}`);
    for (const file of changes.excluded) {
      console.log(`     ${file.path.padEnd(width)}  ${styleText('dim', file.reason)}`);
    }
  }
  printSkippedUntracked(changes);
}

function printSkippedUntracked(changes: Changes) {
  const count = changes.skippedUntracked.length;
  if (count === 0) return;
  console.log();
  console.log(
    styleText(
      'dim',
      `Skipped ${plural(count, 'untracked file')}. Pass --include-untracked to review ${count === 1 ? 'it' : 'them'}.`,
    ),
  );
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

process.exitCode = await main();
