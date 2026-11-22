import { browserName, locale } from './utils';

export interface Capabilities {
  account: boolean;
  crypto: boolean;
  serviceWorker: boolean;
  streamUpload: boolean;
  streamDownload: boolean;
  multifile: boolean;
  share: boolean;
  standalone: boolean;
}

async function checkCrypto(): Promise<boolean> {
  try {
    const key = await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 128
      },
      true,
      ['encrypt', 'decrypt']
    );
    await crypto.subtle.exportKey('raw', key);
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: crypto.getRandomValues(new Uint8Array(12)),
        tagLength: 128
      },
      key,
      new ArrayBuffer(8)
    );
    await crypto.subtle.importKey(
      'raw',
      crypto.getRandomValues(new Uint8Array(16)),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    await crypto.subtle.importKey(
      'raw',
      crypto.getRandomValues(new Uint8Array(16)),
      'HKDF',
      false,
      ['deriveKey']
    );
    await crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256'
      },
      true,
      ['deriveBits']
    );
    return true;
  } catch {
    try {
      window.asmCrypto = await import('asmcrypto.js');
      await import('@dannycoates/webcrypto-liner/build/shim');
      return true;
    } catch {
      return false;
    }
  }
}

function checkStreams(): boolean {
  try {
    new ReadableStream({
      pull() {}
    });
    return true;
  } catch {
    return false;
  }
}

async function polyfillStreams(): Promise<boolean> {
  try {
    await import('@mattiasbuelens/web-streams-polyfill');
    return true;
  } catch {
    return false;
  }
}

export default async function getCapabilities(): Promise<Capabilities> {
  const browser = browserName();
  const isMobile = /mobi|android/i.test(navigator.userAgent);
  const serviceWorker = 'serviceWorker' in navigator && browser !== 'edge';
  const crypto = await checkCrypto();
  const nativeStreams = checkStreams();
  let polyStreams = false;
  if (!nativeStreams) {
    polyStreams = await polyfillStreams();
  }
  let account = typeof AUTH_CONFIG !== 'undefined';
  try {
    account = account && !!localStorage;
  } catch {
    account = false;
  }
  const share =
    isMobile &&
    typeof navigator.share === 'function' &&
    locale().startsWith('en'); // en until strings merge

  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    !!navigator.standalone;

  const mobileFirefox = browser === 'firefox' && isMobile;

  return {
    account,
    crypto,
    serviceWorker,
    streamUpload: nativeStreams || polyStreams,
    streamDownload:
      nativeStreams && serviceWorker && browser !== 'safari' && !mobileFirefox,
    multifile: nativeStreams || polyStreams,
    share,
    standalone
  };
}
