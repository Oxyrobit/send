import html from 'choo/html';
import modal from './modal';
import type { AppState, Emit } from '../state';

interface Strings {
  header: string;
  description: string;
  button: string;
}

export default function unsupported(state: AppState, emit: Emit): HTMLElement {
  let strings: Strings;
  let why: HTMLElement | string = '';
  let url: string;

  if (state.params.reason !== 'outdated') {
    strings = unsupportedStrings(state);
    why = html`
      <a
        class="text-primary"
        href="https://github.com/timvisee/send/blob/master/docs/faq.md#why-is-my-browser-not-supported"
      >
        ${state.translate('notSupportedLink')}
      </a>
    `;
    url =
      'https://www.mozilla.org/firefox/new/?utm_campaign=send-acquisition&utm_medium=referral&utm_source=send.firefox.com';
  } else {
    strings = outdatedStrings(state);
    url = 'https://support.mozilla.org/kb/update-firefox-latest-version';
  }

  return html`
    <main class="main">
      ${modal(state, emit)}
      <section
        class="flex flex-col items-center justify-center text-center bg-white m-6 px-6 py-8 border-default border-grey-30 md:border-none md:px-12 md:py-16 shadow-default w-full md:h-full dark:bg-grey-90"
      >
        <h1 class="text-3xl font-bold">${strings.header}</h1>
        <p class="mt-4 mb-8 max-w-md leading-normal">${strings.description}</p>
        ${why}
        <a href="${url}" class="btn rounded-lg mt-8 px-8">
          ${strings.button}
        </a>
      </section>
    </main>
  `;
}

function outdatedStrings(state: AppState): Strings {
  return {
    header: state.translate('notSupportedHeader'),
    description: state.translate('notSupportedOutdatedDetail'),
    button: state.translate('updateFirefox')
  };
}

function unsupportedStrings(state: AppState): Strings {
  return {
    header: state.translate('notSupportedHeader'),
    description: state.translate('notSupportedDescription'),
    button: state.translate('downloadFirefox')
  };
}
