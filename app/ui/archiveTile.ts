import html from 'choo/html';
import raw from 'choo/html/raw';
import assets from '../../common/assets';
import { bytes, copyToClipboard, percent, platform, timeLeft } from '../utils';
import list from './list';
import expiryOptions from './expiryOptions';
import type { AppState, Emit } from '../state';
import type { Manifest, ManifestFile, Translate } from '../../common/types';
import type OwnedFile from '../ownedFile';

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

interface ExpiryInfo {
  dlimit: number;
  dtotal: number;
  expiresAt: number;
}

/** Something that has a name and a size: a file, an archive, a download */
interface Named {
  name?: string;
  size?: number;
}

/** An archive whose content can be listed */
interface Listable {
  manifest?: Manifest;
  open?: boolean;
}

function expiryInfo(translate: Translate, archive: ExpiryInfo): HTMLElement {
  const l10n = timeLeft(archive.expiresAt - Date.now());
  return raw(
    translate('archiveExpiryInfo', {
      downloadCount: translate('downloadCount', {
        num: archive.dlimit - archive.dtotal
      }),
      timespan: translate(l10n.id, l10n)
    })
  );
}

function password(state: AppState): HTMLElement {
  const MAX_LENGTH = 4096;

  return html`
    <div class="mb-2 px-1">
      <input
        id="autocomplete-decoy"
        class="hidden"
        type="password"
        value="lol"
      />
      <div class="checkbox inline-block mr-3">
        <input
          id="add-password"
          type="checkbox"
          ${state.archive.password ? 'checked' : ''}
          autocomplete="off"
          onchange="${togglePasswordInput}"
        />
        <label for="add-password"> ${state.translate('addPassword')} </label>
      </div>
      <div class="relative inline-block my-1">
        <input
          id="password-input"
          class="${
            state.archive.password ? '' : 'invisible'
          } border-default rounded-default focus:border-primary leading-normal my-1 py-1 px-2 h-8 dark:bg-grey-80"
          autocomplete="off"
          maxlength="${MAX_LENGTH}"
          type="password"
          oninput="${inputChanged}"
          onfocus="${focused}"
          placeholder="${state.translate('unlockInputPlaceholder')}"
          value="${state.archive.password || ''}"
        />
        <button
          id="password-preview-button"
          type="button"
          class="${
            state.archive.password ? '' : 'invisible'
          } absolute top-0 right-0 w-8 h-8"
          onclick="${onPasswordPreviewButtonclicked}"
        >
          <img
            src="${assets.get('eye.svg')}"
            width="22"
            height="22"
            class="m-auto mt-2"
          />
        </button>
      </div>
      <label
        id="password-msg"
        for="password-input"
        class="block text-xs text-grey-70"
      ></label>
    </div>
  `;

  function onPasswordPreviewButtonclicked(event: Event) {
    event.preventDefault();
    const input = byId<HTMLInputElement>('password-input');
    const eyeIcon = (event.currentTarget as HTMLElement).querySelector(
      'img'
    ) as HTMLImageElement;

    if (input.type === 'password') {
      input.type = 'text';
      eyeIcon.src = assets.get('eye-off.svg');
    } else {
      input.type = 'password';
      eyeIcon.src = assets.get('eye.svg');
    }

    input.focus();
  }

  function togglePasswordInput(event: Event) {
    event.stopPropagation();
    const checked = (event.target as HTMLInputElement).checked;
    const input = byId<HTMLInputElement>('password-input');
    const passwordPreviewButton = byId('password-preview-button');
    if (checked) {
      input.classList.remove('invisible');
      passwordPreviewButton.classList.remove('invisible');
      input.focus();
    } else {
      input.classList.add('invisible');
      passwordPreviewButton.classList.add('invisible');
      input.value = '';
      byId('password-msg').textContent = '';
      state.archive.password = null;
    }
  }

  function inputChanged() {
    const passwordInput = byId<HTMLInputElement>('password-input');
    const pwdmsg = byId('password-msg');
    const password = passwordInput.value;
    const length = password.length;

    if (length === MAX_LENGTH) {
      pwdmsg.textContent = state.translate('maxPasswordLength', {
        length: MAX_LENGTH
      });
    } else {
      pwdmsg.textContent = '';
    }
    state.archive.password = password;
  }

  function focused(event: Event) {
    event.preventDefault();
    const el = byId<HTMLInputElement>('password-input');
    if (el.placeholder !== state.translate('unlockInputPlaceholder')) {
      el.placeholder = '';
    }
  }
}

