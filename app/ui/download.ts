import html from 'choo/html';
import {
  downloading as downloadingTile,
  preview as previewTile
} from './archiveTile';
import modal from './modal';
import noStreams from './noStreams';
import notFound from './notFound';
import downloadPassword from './downloadPassword';
import downloadCompleted from './downloadCompleted';
import type { AppState, Emit } from '../state';
import type { DownloadFileInfo } from '../fileReceiver';

const BIG_SIZE = 1024 * 1024 * 256;

function createFileInfo(state: AppState): DownloadFileInfo {
  return {
    id: state.params.id,
    secretKey: state.params.key,
    nonce: downloadMetadata.nonce,
    requiresPassword: downloadMetadata.pwd
  };
}

function downloading(state: AppState): HTMLElement {
  return html`
    <div
      class="flex flex-col w-full h-full items-center md:justify-center md:-mt-8"
    >
      <h1 class="text-3xl font-bold mb-4">
        ${state.translate('downloadingTitle')}
      </h1>
      ${downloadingTile(state)}
    </div>
  `;
}

function preview(state: AppState, emit: Emit): HTMLElement {
  const size = (state.fileInfo && state.fileInfo.size) || 0;
  if (!state.capabilities.streamDownload && size > BIG_SIZE) {
    return noStreams(state, emit);
  }
  return html`
    <div
      class="flex flex-col w-full max-w-md h-full mx-auto items-center justify-center"
    >
      <h1 class="text-3xl font-bold mb-4">
        ${state.translate('downloadTitle')}
      </h1>
      <p
        class="w-full text-grey-80 text-center leading-normal dark:text-grey-40"
      >
        ${state.translate('downloadDescription')}
      </p>
      ${previewTile(state, emit)}
    </div>
  `;
}

export default function download(
  state: AppState,
  emit: Emit
): HTMLElement | void {
  let content: HTMLElement | string = '';
  if (!state.fileInfo) {
    state.fileInfo = createFileInfo(state);
    if (downloadMetadata.status === 404) {
      return notFound(state, emit);
    }
    if (!state.fileInfo.nonce) {
      // coming from something like the browser back button
      return location.reload();
    }
  }
  const fileInfo = state.fileInfo;

  if (!state.transfer && !fileInfo.requiresPassword) {
    emit('getMetadata');
  }

  if (state.transfer && 'state' in state.transfer) {
    switch (state.transfer.state) {
      case 'downloading':
      case 'decrypting':
        content = downloading(state);
        break;
      case 'complete':
        content = downloadCompleted(state);
        break;
      default:
        content = preview(state, emit);
    }
  } else if (fileInfo.requiresPassword && !fileInfo.password) {
    content = downloadPassword(state, emit);
  }
  return html`
    <main class="main">
      ${modal(state, emit)}
      <section
        class="relative h-full w-full p-6 md:p-8 md:rounded-xl md:shadow-big"
      >
        ${content}
      </section>
    </main>
  `;
}
