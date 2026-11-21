import html from 'choo/html';
import raw from 'choo/html/raw';
import { secondsToL10nId } from '../utils';
import selectbox from './selectbox';
import type { AppState, Emit } from '../state';

export default function expiryOptions(
  state: AppState,
  emit: Emit
): HTMLElement {
  const el = html`
    <div class="px-1">
      ${raw(
        state.translate('archiveExpiryInfo', {
          downloadCount:
            '<span class="lg:inline-block md:block sm:inline-block block"></span><select id="dlCount"></select>',
          timespan: '<select id="timespan"></select>'
        })
      )}
    </div>
  `;
  if ((el as unknown as { __encoded?: boolean }).__encoded) {
    // we're rendering on the server
    return el;
  }

  const counts = state.DEFAULTS.DOWNLOAD_COUNTS.filter(
    i => state.capabilities.account || i <= state.user.maxDownloads
  );

  const dlCountSelect = el.querySelector('#dlCount') as HTMLElement;
  el.replaceChild(
    selectbox(
      state.archive.dlimit,
      counts,
      num => state.translate('downloadCount', { num }),
      value => {
        const selected = parseInt(value, 10);
        state.archive.dlimit = selected;
        emit('render');
      },
      'expire-after-dl-count-select'
    ),
    dlCountSelect
  );

  const expires = state.DEFAULTS.EXPIRE_TIMES_SECONDS.filter(
    i => state.capabilities.account || i <= state.user.maxExpireSeconds
  );

  const timeSelect = el.querySelector('#timespan') as HTMLElement;
  el.replaceChild(
    selectbox(
      state.archive.timeLimit,
      expires,
      num => {
        const l10n = secondsToL10nId(num);
        return state.translate(l10n.id, l10n);
      },
      value => {
        const selected = parseInt(value, 10);
        state.archive.timeLimit = selected;
        emit('render');
      },
      'expire-after-time-select'
    ),
    timeSelect
  );

  return el;
}