function fileInfo(
  file: ManifestFile | File,
  action?: HTMLElement
): HTMLElement {
  return html`
    <send-file class="flex flex-row items-center p-3 w-full">
      <svg class="h-8 w-8 text-primary">
        <use xlink:href="${assets.get('blue_file.svg')}#icon"/>
      </svg>
      <p class="ml-4 w-full">
        <h1 class="text-base font-medium word-break-all">${file.name}</h1>
        <div class="text-sm font-normal opacity-75 pt-1">${bytes(
          file.size
        )}</div>
      </p>
      ${action}
    </send-file>`;
}

function archiveInfo(archive: Named, action?: HTMLElement): HTMLElement {
  return html`
    <p class="w-full flex items-center">
      <svg class="h-8 w-6 mr-3 flex-shrink-0 text-primary">
        <use xlink:href="${assets.get('blue_file.svg')}#icon"/>
      </svg>
      <p class="flex-grow">
        <h1 class="text-base font-medium word-break-all">${archive.name}</h1>
        <div class="text-sm font-normal opacity-75 pt-1">${bytes(
          archive.size || 0
        )}</div>
      </p>
      ${action}
    </p>`;
}

function archiveDetails(
  translate: Translate,
  archive: Listable
): HTMLElement | undefined {
  const files = archive.manifest ? archive.manifest.files : [];
  if (files.length > 1) {
    return html`
      <details
        class="w-full pb-1"
        ${archive.open ? 'open' : ''}
        ontoggle="${toggled}"
      >
        <summary
          class="flex items-center link-primary text-sm cursor-pointer outline-none"
        >
          <svg
            class="fill-current w-4 h-4 mr-1"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
          >
            <path
              d="M12.95 10.707l.707-.707L8 4.343 6.586 5.757 10.828 10l-4.242 4.243L8 15.657l4.95-4.95z"
            />
          </svg>
          ${translate('fileCount', {
            num: files.length
          })}
        </summary>
        ${list(files.map(f => fileInfo(f)))}
      </details>
    `;
  }
  return undefined;

  function toggled(event: Event) {
    event.stopPropagation();
    archive.open = (event.target as HTMLDetailsElement).open;
  }
}

