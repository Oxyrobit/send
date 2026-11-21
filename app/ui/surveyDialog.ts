import html from 'choo/html';
import { version } from '../../package.json';
import { browserName } from '../utils';
import type { Dialog } from '../state';

export default function surveyDialog(): Dialog {
  return function (state, emit, close) {
    const params = new URLSearchParams({
      ver: version,
      browser: browserName(),
      anon: String(state.user.loggedIn),
      active_count: String(state.storage.files.length)
    });
    const surveyUrl = `${state.PREFS.surveyUrl}?${params.toString()}`;
    return html`
      <send-survey-dialog
        class="flex flex-col items-center text-center p-4 max-w-sm m-auto"
      >
        <h1 class="text-3xl font-bold my-4">Tell us what you think.</h1>
        <p class="font-normal leading-normal text-grey-80 px-4">
          Love Send? Take a quick survey to let us know how we can make it
          better.
        </p>
        <a
          class="btn rounded-lg w-full flex-shrink-0 focus:outline my-5"
          onclick="${() => emit('closeModal')}"
          title="Give feedback"
          href="${surveyUrl}"
          target="_blank"
          rel="noopener noreferrer"
        >
          Give feedback
        </a>
        <button
          class="link-primary font-medium cursor-pointer focus:outline"
          onclick="${close}"
          title="Skip"
        >
          Skip
        </button>
      </send-survey-dialog>
    `;
  };
}
