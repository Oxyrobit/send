// Ambient declarations for untyped third-party modules and webpack loaders.

declare module 'nanohtml' {
  /** Tagged template creating DOM nodes (browser) or a string-like node (server). */
  function html(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): HTMLElement;
  export = html;
}

declare module 'choo/html/raw' {
  function raw(html: string): HTMLElement;
  export = raw;
}

declare module 'choo/component' {
  type Emit = (event: string, ...args: any[]) => void;
  class Component {
    constructor(name?: string);
    element?: HTMLElement;
    render(...args: unknown[]): HTMLElement;
    rerender(): void;
    createElement(...args: unknown[]): HTMLElement;
    update(...args: unknown[]): boolean;
    load?(el: HTMLElement): void;
    unload?(el: HTMLElement): void;
    afterupdate?(el: HTMLElement): void;
    afterreorder?(el: HTMLElement): void;
  }
  namespace Component {
    type Ctor<T, S = unknown> = new (name: string, state: S, emit: Emit) => T;
  }
  export = Component;
}

declare module 'nanotiming' {
  interface Nanotiming {
    (name: string): (cb?: () => void) => void;
    disabled: boolean;
  }
  const nanotiming: Nanotiming;
  export = nanotiming;
}

declare module 'redis-mock' {
  import type * as redis from 'redis';
  const mock: typeof redis;
  export = mock;
}

declare module 'convict-format-with-validator' {
  import type { Format } from 'convict';
  const formats: Record<string, Format>;
  export = formats;
}

declare module 'fast-text-encoding';
declare module 'intl-pluralrules';
declare module 'asmcrypto.js';
declare module '@dannycoates/webcrypto-liner/build/shim';
declare module '@mattiasbuelens/web-streams-polyfill';

declare module '*.ftl' {
  const content: string;
  export default content;
}

declare module '*.css';

declare module 'http_ece' {
  interface Params {
    version: string;
    rs: number;
    salt: string | Buffer;
    keyid: string;
    key: string | Buffer;
  }
  export function encrypt(buffer: Buffer, params: Params): Buffer;
  export function decrypt(buffer: Buffer, params: Params): Buffer;
}
