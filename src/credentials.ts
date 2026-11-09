import { basename } from 'node:path';

const CREDENTIAL_FILE_NAMES = [
  /^\.env(\..+)?$/,
  /^\.netrc$/,
  /^id_(rsa|dsa|ecdsa|ed25519)$/,
  /\.(pem|key|p12|pfx|jks|keystore|tfvars)$/,
];

// Templates of credential files hold placeholders, and reviewing them is useful.
const TEMPLATE_SUFFIX = /\.(example|sample|template)$/;

const CREDENTIAL_PATTERNS: [name: string, pattern: RegExp][] = [
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['AWS access key', /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{80,})/],
  ['Slack token', /\bxox[abposr]-[A-Za-z0-9-]{10,}/],
  ['Stripe secret key', /\b[rs]k_live_[A-Za-z0-9]{20,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Anthropic API key', /\bsk-ant-[A-Za-z0-9_-]{32,}/],
  ['OpenAI API key', /\bsk-(proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}/],
];

export function isCredentialFile(path: string): boolean {
  const name = basename(path);
  return !TEMPLATE_SUFFIX.test(name) && CREDENTIAL_FILE_NAMES.some((pattern) => pattern.test(name));
}

/** Names the kind of credential the line contains, if any. */
export function findCredential(line: string): string | undefined {
  return CREDENTIAL_PATTERNS.find(([, pattern]) => pattern.test(line))?.[0];
}
