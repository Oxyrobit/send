import * as b64 from 'base64-js';
import type { Translate, TranslateData } from '../common/types';

export function arrayToB64(array: Uint8Array): string {
  return b64
    .fromByteArray(array)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export function b64ToArray(str: string): Uint8Array<ArrayBuffer> {
  return b64.toByteArray(
    str + '==='.slice((str.length + 3) % 4)
  ) as Uint8Array<ArrayBuffer>;
}

export function locale(): string {
  return document.documentElement.lang;
}

export function loadShim(polyfill: string): Promise<boolean> {
  return new Promise(resolve => {
    const shim = document.createElement('script');
    shim.src = polyfill;
    shim.addEventListener('load', () => resolve(true));
    shim.addEventListener('error', () => resolve(false));
    document.head.appendChild(shim);
  });
}

export function isFile(id: string | null | undefined): id is string {
  return typeof id === 'string' && /^[0-9a-fA-F]{10,16}$/.test(id);
}

function legacyCopyToClipboard(str: string): boolean {
  const aux = document.createElement('input');
  aux.setAttribute('value', str);
  aux.contentEditable = 'true';
  // `readOnly` must stay false, otherwise iOS refuses the selection/copy
  aux.readOnly = false;
  aux.style.position = 'absolute';
  aux.style.left = '-9999px';
  document.body.appendChild(aux);
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    const range = document.createRange();
    range.selectNodeContents(aux);
    const sel = getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
    aux.setSelectionRange(0, str.length);
  } else {
    aux.select();
  }
  const result = document.execCommand('copy');
  document.body.removeChild(aux);
  return result;
}

export function copyToClipboard(str: string): Promise<boolean> {
  // Async Clipboard API: works on modern iOS/Android Safari & Chrome, requires a
  // secure context (https). `execCommand('copy')` is the fallback for old
  // browsers and non-secure contexts.
  if (
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function' &&
    window.isSecureContext
  ) {
    return navigator.clipboard.writeText(str).then(
      () => true,
      () => legacyCopyToClipboard(str)
    );
  }
  return Promise.resolve(legacyCopyToClipboard(str));
}

const LOCALIZE_NUMBERS = !!(
  typeof Intl === 'object' &&
  Intl &&
  typeof Intl.NumberFormat === 'function' &&
  typeof navigator === 'object'
);

const UNITS = ['bytes', 'kb', 'mb', 'gb'];
export function bytes(num: number): string {
  if (num < 1) {
    return '0B';
  }
  const exponent = Math.min(Math.floor(Math.log10(num) / 3), UNITS.length - 1);
  const n = Number(num / Math.pow(1024, exponent));
  const decimalDigits = Math.floor(n) === n ? 0 : 1;
  let nStr = n.toFixed(decimalDigits);
  if (LOCALIZE_NUMBERS) {
    try {
      nStr = n.toLocaleString(locale(), {
        minimumFractionDigits: decimalDigits,
        maximumFractionDigits: decimalDigits
      });
    } catch {
      // fall through
    }
  }
  return translate('fileSize', {
    num: nStr,
    units: translate(UNITS[exponent])
  });
}

export function percent(ratio: number): string {
  if (LOCALIZE_NUMBERS) {
    try {
      return ratio.toLocaleString(locale(), { style: 'percent' });
    } catch {
      // fall through
    }
  }
  return `${Math.floor(ratio * 100)}%`;
}

export function number(n: number): string {
  if (LOCALIZE_NUMBERS) {
    return n.toLocaleString(locale());
  }
  return n.toString();
}

export function allowedCopy(): boolean {
  const support = !!document.queryCommandSupported;
  return support ? document.queryCommandSupported('copy') : false;
}

export function delay(ms = 100): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function fadeOut(selector: string): Promise<void> {
  const el = document.querySelector(selector);
  if (el) {
    el.classList.remove('effect--fadeIn');
    el.classList.add('effect--fadeOut');
  }
  return delay(300);
}

