import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findCredential, isCredentialFile } from './credentials.ts';
import { git, gitLine, tryGitLine } from './git.ts';

export const MAX_FILE_BYTES = 1024 * 1024;

const GITLINK_MODE = '160000';
const MISSING_OBJECT = '0'.repeat(40);

export interface ChangedFile {
  path: string;
  status: string;
  untracked: boolean;
  added: number;
  deleted: number;
}

export interface ExcludedFile {
  path: string;
  reason: string;
}

export interface Changes {
  repository: string;
  baseRef: string;
  mergeBase: string;
  head: string;
  branch: string | undefined;
  uncommitted: boolean;
  files: ChangedFile[];
  excluded: ExcludedFile[];
  patch: Buffer;
}

/**
 * Collects the current branch and working tree changes against the merge base with `base`
 * (origin's default branch when omitted). The merge base must already be on origin, so the
 * reviewer can fetch it from GitHub and only the patch has to leave this machine.
 */
export function collectChanges(cwd: string, base?: string): Changes {
  const root = gitLine(['rev-parse', '--show-toplevel'], { cwd });
  const options = { cwd: root };

  const repository = gitHubRepository(tryGitLine(['remote', 'get-url', 'origin'], options));
  const head = tryGitLine(['rev-parse', '--verify', '-q', 'HEAD'], options);
  if (!head) throw new Error('This repository has no commits yet.');
  const branch = tryGitLine(['symbolic-ref', '-q', '--short', 'HEAD'], options);

  const baseRef = base ?? defaultBranch(root);
  if (!tryGitLine(['rev-parse', '--verify', '-q', `${baseRef}^{commit}`], options)) {
    throw new Error(`Can't find ${baseRef}. Run \`git fetch origin\` or pass another --base.`);
  }
  const mergeBase = tryGitLine(['merge-base', baseRef, 'HEAD'], options);
  if (!mergeBase) throw new Error(`HEAD shares no history with ${baseRef}.`);
  const onOrigin = tryGitLine(
    ['for-each-ref', '--count=1', '--contains', mergeBase, 'refs/remotes/origin/'],
    options,
  );
  if (!onOrigin) {
    throw new Error(
      `The merge base with ${baseRef} (${mergeBase.slice(0, 8)}) isn't on origin. Push it, or pass a --base that is.`,
    );
  }

  const tree = snapshotWorkingTree(root);
  const uncommitted = tree !== gitLine(['rev-parse', 'HEAD^{tree}'], options);
  const untracked = new Set(
    splitNul(git(['ls-files', '-z', '--others', '--exclude-standard'], options)),
  );

  const candidates = diffEntries(root, mergeBase, tree);
  const excluded: ExcludedFile[] = [];
  const kept: typeof candidates = [];
  for (const entry of candidates) {
    const reason = exclusionReason(entry);
    if (reason) excluded.push({ path: entry.path, reason });
    else kept.push(entry);
  }

  const stanzas = splitPatch(
    git(
      [
        'diff-tree',
        '-r',
        '-p',
        '--no-renames',
        mergeBase,
        tree,
        '--',
        ...excluded.map(({ path }) => `:(exclude,top,literal)${path}`),
      ],
      options,
    ),
  );
  if (stanzas.length !== kept.length) {
    throw new Error(`Expected ${kept.length} file diffs from git, got ${stanzas.length}.`);
  }

  const files: ChangedFile[] = [];
  const patches: Buffer[] = [];
  kept.forEach((entry, index) => {
    const stanza = stanzas[index];
    const credential = findAddedCredential(stanza.toString());
    if (credential) {
      excluded.push({ path: entry.path, reason: credential });
      return;
    }
    files.push({
      path: entry.path,
      status: entry.status,
      untracked: untracked.has(entry.path),
      added: entry.added,
      deleted: entry.deleted,
    });
    patches.push(stanza);
  });

  return {
    repository,
    baseRef,
    mergeBase,
    head,
    branch,
    uncommitted,
    files,
    excluded: excluded.sort((a, b) => a.path.localeCompare(b.path)),
    patch: Buffer.concat(patches),
  };
}

