#!/usr/bin/env node
import { parseArgs, styleText } from 'node:util';
import { collectChanges, type Changes } from './changes.ts';

const USAGE = `Usage: heydeer review [--base <ref>] [--untracked]

Reviews the current branch and uncommitted changes to tracked files against
the merge base with origin's default branch.

Options:
  --base <ref>  Branch or commit to compare against
  --untracked   Also review untracked files that aren't gitignored
  -h, --help    Show this help`;

function main(): number {
  let args;
  try {
    args = parseArgs({
      allowPositionals: true,
      options: {
        base: { type: 'string' },
        untracked: { type: 'boolean' },
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
  if (args.positionals.length !== 1 || args.positionals[0] !== 'review') {
    console.error(USAGE);
    return 2;
  }

  try {
    printSummary(
      collectChanges(process.cwd(), {
        base: args.values.base,
        includeUntracked: args.values.untracked,
      }),
    );
    return 0;
  } catch (error) {
    console.error(styleText('red', (error as Error).message));
    return 1;
  }
}

function printSummary(changes: Changes) {
  const head = [changes.branch, `at ${changes.head.slice(0, 8)}`].filter(Boolean).join(' ');
  console.log(`${styleText('dim', 'Repository')}  ${changes.repository}`);
  console.log(
    `${styleText('dim', 'Base      ')}  ${changes.baseRef}, merge base ${changes.mergeBase.slice(0, 8)}`,
  );
  console.log(
    `${styleText('dim', 'Head      ')}  ${head}${changes.uncommitted ? ', with uncommitted changes' : ''}`,
  );
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
      `Skipped ${plural(count, 'untracked file')}. Pass --untracked to review ${count === 1 ? 'it' : 'them'}.`,
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

process.exitCode = main();
