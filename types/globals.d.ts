// Globals injected by server/initScript.ts into every page.
import type {
  AuthConfig,
  Defaults,
  Limits,
  Prefs,
  WebUI
} from '../common/types';

declare global {
  const LIMITS: Limits;
  const WEB_UI: WebUI;
  const DEFAULTS: Defaults;
  const PREFS: Prefs;
  const AUTH_CONFIG: AuthConfig | undefined;
  const downloadMetadata: { nonce?: string; pwd?: boolean; status?: number };
  /** Only defined inside the Android wrapper app. */
  const Android: { shareUrl(url: string): void } | undefined;

  interface Window {
    SENTRY_CONFIG?: Record<string, unknown>;
    AUTH_CONFIG?: AuthConfig;
    initialState?: unknown;
    app?: unknown;
    asmCrypto?: unknown;
  }

  interface Navigator {
    /** iOS Safari home-screen mode */
    standalone?: boolean;
    /** Legacy Edge/IE */
    msSaveBlob?: (blob: Blob, name: string) => boolean;
  }
}

export {};
