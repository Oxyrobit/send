import fs from 'fs';
import path from 'path';
import type { Request } from 'express';
import config from './config';
import layout from './layout';
import assets from '../common/assets';
import getTranslator from './locale';
import { getFxaConfig } from './fxa';
import { LOCALES_DIR, readDistJson } from './paths';
import type { AppState } from '../app/state';
import type { AuthConfig, Prefs } from '../common/types';

// Server side, the asset map comes from the webpack manifest
assets.setManifest(readDistJson<Record<string, string>>('manifest.json', {}));

// Resolved once: the configured locale doesn't change while running
const customLocale =
  config.custom_locale !== '' &&
  fs.existsSync(path.join(LOCALES_DIR, config.custom_locale))
    ? config.custom_locale
    : null;

const prefs: Prefs = {};
if (config.survey_url) {
  prefs.surveyUrl = config.survey_url;
}

type CustomAssetName = keyof typeof config.ui_custom_assets;

function uiAssets(baseUrl: string): Record<CustomAssetName, string> {
  const result: Record<CustomAssetName, string> = {
    android_chrome_192px: assets.get('android-chrome-192x192.png'),
    android_chrome_512px: assets.get('android-chrome-512x512.png'),
    apple_touch_icon: assets.get('apple-touch-icon.png'),
    favicon_16px: assets.get('favicon-16x16.png'),
    favicon_32px: assets.get('favicon-32x32.png'),
    icon: assets.get('icon.svg'),
    safari_pinned_tab: assets.get('safari-pinned-tab.svg'),
    facebook: baseUrl + '/' + assets.get('send-fb.jpg'),
    twitter: baseUrl + '/' + assets.get('send-twitter.jpg'),
    wordmark: assets.get('wordmark.svg') + '#logo',
    custom_css: ''
  };
  for (const name of Object.keys(result) as CustomAssetName[]) {
    if (config.ui_custom_assets[name] !== '') {
      result[name] = config.ui_custom_assets[name];
    }
  }
  return result;
}

export interface ServerRequest extends Request {
  language?: string;
  cspNonce?: string;
}

/** The state used to render a page on the server. */
export default async function state(req: ServerRequest): Promise<AppState> {
  const locale = customLocale || req.language || 'en-US';
  let authConfig: AuthConfig | null = null;
  let robots = 'none';
  if (req.route && req.route.path === '/') {
    robots = 'all';
  }
  if (config.fxa_client_id) {
    const fxaConfig = await getFxaConfig();
    if (fxaConfig) {
      // copy, so the shared cached config is never modified
      authConfig = { ...fxaConfig, client_id: config.fxa_client_id };
    }
  }
  const baseUrl = config.deriveBaseUrl(req);
  const serverState = {
    archive: {
      numFiles: 0
    },
    locale,
    capabilities: { account: false },
    translate: getTranslator(locale),
    title: config.custom_title,
    description: config.custom_description,
    baseUrl,
    ui: {
      colors: {
        primary: config.ui_color_primary,
        accent: config.ui_color_accent
      },
      assets: uiAssets(baseUrl)
    },
    storage: {
      files: []
    },
    fileInfo: {},
    cspNonce: req.cspNonce,
    user: { avatar: assets.get('user.svg'), loggedIn: false },
    robots,
    authConfig,
    prefs,
    layout
  };
  // The views only touch the parts of the browser state set above
  return serverState as unknown as AppState;
}
