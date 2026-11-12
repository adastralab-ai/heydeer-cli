import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { findApiKey } from './api-key.ts';

/** The HeyDeer site the CLI talks to. */
export function heydeerUrl(): string {
  return (process.env.HEYDEER_URL?.trim() || 'https://heydeer.ai').replace(/\/+$/, '');
}

/** A sign-in saved by `heydeer login`. Only the HeyDeer token is kept, never GitHub's. */
type SavedSession = { url: string; token: string; login: string };

function credentialsPath(): string {
  const base =
    process.platform === 'win32'
      ? process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
      : process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'heydeer', 'credentials.json');
}

function readSession(): SavedSession | undefined {
  let saved: unknown;
  try {
    saved = JSON.parse(readFileSync(credentialsPath(), 'utf8'));
  } catch {
    return undefined;
  }
  const session = saved as Partial<SavedSession>;
  if (
    typeof session?.url !== 'string' ||
    typeof session.token !== 'string' ||
    typeof session.login !== 'string'
  )
    return undefined;
  return session as SavedSession;
}

function saveSession(session: SavedSession) {
  const path = credentialsPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(session, null, 2) + '\n', { mode: 0o600 });
  // The mode applies only when the file is created; tighten one that existed.
  chmodSync(path, 0o600);
}

/** How the CLI authenticates: `HEYDEER_API_KEY` first, then a saved sign-in for this site. */
export type Credential =
  | { kind: 'api-key'; token: string }
  | { kind: 'session'; token: string; login: string };

export function resolveCredential(): Credential | undefined {
  const key = findApiKey();
  if (key) return { kind: 'api-key', token: key };
  const session = readSession();
  if (session && session.url === heydeerUrl())
    return { kind: 'session', token: session.token, login: session.login };
  return undefined;
}

type ErrorBody = { error?: string; code?: string };

async function heydeer<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: T }> {
  const res = await fetch(heydeerUrl() + path, {
    ...init,
    headers: { Accept: 'application/json', ...init.headers },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`HeyDeer answered ${res.status} with something other than JSON.`);
  }
  return { status: res.status, body: body as T };
}

function failure(body: ErrorBody, fallback: string): Error {
  return new Error(body.error || fallback);
}

type DeviceCode = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
};
type DeviceToken =
  | { status: 'pending'; interval: number }
  | { status: 'slow_down'; interval: number }
  | { status: 'denied' }
  | { status: 'expired' }
  | { status: 'approved'; token: string; session: { user: { login: string } } };

/**
 * Signs in with a code the person enters on HeyDeer's site, signed in there as
 * usual (with GitHub, which also creates their account). The CLI never sees a
 * GitHub credential; it keeps only the HeyDeer token it gets back.
 */
export async function login(log: (line: string) => void): Promise<string> {
  const started = await heydeer<DeviceCode & ErrorBody>('/api/v1/cli/device', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: hostname() || 'unknown computer' }),
  });
  if (started.status !== 201 || !started.body.deviceCode)
    throw failure(started.body, `Couldn't reach HeyDeer at ${heydeerUrl()}.`);
  const device = started.body;
  log(`Open ${device.verificationUri} and enter the code ${device.userCode}`);
  log('Waiting for you to allow the sign-in…');

  let interval = Math.max(device.interval, 1) * 1000;
  const deadline = Date.now() + device.expiresIn * 1000;
  while (Date.now() < deadline) {
    await sleep(interval);
    const answer = await heydeer<DeviceToken & ErrorBody>('/api/v1/cli/device/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceCode: device.deviceCode }),
    });
    if (answer.status !== 200) throw failure(answer.body, `HeyDeer answered ${answer.status}.`);
    const result = answer.body;
    if (result.status === 'pending') continue;
    if (result.status === 'slow_down') {
      interval = (result.interval + 5) * 1000;
      continue;
    }
    if (result.status === 'denied') throw new Error('The sign-in was denied.');
    if (result.status === 'expired') break;
    saveSession({ url: heydeerUrl(), token: result.token, login: result.session.user.login });
    return result.session.user.login;
  }
  throw new Error('The code expired. Run heydeer login again.');
}

/** Ends the saved sign-in on HeyDeer and removes it from this computer. */
export async function logout(): Promise<boolean> {
  const session = readSession();
  if (!session) return false;
  if (session.url === heydeerUrl()) {
    const res = await heydeer<ErrorBody>('/api/v1/cli/sessions/current', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.token}` },
    });
    // An ended session needs no revoking; anything else must not leave it valid.
    if (res.status !== 204 && res.status !== 401)
      throw failure(res.body, `HeyDeer couldn't end the sign-in (${res.status}).`);
  }
  rmSync(credentialsPath(), { force: true });
  return true;
}

export type Status =
  | { kind: 'api-key'; prefix: string }
  | { kind: 'session'; login: string; name: string; expiresAt: string }
  | { kind: 'signed-out'; reason?: string };

/** Who the CLI acts as, checked with HeyDeer for a saved sign-in. */
export async function status(): Promise<Status> {
  const credential = resolveCredential();
  if (!credential) return { kind: 'signed-out' };
  if (credential.kind === 'api-key')
    return { kind: 'api-key', prefix: credential.token.slice(0, 12) };
  const res = await heydeer<
    { name?: string; expiresAt?: string; user?: { login?: string } } & ErrorBody
  >('/api/v1/cli/sessions/current', { headers: { Authorization: `Bearer ${credential.token}` } });
  if (res.status === 401) return { kind: 'signed-out', reason: res.body.error };
  if (res.status !== 200) throw failure(res.body, `HeyDeer answered ${res.status}.`);
  return {
    kind: 'session',
    login: res.body.user?.login ?? credential.login,
    name: res.body.name ?? '',
    expiresAt: res.body.expiresAt ?? '',
  };
}
