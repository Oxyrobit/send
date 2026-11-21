import html from 'choo/html';
import Component from 'choo/component';
import type { AppState } from '../state';

export default class Footer extends Component {
  private readonly state: AppState;

  constructor(name: string, state: AppState) {
    super(name);
    this.state = state;
  }

  override update(): boolean {
    return false;
  }

  override createElement(): HTMLElement {
    const translate = this.state.translate;

    // Add additional links from configuration if available
    const links: HTMLElement[] = [];
    if (this.state.WEB_UI) {
      const WEB_UI = this.state.WEB_UI;

      if (WEB_UI.FOOTER_DONATE_URL !== '') {
        links.push(html`
          <li class="m-2">
            <a
              href="${WEB_UI.FOOTER_DONATE_URL}"
              target="_blank"
              rel="noopener noreferrer"
            >
              ${translate('footerLinkDonate')}
            </a>
          </li>
        `);
      }
      if (WEB_UI.FOOTER_CLI_URL !== '') {
        links.push(html`
          <li class="m-2">
            <a
              href="${WEB_UI.FOOTER_CLI_URL}"
              target="_blank"
              rel="noopener noreferrer"
            >
              ${translate('footerLinkCli')}
            </a>
          </li>
        `);
      }
      if (WEB_UI.FOOTER_DMCA_URL !== '') {
        links.push(html`
          <li class="m-2">
            <a
              href="${WEB_UI.FOOTER_DMCA_URL}"
              target="_blank"
              rel="noopener noreferrer"
            >
              ${translate('footerLinkDmca')}
            </a>
          </li>
        `);
      }
      if (WEB_UI.FOOTER_SOURCE_URL !== '') {
        links.push(html`
          <li class="m-2">
            <a
              href="${WEB_UI.FOOTER_SOURCE_URL}"
              target="_blank"
              rel="noopener noreferrer"
            >
              ${translate('footerLinkSource')}
            </a>
          </li>
        `);
      }
    } else {
      links.push(html`
        <li class="m-2">
          <a
            href="https://gitlab.com/timvisee/send"
            target="_blank"
            rel="noopener noreferrer"
          >
            ${translate('footerLinkSource')}
          </a>
        </li>
      `);
    }

    // Defining a custom footer
    const footer: HTMLElement[] = [];
    if (this.state.WEB_UI) {
      const WEB_UI = this.state.WEB_UI;

      if (WEB_UI.CUSTOM_FOOTER_URL !== '' && WEB_UI.CUSTOM_FOOTER_TEXT !== '') {
        footer.push(html`
          <li class="m-2">
            <a
              href="${WEB_UI.CUSTOM_FOOTER_URL}"
              target="_blank"
              rel="noopener noreferrer"
            >
              ${WEB_UI.CUSTOM_FOOTER_TEXT}
            </a>
          </li>
        `);
      } else if (WEB_UI.CUSTOM_FOOTER_URL !== '') {
        footer.push(html`
          <li class="m-2">
            <a
              href="${WEB_UI.CUSTOM_FOOTER_URL}"
              target="_blank"
              rel="noopener noreferrer"
            >
              ${WEB_UI.CUSTOM_FOOTER_URL}
            </a>
          </li>
        `);
      } else if (WEB_UI.CUSTOM_FOOTER_TEXT !== '') {
        footer.push(html` <li class="m-2">${WEB_UI.CUSTOM_FOOTER_TEXT}</li> `);
      } else {
        footer.push(html` <li class="m-2">${translate('footerText')}</li> `);
      }
    }

    return html`
      <footer
        class="flex flex-col md:flex-row items-start w-full flex-none self-start p-6 md:p-8 font-medium text-xs text-grey-60 dark:text-grey-40 md:items-center justify-between"
      >
        <ul
          class="flex flex-col md:flex-row items-start md:items-center md:justify-start"
        >
          ${footer}
        </ul>
        <ul
          class="flex flex-col md:flex-row items-start md:items-center md:justify-end"
        >
          ${links}
        </ul>
      </footer>
    `;
  }
}
