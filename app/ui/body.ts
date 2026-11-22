import html from 'choo/html';
import Header from './header';
import Footer from './footer';
import type { AppState, Emit, View } from '../state';

export default function body(main: View): View {
  return function (state: AppState, emit: Emit) {
    const b = html`
      <body
        class="flex flex-col items-center font-sans md:h-screen md:bg-grey-10 dark:bg-black"
      >
        ${state.cache(Header, 'header').render()} ${main(state, emit)}
        ${state.cache(Footer, 'footer').render()}
      </body>
    `;
    if (state.layout) {
      // server side only
      return state.layout(state, b);
    }
    return b;
  };
}
