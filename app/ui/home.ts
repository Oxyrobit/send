import html from 'choo/html';
import raw from 'choo/html/raw';
import list from './list';
import archiveTile, { empty, uploading, wip } from './archiveTile';
import modal from './modal';
import intro from './intro';
import assets from '../../common/assets';
import type { AppState, Emit } from '../state';

export default function home(state: AppState, emit: Emit): HTMLElement {
  const archives = state.storage.files
    .filter(archive => !archive.expired)
    .map(archive => archiveTile(state, emit, archive));
  let left: HTMLElement;
  if (state.uploading) {
    left = uploading(state, emit);
  } else if (state.archive.numFiles > 0) {
    left = wip(state, emit);
  } else {
    left = empty(state, emit);
  }

  if (archives.length > 0 && state.WEB_UI.UPLOADS_LIST_NOTICE_HTML) {
    archives.push(html`
      <p
        class="w-full p-2 border-default dark:border-grey-70 rounded-default text-orange-60 bg-yellow-40 text-center leading-normal"
      >
        ${raw(state.WEB_UI.UPLOADS_LIST_NOTICE_HTML)}
      </p>
    `);
  }

  archives.reverse();

  if (archives.length > 0 && state.WEB_UI.SHOW_THUNDERBIRD_SPONSOR) {
    archives.push(html`
      <a
        class="w-full p-2 border-default dark:border-grey-70 rounded-default text-orange-60 bg-yellow-40 text-center leading-normal d-block"
        href="https://www.thunderbird.net/"
      >
        <svg
          width="30"
          height="30"
          class="m-2 mr-3 d-inline-block align-middle"
        >
          <image
            xlink:href="${assets.get('thunderbird-icon.svg')}"
            src="${assets.get('thunderbird-icon.svg')}"
            width="30"
            height="30"
          />
        </svg>
        Sponsored by Thunderbird
      </a>
    `);
  }

  const right =
    archives.length === 0
      ? intro(state)
      : list(archives, 'p-2 h-full overflow-y-auto w-full', 'mb-4 w-full');

  return html`
    <main class="main">
      ${modal(state, emit)}
      <section
        class="h-full w-full p-6 md:p-8 overflow-hidden md:flex md:flex-row md:rounded-xl md:shadow-big"
      >
        <div class="px-2 w-full md:px-0 md:mr-8 md:w-1/2">${left}</div>
        <div class="mt-6 w-full md:w-1/2 md:-m-2">${right}</div>
      </section>
    </main>
  `;
}
