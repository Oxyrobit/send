import fs from 'fs';
import { negotiateLanguages } from '@fluent/langneg';
import { availableLanguages } from '../../package.json';
import config from '../config';
import { LOCALES_DIR } from '../paths';
import type { Response, NextFunction } from 'express';
import type { SendRequest } from '../types/express';

// We return early in the middleware if the lang header is long.
// If that ever changes we should re-evaluate this regex.
const acceptLanguages =
  // eslint-disable-next-line security/detect-unsafe-regex
  /(([a-zA-Z]+(-[a-zA-Z0-9]+){0,2})|\*)(;q=[0-1](\.[0-9]+)?)?/g;

const languages = config.l10n_dev
  ? fs.readdirSync(LOCALES_DIR)
  : availableLanguages;

export default function language(
  req: SendRequest,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers['accept-language'] || 'en-US';
  if (header.length > 255) {
    req.language = 'en-US';
    return next();
  }
  const langs = header.replace(/\s/g, '').match(acceptLanguages) || ['en-US'];
  const preferred = langs
    .map(l => {
      const parts = l.split(';');
      return {
        locale: parts[0],
        q: parts[1] ? parseFloat(parts[1].split('=')[1]) : 1
      };
    })
    .sort((a, b) => b.q - a.q)
    .map(x => x.locale);
  req.language = negotiateLanguages(preferred, languages, {
    strategy: 'lookup',
    defaultLocale: 'en-US'
  })[0];
  next();
}
