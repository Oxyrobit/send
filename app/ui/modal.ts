import html from 'choo/html';
import type { AppState, Emit } from '../state';

export default function modal(state: AppState, emit: Emit): HTMLElement | '' {
  const dialog = state.modal;
  if (!dialog) {
    return '';
  }
  return html`
    <send-modal
      class="absolute inset-0 flex items-center justify-center overflow-hidden z-40 bg-white md:rounded-xl md:my-8 dark:bg-grey-90"
    >
      <div
        class="h-full w-full max-h-screen absolute top-0 flex justify-center md:items-center"
      >
        <div class="w-full">${dialog(state, emit, close)}</div>
      </div>
    </send-modal>
  `;

  function close(event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    emit('closeModal');
  }
}
