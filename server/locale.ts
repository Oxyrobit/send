import fs from 'fs';
import path from 'path';
import { FluentBundle, FluentResource } from '@fluent/bundle';
import { LOCALES_DIR } from './paths';
import type { Translate } from '../common/types';

function makeBundle(locale: string): [string, FluentBundle] | null {
  const file = path.resolve(LOCALES_DIR, locale, 'send.ftl');
  let ftl: string;
  try {
    ftl = fs.readFileSync(file, 'utf8');
  } catch {
    // A locale directory without translations, skip it instead of crashing
    return null;
  }
  const bundle = new FluentBundle(locale, { useIsolating: false });
  bundle.addResource(new FluentResource(ftl));
  return [locale, bundle];
}

const bundles = new Map(
  fs
    .readdirSync(LOCALES_DIR)
    .map(makeBundle)
    .filter((b): b is [string, FluentBundle] => b !== null)
);

const translators = new Map<string, Translate>();

function format(
  bundle: FluentBundle,
  id: string,
  data?: Parameters<Translate>[1]
): string | null {
  const message = bundle.getMessage(id);
  if (message && message.value) {
    return bundle.formatPattern(message.value, data);
  }
  return null;
}

export default function getTranslator(locale: string): Translate {
  const defaultBundle = bundles.get('en-US') as FluentBundle;
  const bundle = bundles.get(locale) || defaultBundle;
  // Translators are pure, reuse one per bundle instead of one per request
  const key = bundle.locales[0];
  let translate = translators.get(key);
  if (!translate) {
    translate = (id, data) =>
      format(bundle, id, data) ?? format(defaultBundle, id, data) ?? id;
    translators.set(key, translate);
  }
  return translate;
}

export const availableLocales = (): string[] => Array.from(bundles.keys());
