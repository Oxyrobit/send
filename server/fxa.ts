import config from './config';
import type { AuthConfig } from '../common/types';

const KEY_SCOPE = config.fxa_key_scope;
const CONFIG_TTL = 1000 * 60 * 5;
const TIMEOUT = 3000;
let fxaConfig: AuthConfig | null = null;
let lastConfigRefresh = 0;
let pending: Promise<AuthConfig | null> | null = null;

async function fetchFxaConfig(): Promise<AuthConfig | null> {
  try {
    const res = await fetch(
      `${config.fxa_url}/.well-known/openid-configuration`,
      { signal: AbortSignal.timeout(TIMEOUT) }
    );
    if (res.ok) {
      const c = (await res.json()) as AuthConfig;
      c.key_scope = KEY_SCOPE;
      fxaConfig = c;
      lastConfigRefresh = Date.now();
    }
  } catch {
    // continue with previous fxaConfig
  }
  return fxaConfig;
}

export async function getFxaConfig(): Promise<AuthConfig | null> {
  if (fxaConfig && Date.now() - lastConfigRefresh < CONFIG_TTL) {
    return fxaConfig;
  }
  // Share one refresh between all the requests that need it
  if (!pending) {
    pending = fetchFxaConfig().finally(() => {
      pending = null;
    });
  }
  return pending;
}

/** Returns the FxA user id for a valid OAuth token with the Send scope. */
export async function verify(token?: string | null): Promise<string | null> {
  if (!token) {
    return null;
  }
  const c = await getFxaConfig();
  if (!c) {
    return null;
  }
  try {
    const verifyUrl = c.jwks_uri.replace('jwks', 'verify'); //HACK
    const result = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(TIMEOUT)
    });
    const info = (await result.json()) as { scope?: unknown; user?: string };
    if (
      Array.isArray(info.scope) &&
      info.scope.includes(KEY_SCOPE) &&
      info.user
    ) {
      return info.user;
    }
  } catch {
    // gulp
  }
  return null;
}

export default { getFxaConfig, verify };