export default function archiveTile(
  state: AppState,
  emit: Emit,
  archive: OwnedFile
): HTMLElement {
  // Show the share link right away. Several tiles can be on the page at
  // once, so no id here.
  const link = html`
    <input
      type="text"
      value="${archive.url}"
      readonly="readonly"
      aria-label="${state.translate('copyLinkButton')}"
      onclick="${selectAll}"
      class="block w-full my-4 border-default rounded-lg leading-loose h-12 px-2 py-1 dark:bg-grey-80"
    />
  `;
  const copyOrShare =
    state.capabilities.share || platform() === 'android'
      ? html`
          <button
            class="link-primary self-end flex items-start"
            onclick=${share}
            title="Share link"
          >
            <svg class="h-4 w-4 mr-2">
              <use xlink:href="${assets.get('share-24.svg')}#icon" />
            </svg>
            Share link
          </button>
        `
      : html`
          <button
            class="link-primary focus:outline self-end flex items-center"
            onclick=${copy}
            title="${state.translate('copyLinkButton')}"
          >
            <svg class="h-4 w-4 mr-2">
              <use xlink:href="${assets.get('copy-16.svg')}#icon" />
            </svg>
            ${state.translate('copyLinkButton')}
          </button>
        `;
  const dl =
    platform() === 'web'
      ? html`
          <a
            class="flex items-baseline link-primary"
            href="${archive.url}"
            title="${state.translate('downloadButtonLabel')}"
            tabindex="0"
          >
            <svg class="h-4 w-3 mr-2">
              <use xlink:href="${assets.get('dl.svg')}#icon" />
            </svg>
            ${state.translate('downloadButtonLabel')}
          </a>
        `
      : html` <div></div> `;
  return html`
    <send-archive
      id="archive-${archive.id}"
      class="flex flex-col items-start rounded-default shadow-light bg-white p-4 w-full dark:bg-grey-90 dark:border-default dark:border-grey-70"
    >
      ${archiveInfo(
        archive,
        html`
          <input
            type="image"
            class="self-start flex-shrink-0 text-white hover:opacity-75 focus:outline"
            alt="${state.translate('deleteButtonHover')}"
            title="${state.translate('deleteButtonHover')}"
            src="${assets.get('close-16.svg')}"
            onclick=${del}
          />
        `
      )}
      <div class="text-sm opacity-75 w-full mt-2 mb-2">
        ${expiryInfo(state.translate, archive)}
      </div>
      ${archiveDetails(state.translate, archive)}
      <hr class="w-full border-t my-4 dark:border-grey-70" />
      ${link}
      <div class="flex justify-between w-full">${dl} ${copyOrShare}</div>
    </send-archive>
  `;

  function selectAll(event: Event) {
    (event.target as HTMLInputElement).select();
  }

  function copy(event: Event) {
    event.stopPropagation();
    copyToClipboard(archive.url);
    const text = (event.currentTarget as HTMLElement).lastChild;
    if (!text) {
      return;
    }
    text.textContent = state.translate('copiedUrl');
    setTimeout(
      () => (text.textContent = state.translate('copyLinkButton')),
      1000
    );
  }

  function del(event: Event) {
    event.stopPropagation();
    emit('delete', archive);
  }

  async function share(event: Event) {
    event.stopPropagation();
    if (typeof Android === 'object' && Android) {
      Android.shareUrl(archive.url);
    } else {
      try {
        await navigator.share({
          title: state.translate('-send-brand'),
          text: `Download "${archive.name}" with Send: simple, safe file sharing`,
          //state.translate('shareMessage', { name }),
          url: archive.url
        });
      } catch {
        // ignore
      }
    }
  }
}

export function wip(state: AppState, emit: Emit): HTMLElement {
  return html`
    <send-upload-area
      class="flex flex-col bg-white h-full w-full dark:bg-grey-90"
      id="wip"
    >
      ${list(
        Array.from(state.archive.files)
          .reverse()
          .map(f =>
            fileInfo(f, remove(f, state.translate('deleteButtonHover')))
          ),
        'flex-shrink bg-grey-10 rounded-t overflow-y-auto px-6 py-4 md:h-full md:max-h-half-screen dark:bg-black',
        'bg-white px-2 my-2 shadow-light rounded-default dark:bg-grey-90 dark:border-default dark:border-grey-80'
      )}
      <div
        class="flex-shrink-0 flex-grow flex items-end p-4 bg-grey-10 rounded-b mb-1 font-medium dark:bg-grey-90"
      >
        <input
          id="file-upload"
          class="opacity-0 w-0 h-0 appearance-none absolute overflow-hidden"
          type="file"
          multiple
          onfocus="${focus}"
          onblur="${blur}"
          onchange="${add}"
        />
        <div
          for="file-upload"
          class="flex flex-row items-center justify-between w-full p-2"
        >
          <label
            for="file-upload"
            class="flex items-center cursor-pointer"
            title="${state.translate('addFilesButton')}"
          >
            <svg class="w-6 h-6 mr-2 link-primary">
              <use xlink:href="${assets.get('addfiles.svg')}#plus" />
            </svg>
            ${state.translate('addFilesButton')}
          </label>
          <div class="font-normal text-sm text-grey-70 dark:text-grey-40">
            ${state.translate('totalSize', {
              size: bytes(state.archive.size)
            })}
          </div>
        </div>
      </div>
      ${expiryOptions(state, emit)} ${password(state)}
      <button
        id="upload-btn"
        class="btn rounded-lg flex-shrink-0 focus:outline"
        title="${state.translate('uploadButton')}"
        onclick="${upload}"
      >
        ${state.translate('uploadButton')}
      </button>
    </send-upload-area>
  `;

  function label(event: Event): Element | null {
    const sibling = (event.target as HTMLElement).nextElementSibling;
    return sibling && sibling.firstElementChild;
  }

  function focus(event: Event) {
    const el = label(event);
    if (el) {
      el.classList.add('outline');
    }
  }

  function blur(event: Event) {
    const el = label(event);
    if (el) {
      el.classList.remove('outline');
    }
  }

  function upload(event: Event) {
    window.scrollTo(0, 0);
    event.preventDefault();
    (event.target as HTMLButtonElement).disabled = true;
    if (!state.uploading) {
      emit('upload');
    }
  }

  function add(event: Event) {
    event.preventDefault();
    const input = event.target as HTMLInputElement;
    const newFiles = Array.from(input.files || []);

    emit('addFiles', { files: newFiles });
    setTimeout(() => {
      const first = document.querySelector('#wip > ul > li:first-child');
      if (first) {
        first.scrollIntoView({ block: 'center' });
      }
    });
  }

  function remove(file: File, desc: string): HTMLElement {
    return html`
      <input
        type="image"
        class="self-center text-white ml-4 h-4 hover:opacity-75 focus:outline"
        alt="${desc}"
        title="${desc}"
        src="${assets.get('close-16.svg')}"
        onclick="${del}"
      />
    `;
    function del(event: Event) {
      event.stopPropagation();
      emit('removeUpload', file);
    }
  }
}

