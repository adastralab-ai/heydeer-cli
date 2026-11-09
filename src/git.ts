import { spawnSync } from 'node:child_process';

interface GitOptions {
  cwd: string;
  env?: Record<string, string>;
  input?: string;
}

function spawnGit(args: string[], { cwd, env, input }: GitOptions) {
  const result = spawnSync('git', args, {
    cwd,
    env: { ...process.env, ...env },
    input,
    maxBuffer: Infinity,
  });
  if (result.error) throw result.error;
  return result;
}

/** Runs git and returns its raw stdout, failing with git's own message. */
export function git(args: string[], options: GitOptions): Buffer {
  const result = spawnGit(args, options);
  if (result.status !== 0) {
    throw new Error(result.stderr.toString().trim() || `git ${args[0]} failed`);
  }
  return result.stdout;
}

/** Runs a git command that prints a single value. */
export function gitLine(args: string[], options: GitOptions): string {
  return git(args, options).toString().trim();
}

/** Like gitLine, but returns undefined when git exits non-zero or prints nothing. */
export function tryGitLine(args: string[], options: GitOptions): string | undefined {
  const result = spawnGit(args, options);
  return (result.status === 0 && result.stdout.toString().trim()) || undefined;
}
