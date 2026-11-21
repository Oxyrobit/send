import { FluentBundle, FluentResource } from '@fluent/bundle';
import type { Translate } from '../common/types';

function makeBundle(locale: string, ftl: string): FluentBundle {
  const bundle = new FluentBundle(locale, { useIsolating: false });
  bundle.addResource(new FluentResource(ftl));
  return bundle;
}

export async function getTranslator(locale: string): Promise<Translate> {
  const bundles: FluentBundle[] = [];
  const { default: en } = await import('../public/locales/en-US/send.ftl');
  try {
    if (locale !== 'en-US') {
      const { default: ftl } = await import(
        `../public/locales/${locale}/send.ftl`
      );
      bundles.push(makeBundle(locale, ftl));
    }
  } catch {
    console.warn(`Locale ${locale} not found. Using en-US as fallback.`);
  }
  bundles.push(makeBundle('en-US', en));
  return function (id, data) {
    for (const bundle of bundles) {
      const message = bundle.getMessage(id);
      if (message && message.value) {
        return bundle.formatPattern(message.value, data);
      }
    }
    return id;
  };
}
