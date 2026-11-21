import html from 'choo/html';
import type { AppState, Emit } from '../state';

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

export default function downloadPassword(
  state: AppState,
  emit: Emit
): HTMLElement {
  const fileInfo = state.fileInfo!;
  const invalid = fileInfo.password === null;

  const div = html`
    <div
      class="h-full w-full flex flex-col items-center justify-center bg-white py-8 max-w-md mx-auto dark:bg-grey-90"
    >
      <h1 class="text-3xl font-bold mb-4">
        ${state.translate('downloadTitle')}
      </h1>
      <p
        class="w-full mb-4 text-center text-grey-80 dark:text-grey-40 leading-normal"
      >
        ${state.translate('downloadDescription')}
      </p>
      <form
        class="flex flex-row flex-nowrap w-full md:w-4/5"
        onsubmit="${checkPassword}"
        data-no-csrf
      >
        <input
          id="autocomplete-decoy"
          class="hidden"
          type="password"
          value="lol"
        />
        <input
          id="password-input"
          class="w-full border-l border-t border-b rounded-l-lg rounded-r-none ${
            invalid ? 'border-red dark:border-red-40' : 'border-grey'
          } leading-loose px-2 py-1 dark:bg-grey-80"
          maxlength="4096"
          autocomplete="off"
          placeholder="${state.translate('unlockInputPlaceholder')}"
          oninput="${inputChanged}"
          type="password"
        />
        <input
          type="submit"
          id="password-btn"
          class="btn rounded-r-lg rounded-l-none ${
            invalid ? 'bg-red hover:bg-red focus:bg-red dark:bg-red-40' : ''
          }"
          value="${state.translate('unlockButtonLabel')}"
          title="${state.translate('unlockButtonLabel')}"
        />
      </form>
      <label
        id="password-error"
        class="${invalid ? '' : 'invisible'} text-red dark:text-red-40 my-4"
        for="password-input"
      >
        ${state.translate('passwordTryAgain')}
      </label>
    </div>
  `;

  if (typeof document !== 'undefined' && div instanceof HTMLElement) {
    setTimeout(() => {
      const input = document.getElementById('password-input');
      if (input) {
        input.focus();
      }
    });
  }

  function inputChanged(event: Event) {
    event.stopPropagation();
    event.preventDefault();
    const label = byId('password-error');
    const input = byId('password-input');
    const btn = byId('password-btn');
    label.classList.add('invisible');
    input.classList.remove('border-red', 'dark:border-red-40');
    btn.classList.remove(
      'bg-red',
      'hover:bg-red',
      'focus:bg-red',
      'dark:bg-red-40'
    );
  }

  function checkPassword(event: Event) {
    event.stopPropagation();
    event.preventDefault();
    const el = byId<HTMLInputElement>('password-input');
    const password = el.value;
    if (password.length > 0) {
      byId<HTMLInputElement>('password-btn').disabled = true;
      // Strip any url parameters between fileId and secretKey
      const fileInfoUrl = window.location.href.replace(/\?.+#/, '#');
      fileInfo.url = fileInfoUrl;
      fileInfo.password = password;
      emit('getMetadata');
    }
    return false;
  }

  return div;
}
