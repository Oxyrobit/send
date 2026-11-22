import assets from '../common/assets';
import { version } from '../package.json';
import Keychain from './keychain';
import { downloadStream, type Cancellable } from './api';
import { transformStream } from './streams';
import Zip from './zip';
import contentDisposition from 'content-disposition';
import type { Manifest } from '../common/types';

// The DOM lib is used for the whole project, so describe the few service
// worker APIs used here instead of pulling in the conflicting WebWorker lib.
interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}
interface FetchEvent extends Event {
  readonly request: Request;
  respondWith(response: Promise<Response> | Response): void;
}
interface ExtendableMessageEvent extends MessageEvent {
  readonly ports: ReadonlyArray<MessagePort>;
}
interface ServiceWorkerScope {
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  addEventListener(
    type: 'install',
    listener: (e: ExtendableEvent) => void
  ): void;
  addEventListener(
    type: 'activate',
    listener: (e: ExtendableEvent) => void
  ): void;
  onfetch: ((event: FetchEvent) => void) | null;
  onmessage: ((event: ExtendableMessageEvent) => void) | null;
}

const sw = self as unknown as ServiceWorkerScope;

interface DownloadInfo {
  key: string;
  nonce: string;
  filename: string;
  requiresPassword: boolean;
  password: string;
  url: string;
  type: string;
  manifest: Manifest;
  size: number;
  progress: number;
  download?: Cancellable<ReadableStream<Uint8Array>>;
}

let noSave = false;
const map = new Map<string, DownloadInfo>();
const IMAGES = /.*\.(png|svg|jpg)$/;
// anchored, no nested quantifiers: not exposed to ReDoS
// eslint-disable-next-line security/detect-unsafe-regex
const VERSIONED_ASSET = /\.[A-Fa-f0-9]{8}\.(js|css|png|svg|jpg)(#\w+)?$/;
const DOWNLOAD_URL = /\/api\/download\/([A-Fa-f0-9]{4,})/;
const FONT = /\.woff2?$/;

sw.addEventListener('install', () => {
  sw.skipWaiting();
});

sw.addEventListener('activate', event => {
  event.waitUntil(sw.clients.claim().then(precache));
});

async function decryptStream(id: string): Promise<Response> {
  const file = map.get(id);
  if (!file) {
    return new Response(null, { status: 400 });
  }
  try {
    let size = file.size;
    let type = file.type;
    const keychain = new Keychain(file.key, file.nonce);
    if (file.requiresPassword) {
      keychain.setPassword(file.password, file.url);
    }

    const download = downloadStream(id, keychain);
    file.download = download;

    const body = await download.result;

    const decrypted = keychain.decryptStream(body);

    let zipStream: ReadableStream<Uint8Array> | null = null;
    if (file.type === 'send-archive') {
      const zip = new Zip(file.manifest, decrypted);
      zipStream = zip.stream;
      type = 'application/zip';
      size = zip.size;
    }
    const responseStream = transformStream<Uint8Array, Uint8Array>(
      zipStream || decrypted,
      {
        transform(chunk, controller) {
          file.progress += chunk.length;
          controller.enqueue(chunk);
        }
      },
      function oncancel() {
        // NOTE: cancel doesn't currently fire on chrome
        // https://bugs.chromium.org/p/chromium/issues/detail?id=638494
        download.cancel();
        map.delete(id);
      }
    );

    const headers = {
      'Content-Disposition': contentDisposition(file.filename),
      'Content-Type': type,
      'Content-Length': String(size)
    };
    return new Response(responseStream, { headers });
  } catch (e) {
    if (noSave) {
      const status = Number((e as Error).message);
      return new Response(null, {
        status: status >= 200 && status <= 599 ? status : 500
      });
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: `/download/${id}/#${file.key}`
      }
    });
  }
}

async function precache(): Promise<void> {
  try {
    await cleanCache();
    const cache = await caches.open(version);
    const images = assets.match(IMAGES);
    await cache.addAll(images);
  } catch (e) {
    console.error(e);
    // cache will get populated on demand
  }
}

async function cleanCache(): Promise<void> {
  const oldCaches = await caches.keys();
  await Promise.all(
    oldCaches.filter(c => c !== version).map(c => caches.delete(c))
  );
}

function cacheable(url: string): boolean {
  return VERSIONED_ASSET.test(url) || FONT.test(url);
}

async function cachedOrFetched(req: Request): Promise<Response> {
  const cache = await caches.open(version);
  const cached = await cache.match(req);
  if (cached) {
    return cached;
  }
  const fetched = await fetch(req);
  if (fetched.ok && cacheable(req.url)) {
    cache.put(req, fetched.clone());
  }
  return fetched;
}

sw.onfetch = event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const dlmatch = DOWNLOAD_URL.exec(url.pathname);
  if (dlmatch) {
    event.respondWith(decryptStream(dlmatch[1]));
  } else if (cacheable(url.pathname)) {
    event.respondWith(cachedOrFetched(req));
  }
};

interface SwRequest {
  request: 'init' | 'progress' | 'cancel';
  id: string;
  noSave?: boolean;
  key: string;
  nonce: string;
  filename: string;
  requiresPassword: boolean;
  password: string;
  url: string;
  type: string;
  manifest: Manifest;
  size: number;
}

sw.onmessage = event => {
  const data = event.data as SwRequest;
  const port = event.ports[0];
  if (data.request === 'init') {
    noSave = !!data.noSave;
    map.set(data.id, {
      key: data.key,
      nonce: data.nonce,
      filename: data.filename,
      requiresPassword: data.requiresPassword,
      password: data.password,
      url: data.url,
      type: data.type,
      manifest: data.manifest,
      size: data.size,
      progress: 0
    });
    port.postMessage('file info received');
  } else if (data.request === 'progress') {
    const file = map.get(data.id);
    if (!file) {
      port.postMessage({ error: 'cancelled' });
    } else {
      if (file.progress === file.size) {
        map.delete(data.id);
      }
      port.postMessage({ progress: file.progress });
    }
  } else if (data.request === 'cancel') {
    const file = map.get(data.id);
    if (file) {
      if (file.download) {
        file.download.cancel();
      }
      map.delete(data.id);
    }
    port.postMessage('download cancelled');
  }
};