export function uploading(state: AppState, emit: Emit): HTMLElement {
  const progress = state.transfer ? state.transfer.progressRatio : 0;
  const progressPercent = percent(progress);
  const archive = state.archive;
  return html`
    <send-upload-area
      id="${archive.id}"
      class="flex flex-col items-start rounded-default shadow-light bg-white p-4 w-full dark:bg-grey-90"
    >
      ${archiveInfo(archive)}
      <div class="text-xs opacity-75 w-full mt-2 mb-2">
        ${expiryInfo(state.translate, {
          dlimit: state.archive.dlimit,
          dtotal: 0,
          expiresAt: Date.now() + 500 + state.archive.timeLimit * 1000
        })}
      </div>
      <div class="link-primary text-sm font-medium mt-2">
        ${progressPercent}
      </div>
      <progress class="my-3" value="${progress}">${progressPercent}</progress>
      <button
        class="link-primary self-end font-medium"
        onclick=${cancel}
        title="${state.translate('deletePopupCancel')}"
      >
        ${state.translate('deletePopupCancel')}
      </button>
    </send-upload-area>
  `;

  function cancel(event: Event) {
    event.stopPropagation();
    (event.target as HTMLButtonElement).disabled = true;
    emit('cancel');
  }
}

export function empty(state: AppState, emit: Emit): HTMLElement {
  const upsell =
    state.user.loggedIn || !state.capabilities.account
      ? ''
      : html`
          <button
            class="center font-medium text-sm link-primary mt-4 mb-2"
            onclick="${(event: Event) => {
              event.stopPropagation();
              emit('signup-cta', 'drop');
            }}"
          >
            ${state.translate('signInSizeBump', {
              size: bytes(state.LIMITS.MAX_FILE_SIZE)
            })}
          </button>
        `;
  const uploadNotice = state.WEB_UI.UPLOAD_AREA_NOTICE_HTML
    ? html`
        <p
          class="w-full mt-8 p-2 border-default dark:border-grey-70 rounded-default text-orange-60 bg-yellow-40 text-center leading-normal"
        >
          ${raw(state.WEB_UI.UPLOAD_AREA_NOTICE_HTML)}
        </p>
      `
    : '';

  return html`
    <send-upload-area
      class="flex flex-col items-center justify-center border-2 border-dashed border-grey-transparent rounded-default px-6 py-16 h-full w-full dark:border-grey-60"
      onclick="${(e: Event) => {
        if ((e.target as HTMLElement).tagName !== 'LABEL') {
          byId('file-upload').click();
        }
      }}"
    >
      <svg class="w-10 h-10 link-primary">
        <use xlink:href="/${assets.get('addfiles.svg')}#plus" />
      </svg>
      <div class="pt-6 pb-2 text-center text-lg font-bold tracking-wide">
        ${state.translate('dragAndDropFiles')}
      </div>
      <div class="pb-6 text-center text-base">
        ${state.translate('orClickWithSize', {
          size: bytes(state.user.maxSize)
        })}
      </div>
      <input
        id="file-upload"
        class="opacity-0 w-0 h-0 appearance-none absolute overflow-hidden"
        type="file"
        multiple
        onfocus="${focus}"
        onblur="${blur}"
        onchange="${add}"
        onclick="${(e: Event) => e.stopPropagation()}"
      />
      <label
        for="file-upload"
        role="button"
        class="btn rounded-lg flex items-center mt-4"
        title="${state.translate('addFilesButton', {
          size: bytes(state.user.maxSize)
        })}"
      >
        ${state.translate('addFilesButton')}
      </label>
      ${upsell} ${uploadNotice}
    </send-upload-area>
  `;

  function sibling(event: Event): Element | null {
    return (event.target as HTMLElement).nextElementSibling;
  }

  function focus(event: Event) {
    const el = sibling(event);
    if (el) {
      el.classList.add('bg-primary', 'outline');
    }
  }

  function blur(event: Event) {
    const el = sibling(event);
    if (el) {
      el.classList.remove('bg-primary', 'outline');
    }
  }

  function add(event: Event) {
    event.preventDefault();
    const input = event.target as HTMLInputElement;
    emit('addFiles', { files: Array.from(input.files || []) });
  }
}

