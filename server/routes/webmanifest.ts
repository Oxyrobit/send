import state from '../state';
import type { Response } from 'express';
import type { SendRequest } from '../types/express';

export default async function webmanifest(req: SendRequest, res: Response) {
  const appState = await state(req);
  const assets = appState.ui ? appState.ui.assets : {};

  const manifest = {
    name: 'Send',
    short_name: 'Send',
    lang: req.language,
    icons: [
      {
        src: assets.android_chrome_192px,
        type: 'image/png',
        sizes: '192x192'
      },
      {
        src: assets.android_chrome_512px,
        type: 'image/png',
        sizes: '512x512'
      }
    ],
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#220033',
    background_color: 'white'
  };
  res.set('Content-Type', 'application/manifest+json');
  res.json(manifest);
}
