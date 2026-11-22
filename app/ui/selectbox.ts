import html from 'choo/html';

export default function selectbox(
  selected: number,
  options: number[],
  translate: (value: number) => string,
  changed: (value: string) => void,
  htmlId: string
): HTMLElement {
  function choose(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    if (value !== String(selected)) {
      changed(value);
    }
  }

  return html`
    <select
      id="${htmlId}"
      class="appearance-none cursor-pointer border-default rounded-default bg-grey-10 hover:border-primary focus:border-primary pl-1 pr-8 py-1 my-1 h-8 dark:bg-grey-80"
      data-selected="${selected}"
      onchange="${choose}"
    >
      ${options.map(
        value => html`
          <option value="${value}" ${value === selected ? 'selected' : ''}>
            ${translate(value)}
          </option>
        `
      )}
    </select>
  `;
}
