import html from 'choo/html';
import Component from 'choo/component';
import type { AppState, Emit } from '../state';

export default class Account extends Component {
  private readonly state: AppState;
  private readonly emit: Emit;
  private readonly enabled: boolean;
  private readonly local: { loggedIn?: boolean };
  buttonClass: string;

  constructor(name: string, state: AppState, emit: Emit) {
    super(name);
    this.state = state;
    this.emit = emit;
    this.enabled = state.capabilities.account;
    this.local = state.components[name] = {};
    this.buttonClass = '';
    this.setLocal();
  }

  avatarClick(event: Event): void {
    event.preventDefault();
    const menu = document.getElementById('accountMenu');
    if (menu) {
      menu.classList.toggle('invisible');
      menu.focus();
    }
  }

  hideMenu(event: Event): void {
    event.stopPropagation();
    const menu = document.getElementById('accountMenu');
    if (menu) {
      menu.classList.add('invisible');
    }
  }

  login(event: Event): void {
    event.preventDefault();
    this.emit('signup-cta', 'button');
  }

  logout(event: Event): void {
    event.preventDefault();
    this.emit('logout');
  }

  changed(): boolean {
    return this.local.loggedIn !== this.state.user.loggedIn;
  }

  setLocal(): boolean {
    const changed = this.changed();
    if (changed) {
      this.local.loggedIn = this.state.user.loggedIn;
    }
    return changed;
  }

  override update(): boolean {
    return this.setLocal();
  }

  override createElement(): HTMLElement {
    if (!this.enabled) {
      return html` <send-account></send-account> `;
    }
    const user = this.state.user;
    const translate = this.state.translate;
    this.setLocal();
    if (user.loginRequired && !this.local.loggedIn) {
      return html` <send-account></send-account> `;
    }
    if (!this.local.loggedIn) {
      return html`
        <send-account>
          <button
            class="px-4 py-2 md:px-8 md:py-4 focus:outline signin border-2 link-primary border-primary hover:border-primary dark:border-primary dark:hover:border-primary"
            onclick="${(e: Event) => this.login(e)}"
            title="${translate('signInOnlyButton')}"
          >
            ${translate('signInOnlyButton')}
          </button>
        </send-account>
      `;
    }
    return html`
      <send-account class="relative h-8">
        <input
          type="image"
          alt="${user.email}"
          class="w-8 h-8 rounded-full border-default text-primary md:text-white focus:outline"
          src="${user.avatar}"
          onclick="${(e: Event) => this.avatarClick(e)}"
        />
        <ul
          id="accountMenu"
          class="invisible absolute top-0 right-0 mt-10 pt-2 pb-2 bg-white shadow-md whitespace-nowrap outline-none z-50 dark:bg-grey-80"
          onblur="${(e: Event) => this.hideMenu(e)}"
        >
          <li class="p-2 text-grey-60 dark:text-grey-50">${user.email}</li>
          <li>
            <button
              class="block w-full text-left px-4 py-2 text-grey-80 dark:text-grey-30 hover:bg-primary hover:text-white cursor-pointer focus:outline"
              onclick="${(e: Event) => this.logout(e)}"
              title="${translate('signOut')}"
            >
              ${translate('signOut')}
            </button>
          </li>
        </ul>
      </send-account>
    `;
  }
}
