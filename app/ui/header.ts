import html from 'choo/html';
import Component from 'choo/component';
import Account from './account';
import assets from '../../common/assets';
import { platform } from '../utils';
import type { AppState } from '../state';

export default class Header extends Component {
  private readonly state: AppState;
  private readonly account: Account;

  constructor(name: string, state: AppState) {
    super(name);
    this.state = state;
    this.account = state.cache(Account, 'account');
  }

  override update(): boolean {
    this.account.render();
    return false;
  }

  override createElement(): HTMLElement {
    let assetMap: Record<string, string>;
    if (this.state.ui !== undefined) assetMap = this.state.ui.assets;
    else
      assetMap = {
        icon:
          this.state.WEB_UI.CUSTOM_ASSETS.icon !== ''
            ? this.state.WEB_UI.CUSTOM_ASSETS.icon
            : assets.get('icon.svg'),
        wordmark:
          this.state.WEB_UI.CUSTOM_ASSETS.wordmark !== ''
            ? this.state.WEB_UI.CUSTOM_ASSETS.wordmark
            : assets.get('wordmark.svg') + '#logo'
      };
    const title =
      platform() === 'android'
        ? html`
            <a class="flex flex-row items-center">
              <img src="${assetMap.icon}" />
              <svg class="w-48">
                <use xlink:href="${assetMap.wordmark}" />
              </svg>
            </a>
          `
        : html`
            <a class="flex flex-row items-center" href="/">
              <img
                alt="${this.state.translate('title')}"
                src="${assetMap.icon}"
              />
              <svg viewBox="66 0 340 64" class="w-48 md:w-64">
                <use xlink:href="${assetMap.wordmark}" />
              </svg>
            </a>
          `;
    return html`
      <header
        class="main-header relative flex-none flex flex-row items-center justify-between w-full px-6 md:px-8 h-16 md:h-24 z-20 bg-transparent"
      >
        ${title} ${this.account.render()}
      </header>
    `;
  }
}