export function preview(state: AppState, emit: Emit): HTMLElement {
  const archive = state.fileInfo!;
  if (archive.open === undefined) {
    archive.open = true;
  }
  const single = !archive.manifest || archive.manifest.files.length === 1;
  const details = single
    ? ''
    : html`
        <div class="mt-4 h-full md:h-48 overflow-y-auto">
          ${archiveDetails(state.translate, archive)}
        </div>
      `;
  const notice = state.WEB_UI.DOWNLOAD_NOTICE_HTML
    ? html`
        <p
          class="w-full mt-4 p-2 border-default dark:border-grey-70 rounded-default text-orange-60 bg-yellow-40 text-center leading-normal"
        >
          ${raw(state.WEB_UI.DOWNLOAD_NOTICE_HTML)}
        </p>
      `
    : '';
  const sponsor = state.WEB_UI.SHOW_THUNDERBIRD_SPONSOR
    ? html`
        <a
          class="w-full mt-5 mb-2 p-2 border-default dark:border-grey-70 rounded-default text-orange-60 bg-yellow-40 text-center leading-normal"
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
          ${state.translate('sponsoredByThunderbird')}
        </a>
      `
    : '';

  return html`
    <send-archive
      class="flex flex-col max-h-full bg-white p-4 w-full md:w-128 dark:bg-grey-90"
    >
      <div class="border-default rounded-default py-3 px-6 dark:border-grey-70">
        ${archiveInfo(archive)} ${details}
      </div>
      <button
        id="download-btn"
        class="btn rounded-lg mt-4 w-full flex-shrink-0 focus:outline"
        title="${state.translate('downloadButtonLabel')}"
        onclick=${download}
      >
        ${state.translate('downloadButtonLabel')}
      </button>
      ${notice} ${sponsor}
    </send-archive>
  `;

  function download(event: Event) {
    event.preventDefault();
    (event.target as HTMLButtonElement).disabled = true;
    emit('download');
  }
}

export function downloading(state: AppState): HTMLElement {
  const archive = state.fileInfo!;
  const progress = state.transfer ? state.transfer.progressRatio : 0;
  const progressPercent = percent(progress);
  return html`
    <send-archive
      class="flex flex-col bg-white rounded-default shadow-light p-4 w-full max-w-sm md:w-128 dark:bg-grey-90"
    >
      ${archiveInfo(archive)}
      <div class="link-primary text-sm font-medium mt-2">
        ${progressPercent}
      </div>
      <progress class="my-3" value="${progress}">${progressPercent}</progress>
    </send-archive>
  `;
}
