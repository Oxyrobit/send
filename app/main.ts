import 'core-js';
import 'fast-text-encoding'; // MS Edge support
import 'intl-pluralrules';
import choo from 'choo';
import nanotiming from 'nanotiming';
import routes from './routes';
import getCapabilities from './capabilities';
import controller from './controller';
import dragManager from './dragManager';
import pasteManager from './pasteManager';
import storage from './storage';
import experiments from './experiments';
import * as Sentry from '@sentry/browser';
import './main.css';
import User from './user';
import { getTranslator } from './locale';
import Archive from './archive';
import { setTranslate, locale } from './utils';
import type { AppState, Emitter } from './state';

type Plugin = (state: AppState, emitter: Emitter) => void;

if (navigator.doNotTrack !== '1' && window.SENTRY_CONFIG) {
  Sentry.init(window.SENTRY_CONFIG);
}

if (process.env.NODE_ENV === 'production') {
  nanotiming.disabled = true;
}

(async function start() {
  const capabilities = await getCapabilities();
  if (
    !capabilities.crypto &&
    window.location.pathname !== '/unsupported/crypto'
  ) {
    return window.location.assign('/unsupported/crypto');
  }
  if (capabilities.serviceWorker) {
    try {
      await navigator.serviceWorker.register('/serviceWorker.js');
      await navigator.serviceWorker.ready;
    } catch {
      // continue but disable streaming downloads
      capabilities.streamDownload = false;
    }
  }

  const translate = await getTranslator(locale());
  setTranslate(translate);
  window.initialState = {
    LIMITS,
    DEFAULTS,
    WEB_UI,
    PREFS,
    archive: new Archive([], DEFAULTS.EXPIRE_SECONDS, DEFAULTS.DOWNLOADS),
    capabilities,
    translate,
    storage,
    sentry: Sentry,
    user: new User(storage, LIMITS, window.AUTH_CONFIG),
    transfer: null,
    fileInfo: null,
    locale: locale()
  };

  const app = routes(new choo({ hash: true }));
  window.app = app;
  const plugins: Plugin[] = [
    experiments,
    controller,
    dragManager,
    pasteManager
  ];
  for (const plugin of plugins) {
    app.use(plugin as unknown as Parameters<typeof app.use>[0]);
  }
  app.mount('body');
})();