function gitHubRepository(originUrl: string | undefined): string {
  if (!originUrl) throw new Error('This repository has no origin remote.');
  const match = originUrl.match(
    /^(?:https:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+\/[^/]+?)(?:\.git)?\/?$/,
  );
  if (!match) throw new Error(`origin (${originUrl}) isn't a GitHub repository.`);
  return match[1];
}

function defaultBranch(root: string): string {
  const options = { cwd: root };
  const originHead = tryGitLine(
    ['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD'],
    options,
  );
  if (originHead) return originHead;
  for (const ref of ['origin/main', 'origin/master']) {
    if (tryGitLine(['rev-parse', '--verify', '-q', `refs/remotes/${ref}`], options)) return ref;
  }
  throw new Error(
    "Can't find origin's default branch. Run `git remote set-head origin --auto` or pass --base.",
  );
}

/**
 * Writes the working tree, untracked files included, as a tree object. Staging into a copy of
 * the index leaves the user's staging area untouched while keeping git's stat cache, so
 * unchanged files aren't rehashed.
 */
function snapshotWorkingTree(root: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'heydeer-'));
  try {
    const index = join(dir, 'index');
    const realIndex = gitLine(['rev-parse', '--path-format=absolute', '--git-path', 'index'], {
      cwd: root,
    });
    if (existsSync(realIndex)) copyFileSync(realIndex, index);
    const options = { cwd: root, env: { GIT_INDEX_FILE: index } };
    git(['add', '--all'], options);
    return gitLine(['write-tree'], options);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

interface DiffEntry {
  path: string;
  status: string;
  added: number;
  deleted: number;
  binary: boolean;
  size: number;
}

function diffEntries(root: string, mergeBase: string, tree: string): DiffEntry[] {
  const options = { cwd: root };
  const diffArgs = ['diff-tree', '-r', '-z', '--no-renames', mergeBase, tree];
  const raw = splitNul(git([...diffArgs, '--no-abbrev'], options));
  const numstat = splitNul(git([...diffArgs, '--numstat'], options));

  const entries = numstat.map((line, index) => {
    const [, newMode, , newObject, status] = raw[index * 2].slice(1).split(' ');
    const [added, deleted, ...path] = line.split('\t');
    return {
      path: path.join('\t'),
      status,
      added: Number(added),
      deleted: Number(deleted),
      binary: added === '-',
      object: newMode === GITLINK_MODE || newObject === MISSING_OBJECT ? undefined : newObject,
      size: 0,
    };
  });

  const blobs = entries.filter((entry) => entry.object);
  if (blobs.length > 0) {
    const sizes = git(['cat-file', '--batch-check=%(objectsize)'], {
      ...options,
      input: blobs.map((entry) => entry.object).join('\n') + '\n',
    })
      .toString()
      .trim()
      .split('\n');
    blobs.forEach((entry, index) => (entry.size = Number(sizes[index])));
  }
  return entries;
}

function exclusionReason(entry: DiffEntry): string | undefined {
  if (entry.status === 'D') return undefined;
  if (isCredentialFile(entry.path)) return 'credential file';
  if (entry.binary) return 'binary';
  if (entry.size > MAX_FILE_BYTES) return `larger than ${MAX_FILE_BYTES / 1024 / 1024} MB`;
  return undefined;
}

/** Splits `diff-tree -p` output into one buffer per file. */
function splitPatch(patch: Buffer): Buffer[] {
  const stanzas: Buffer[] = [];
  const header = Buffer.from('\ndiff --git ');
  let start = 0;
  while (start < patch.length) {
    const next = patch.indexOf(header, start);
    const end = next === -1 ? patch.length : next + 1;
    stanzas.push(patch.subarray(start, end));
    start = end;
  }
  return stanzas;
}

/** Scans only added lines: everything else in the patch is already on GitHub. */
function findAddedCredential(stanza: string): string | undefined {
  let line = 0;
  for (const text of stanza.split('\n')) {
    const hunk = text.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunk) {
      line = Number(hunk[1]);
    } else if (line > 0 && text.startsWith('+')) {
      const credential = findCredential(text);
      if (credential) return `${credential} on line ${line}`;
      line++;
    } else if (line > 0 && text.startsWith(' ')) {
      line++;
    }
  }
  return undefined;
}

function splitNul(output: Buffer): string[] {
  return output.toString().split('\0').filter(Boolean);
}
