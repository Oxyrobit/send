import html from 'choo/html';
import raw from 'choo/html/raw';
import config from './config';
import clientConstants from './clientConstants';
import { readDistJson } from './paths';
import type { AppState } from '../app/state';

/**
 * JSON that is safe to embed in an inline <script>: a `</script>` (or `<!--`)
 * inside a configured string can't end the script element early.
 */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value === undefined ? null : value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

let sentry = '';
if (config.sentry_id) {
  const version = readDistJson('version.json', { version: 'unknown' });
  sentry = `
var SENTRY_CONFIG = {
  dsn: ${scriptJson(config.sentry_id)},
  release: ${scriptJson(version.version)},
  beforeSend: function (data) {
    var hash = window.location.hash;
    if (hash) {
      return JSON.parse(JSON.stringify(data).replace(new RegExp(hash.slice(1), 'g'), ''));
    }
    return data;
  }
}
`;
}

type InitState = Pick<
  AppState,
  'authConfig' | 'prefs' | 'downloadMetadata' | 'cspNonce'
>;

export default function initScript(
  state: Partial<InitState>
): HTMLElement | '' {
  const authConfig = state.authConfig
    ? `var AUTH_CONFIG = ${scriptJson(state.authConfig)};`
    : '';

  /* eslint-disable no-useless-escape */
  const jsconfig = `
  var isIE = /trident\\\/7\.|msie/i.test(navigator.userAgent);
  var isUnsupportedPage = /\\\/unsupported/.test(location.pathname);
  if (isIE && !isUnsupportedPage) {
    window.location.assign('/unsupported/ie');
  }
  if (
    // Firefox < 50
    /firefox/i.test(navigator.userAgent) &&
    parseInt(navigator.userAgent.match(/firefox\\/*([^\\n\\r]*)\./i)[1], 10) < 50
  ) {
    window.location.assign('/unsupported/outdated');
  }

  var LIMITS = ${scriptJson(clientConstants.LIMITS)};
  var WEB_UI = ${scriptJson(clientConstants.WEB_UI)};
  var DEFAULTS = ${scriptJson(clientConstants.DEFAULTS)};
  var PREFS = ${scriptJson(state.prefs || {})};
  var downloadMetadata = ${scriptJson(state.downloadMetadata || {})};
  ${authConfig};
  ${sentry}
  `;
  /* eslint-enable no-useless-escape */
  return state.cspNonce
    ? html`
        <script nonce="${state.cspNonce}">
          ${raw(jsconfig)};
        </script>
      `
    : '';
}