export function openLinksInNewTab(links?: Element[], should = true): Element[] {
  const targets =
    links || Array.from(document.querySelectorAll('a:not([target])'));
  if (should) {
    targets.forEach(l => {
      l.setAttribute('target', '_blank');
      l.setAttribute('rel', 'noopener noreferrer');
    });
  } else {
    targets.forEach(l => {
      l.removeAttribute('target');
      l.removeAttribute('rel');
    });
  }
  return targets;
}

export type BrowserName =
  | 'firefox'
  | 'edge'
  | 'edgium'
  | 'ie'
  | 'chrome'
  | 'safari'
  | 'android-app'
  | 'other'
  | 'unknown';

export function browserName(): BrowserName {
  try {
    const ua = navigator.userAgent;
    // order of these matters
    if (/firefox/i.test(ua)) {
      return 'firefox';
    }
    if (/edge/i.test(ua)) {
      return 'edge';
    }
    if (/edg/i.test(ua)) {
      return 'edgium';
    }
    if (/trident/i.test(ua)) {
      return 'ie';
    }
    if (/chrome/i.test(ua)) {
      return 'chrome';
    }
    if (/safari/i.test(ua)) {
      return 'safari';
    }
    if (/send android/i.test(ua)) {
      return 'android-app';
    }
    return 'other';
  } catch {
    return 'unknown';
  }
}

export async function streamToArrayBuffer(
  stream: ReadableStream<Uint8Array>,
  size?: number
): Promise<ArrayBuffer> {
  const reader = stream.getReader();
  let state = await reader.read();

  if (size) {
    const result = new Uint8Array(size);
    let offset = 0;
    while (!state.done) {
      result.set(state.value, offset);
      offset += state.value.length;
      state = await reader.read();
    }
    return result.buffer;
  }

  const parts: Uint8Array[] = [];
  let len = 0;
  while (!state.done) {
    parts.push(state.value);
    len += state.value.length;
    state = await reader.read();
  }
  let offset = 0;
  const result = new Uint8Array(len);
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result.buffer;
}

export interface L10nTimespan extends TranslateData {
  id: string;
  num: number;
}

export function secondsToL10nId(seconds: number): L10nTimespan {
  if (seconds < 3600) {
    return { id: 'timespanMinutes', num: Math.floor(seconds / 60) };
  } else if (seconds < 86400) {
    return { id: 'timespanHours', num: Math.floor(seconds / 3600) };
  }
  return { id: 'timespanDays', num: Math.floor(seconds / 86400) };
}

export interface L10nTimeLeft extends TranslateData {
  id: string;
}

export function timeLeft(milliseconds: number): L10nTimeLeft {
  if (milliseconds < 1) {
    return { id: 'linkExpiredAlt' };
  }
  const minutes = Math.floor(milliseconds / 1000 / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) {
    return {
      id: 'expiresDaysHoursMinutes',
      days,
      hours: hours % 24,
      minutes: minutes % 60
    };
  }
  if (hours >= 1) {
    return {
      id: 'expiresHoursMinutes',
      hours,
      minutes: minutes % 60
    };
  }
  if (minutes === 0) {
    return { id: 'expiresMinutes', minutes: '< 1' };
  }
  return { id: 'expiresMinutes', minutes };
}

export function platform(): 'android' | 'web' {
  if (typeof Android === 'object') {
    return 'android';
  }
  return 'web';
}

export const ECE_RECORD_SIZE = 1024 * 64;
const TAG_LENGTH = 16;
export function encryptedSize(
  size: number,
  rs = ECE_RECORD_SIZE,
  tagLength = TAG_LENGTH
): number {
  const chunkMeta = tagLength + 1; // Chunk metadata, tag and delimiter
  return 21 + size + chunkMeta * Math.ceil(size / (rs - chunkMeta));
}

let translate: Translate = function () {
  throw new Error('uninitialized translate function. call setTranslate first');
};
export function setTranslate(t: Translate): void {
  translate = t;
}
