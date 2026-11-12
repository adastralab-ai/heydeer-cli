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
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
};
type AccessToken = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
  interval?: number;
};

async function github<T>(path: string, body: Record<string, string>): Promise<T> {
  const res = await fetch('https://github.com' + path, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status} to ${path}.`);
  return (await res.json()) as T;
}

/**
 * Signs in with GitHub's device flow, using HeyDeer's GitHub App. The person
 * approves on github.com, which also creates their HeyDeer account. HeyDeer
 * swaps the GitHub token for its own once; only that one is saved.
 */
export async function login(log: (line: string) => void): Promise<string> {
  const config = await heydeer<{ github?: { clientId?: string } } & ErrorBody>(
    '/api/v1/cli/config',
  );
  const clientId = config.body.github?.clientId;
  if (config.status !== 200 || !clientId)
    throw failure(config.body, `Couldn't reach HeyDeer at ${heydeerUrl()}.`);

  const device = await github<DeviceCode & { error?: string; error_description?: string }>(
    '/login/device/code',
    { client_id: clientId },
  );
  if (device.error) throw new Error(device.error_description || `GitHub refused: ${device.error}.`);
  log(`Open ${device.verification_uri} and enter the code ${device.user_code}`);
  log('Waiting for you to approve HeyDeer on GitHub…');

  let interval = Math.max(device.interval, 1) * 1000;
  const deadline = Date.now() + device.expires_in * 1000;
  let token: AccessToken | undefined;
  while (Date.now() < deadline) {
    await sleep(interval);
    const answer = await github<AccessToken>('/login/oauth/access_token', {
      client_id: clientId,
      device_code: device.device_code,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
    if (answer.access_token) {
      token = answer;
      break;
    }
    if (answer.error === 'authorization_pending') continue;
    if (answer.error === 'slow_down') {
      interval = (answer.interval ?? interval / 1000 + 5) * 1000;
      continue;
    }
    if (answer.error === 'access_denied') throw new Error('Sign-in was canceled on GitHub.');
    if (answer.error === 'expired_token') break;
    throw new Error(answer.error_description || `GitHub refused the sign-in: ${answer.error}.`);
  }
  if (!token?.access_token) throw new Error('The code expired. Run heydeer login again.');

  const created = await heydeer<{ token?: string; user?: { login?: string } } & ErrorBody>(
    '/api/v1/cli/sessions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        github: {
          accessToken: token.access_token,
          ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
          ...(token.expires_in ? { expiresIn: token.expires_in } : {}),
        },
        name: hostname() || 'unknown computer',
      }),
    },
  );
  const login = created.body.user?.login;
  if (created.status !== 201 || !created.body.token || !login)
    throw failure(created.body, `HeyDeer couldn't sign you in (${created.status}).`);
  saveSession({ url: heydeerUrl(), token: created.body.token, login });
  return login;
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
