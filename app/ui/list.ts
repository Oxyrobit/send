import html from 'choo/html';

export default function list(
  items: unknown[],
  ulStyle = '',
  liStyle = ''
): HTMLElement {
  const lis = items.map(i => html` <li class="${liStyle}">${i}</li> `);
  return html`
    <ul class="${ulStyle}">
      ${lis}
    </ul>
  `;
}
