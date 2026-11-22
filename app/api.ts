import { arrayToB64, b64ToArray, delay } from './utils';
import { ECE_RECORD_SIZE } from './ece';
import type Keychain from './keychain';
import type { FileMetadata } from './keychain';

let fileProtocolWssUrl: string | null = null;
try {
  fileProtocolWssUrl = localStorage.getItem('wssURL');
} catch {
  // NOOP
}
if (!fileProtocolWssUrl) {
  fileProtocolWssUrl = 'wss://send.firefox.com/api/ws';
}

/** Errors thrown by transfers carry some diagnostics for Sentry. */
export interface TransferError extends Error {
  size?: number;
  duration?: number;
  progress?: number;
}

export class ConnectionError extends Error implements TransferError {
  constructor(
    public readonly cancelled: boolean,
    public duration?: number,
    public size?: number
  ) {
    super(cancelled ? '0' : 'connection closed');
  }
}

/** Errors are identified by their message, which is the HTTP status code. */
export function httpError(status: number | string): Error {
  return new Error(String(status));
}

export function setFileProtocolWssUrl(url: string): void {
  try {
    localStorage.setItem('wssURL', url);
  } catch {
    // storage unavailable, keep it for this session only
  }
  fileProtocolWssUrl = url;
}

export function getFileProtocolWssUrl(): string | null {
  return fileProtocolWssUrl;
}

let apiUrlPrefix = '';
export function getApiUrl(path: string): string {
  return apiUrlPrefix + path;
}

export function setApiUrlPrefix(prefix: string): void {
  apiUrlPrefix = prefix;
}

function post(obj: unknown, bearerToken?: string): RequestInit {
  const h: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (bearerToken) {
    h['Authorization'] = `Bearer ${bearerToken}`;
  }
  return {
    method: 'POST',
    headers: new Headers(h),
    body: JSON.stringify(obj)
  };
}

export function parseNonce(
  header: string | null | undefined
): string | undefined {
  return (header || '').split(' ')[1];
}

interface AuthResult {
  response: Response;
  ok: boolean;
  shouldRetry: boolean;
}

async function fetchWithAuth(
  url: string,
  params: RequestInit,
  keychain: Keychain
): Promise<AuthResult> {
  const h = await keychain.authHeader();
  const response = await fetch(url, {
    ...params,
    headers: new Headers({
      Authorization: h,
      'Content-Type': 'application/json'
    })
  });
  const nonce = parseNonce(response.headers.get('WWW-Authenticate'));
  const shouldRetry = response.status === 401 && nonce !== keychain.nonce;
  keychain.nonce = nonce;
  return { response, ok: response.ok, shouldRetry };
}

async function fetchWithAuthAndRetry(
  url: string,
  params: RequestInit,
  keychain: Keychain
): Promise<AuthResult> {
  const result = await fetchWithAuth(url, params, keychain);
  if (result.shouldRetry) {
    return fetchWithAuth(url, params, keychain);
  }
  return result;
}

export async function del(id: string, owner_token: string): Promise<boolean> {
  const response = await fetch(
    getApiUrl(`/api/delete/${id}`),
    post({ owner_token })
  );
  return response.ok;
}

export async function setParams(
  id: string,
  owner_token: string,
  bearerToken: string | undefined,
  params: { dlimit: number }
): Promise<boolean> {
  const response = await fetch(
    getApiUrl(`/api/params/${id}`),
    post(
      {
        owner_token,
        dlimit: params.dlimit
      },
      bearerToken
    )
  );
  return response.ok;
}

export interface FileInfoResponse {
  dlimit: number;
  dtotal: number;
  ttl: number;
}

export async function fileInfo(
  id: string,
  owner_token: string
): Promise<FileInfoResponse> {
  const response = await fetch(
    getApiUrl(`/api/info/${id}`),
    post({ owner_token })
  );
  if (response.ok) {
    return (await response.json()) as FileInfoResponse;
  }
  throw httpError(response.status);
}

export interface Metadata extends FileMetadata {
  ttl: number;
}

export async function metadata(
  id: string,
  keychain: Keychain
): Promise<Metadata> {
  const result = await fetchWithAuthAndRetry(
    getApiUrl(`/api/metadata/${id}`),
    { method: 'GET' },
    keychain
  );
  if (result.ok) {
    const data = (await result.response.json()) as {
      metadata: string;
      ttl: number;
    };
    const meta = await keychain.decryptMetadata(b64ToArray(data.metadata));
    return {
      size: meta.size,
      ttl: data.ttl,
      iv: meta.iv,
      name: meta.name,
      type: meta.type,
      manifest: meta.manifest
    };
  }
  throw httpError(result.response.status);
}

export async function setPassword(
  id: string,
  owner_token: string,
  keychain: Keychain
): Promise<boolean> {
  const auth = await keychain.authKeyB64();
  const response = await fetch(
    getApiUrl(`/api/password/${id}`),
    post({ owner_token, auth })
  );
  return response.ok;
}

function asyncInitWebSocket(server: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(server);
    } catch {
      reject(new ConnectionError(false));
      return;
    }
    // Without this, a connection that fails to open would leave the upload
    // hanging forever.
    const onFail = () => reject(new ConnectionError(false));
    ws.addEventListener('error', onFail, { once: true });
    ws.addEventListener(
      'open',
      () => {
        ws.removeEventListener('error', onFail);
        resolve(ws);
      },
      { once: true }
    );
  });
}

interface Canceller {
  cancelled: boolean;
}

interface WsResponse {
  error?: number;
  [key: string]: unknown;
}

function listenForResponse<T extends WsResponse>(
  ws: WebSocket,
  canceller: Canceller
): Promise<T> {
  return new Promise((resolve, reject) => {
    function handleClose() {
      // a 'close' event before a 'message' event means the request failed
      ws.removeEventListener('message', handleMessage);
      reject(new ConnectionError(canceller.cancelled));
    }
    function handleMessage(msg: MessageEvent) {
      ws.removeEventListener('close', handleClose);
      try {
        const response = JSON.parse(msg.data as string) as T;
        if (response.error) {
          throw httpError(response.error);
        } else {
          resolve(response);
        }
      } catch (e) {
        reject(e);
      }
    }
    ws.addEventListener('message', handleMessage, { once: true });
    ws.addEventListener('close', handleClose, { once: true });
  });
}

export interface UploadResult {
  url: string;
  ownerToken: string;
  id: string;
  duration: number;
}

// Keep this many bytes queued in the socket. 2 records in flight plus a 100ms
// sleep capped uploads at ~1.3MB/s no matter how fast the link was: the socket
// drained in a few ms and then sat idle. 4MiB in flight and a short sleep make
// this network/disk bound instead. refs: https://github.com/timvisee/send/issues/112
const MAX_BUFFERED = ECE_RECORD_SIZE * 64;
const DRAIN_POLL_MS = 5;

async function upload(
  stream: ReadableStream<Uint8Array>,
  metadata: ArrayBuffer,
  verifierB64: string,
  timeLimit: number,
  dlimit: number,
  bearerToken: string | undefined,
  onprogress: (size: number) => void,
  canceller: Canceller
): Promise<UploadResult> {
  let size = 0;
  const start = Date.now();
  const host = window.location.hostname;
  const port = window.location.port;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const endpoint =
    window.location.protocol === 'file:'
      ? (fileProtocolWssUrl as string)
      : `${protocol}//${host}${port ? ':' : ''}${port}/api/ws`;

  const ws = await asyncInitWebSocket(endpoint);

  try {
    const metadataHeader = arrayToB64(new Uint8Array(metadata));
    const fileMeta = {
      fileMetadata: metadataHeader,
      authorization: `send-v1 ${verifierB64}`,
      bearer: bearerToken,
      timeLimit,
      dlimit
    };
    const uploadInfoResponse = listenForResponse<
      Omit<UploadResult, 'duration'> & WsResponse
    >(ws, canceller);
    ws.send(JSON.stringify(fileMeta));
    const uploadInfo = await uploadInfoResponse;

    const completedResponse = listenForResponse(ws, canceller);

    const reader = stream.getReader();
    let state = await reader.read();
    while (!state.done) {
      if (canceller.cancelled) {
        ws.close();
      }
      if (ws.readyState !== WebSocket.OPEN) {
        break;
      }
      const buf = state.value;
      ws.send(buf as Uint8Array<ArrayBuffer>);
      onprogress(size);
      size += buf.length;
      state = await reader.read();
      while (
        ws.bufferedAmount > MAX_BUFFERED &&
        ws.readyState === WebSocket.OPEN &&
        !canceller.cancelled
      ) {
        await delay(DRAIN_POLL_MS);
      }
    }
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(new Uint8Array([0])); //EOF
    }

    await completedResponse;
    return {
      url: uploadInfo.url,
      ownerToken: uploadInfo.ownerToken,
      id: uploadInfo.id,
      duration: Date.now() - start
    };
  } catch (e) {
    const err = e as TransferError;
    err.size = size;
    err.duration = Date.now() - start;
    throw err;
  } finally {
    if (
      ws.readyState !== WebSocket.CLOSED &&
      ws.readyState !== WebSocket.CLOSING
    ) {
      ws.close();
    }
  }
}

export interface Cancellable<T> {
  cancel(): void;
  result: Promise<T>;
}

export function uploadWs(
  encrypted: ReadableStream<Uint8Array>,
  metadata: ArrayBuffer,
  verifierB64: string,
  timeLimit: number,
  dlimit: number,
  bearerToken: string | undefined,
  onprogress: (size: number) => void
): Cancellable<UploadResult> {
  const canceller: Canceller = { cancelled: false };

  return {
    cancel: function () {
      canceller.cancelled = true;
    },

    result: upload(
      encrypted,
      metadata,
      verifierB64,
      timeLimit,
      dlimit,
      bearerToken,
      onprogress,
      canceller
    )
  };
}

////////////////////////

async function downloadS(
  id: string,
  keychain: Keychain,
  signal: AbortSignal
): Promise<ReadableStream<Uint8Array>> {
  const auth = await keychain.authHeader();

  const response = await fetch(getApiUrl(`/api/download/${id}`), {
    signal: signal,
    method: 'GET',
    headers: { Authorization: auth }
  });

  const authHeader = response.headers.get('WWW-Authenticate');
  if (authHeader) {
    keychain.nonce = parseNonce(authHeader);
  }

  if (response.status !== 200 || !response.body) {
    throw httpError(response.status);
  }

  return response.body;
}

async function tryDownloadStream(
  id: string,
  keychain: Keychain,
  signal: AbortSignal,
  tries = 2
): Promise<ReadableStream<Uint8Array>> {
  try {
    return await downloadS(id, keychain, signal);
  } catch (e) {
    const err = e as Error;
    if (err.message === '401' && --tries > 0) {
      return tryDownloadStream(id, keychain, signal, tries);
    }
    if (err.name === 'AbortError') {
      throw httpError(0);
    }
    throw err;
  }
}

export function downloadStream(
  id: string,
  keychain: Keychain
): Cancellable<ReadableStream<Uint8Array>> {
  const controller = new AbortController();
  function cancel() {
    controller.abort();
  }
  return {
    cancel,
    result: tryDownloadStream(id, keychain, controller.signal)
  };
}

//////////////////

interface DownloadCanceller {
  oncancel: () => void;
}

async function download(
  id: string,
  keychain: Keychain,
  onprogress: (loaded: number) => void,
  canceller: DownloadCanceller
): Promise<Blob> {
  const auth = await keychain.authHeader();
  const xhr = new XMLHttpRequest();
  canceller.oncancel = function () {
    xhr.abort();
  };
  return new Promise(function (resolve, reject) {
    xhr.addEventListener('loadend', function () {
      canceller.oncancel = function () {};
      const authHeader = xhr.getResponseHeader('WWW-Authenticate');
      if (authHeader) {
        keychain.nonce = parseNonce(authHeader);
      }
      if (xhr.status !== 200) {
        return reject(httpError(xhr.status));
      }
      resolve(new Blob([xhr.response as Blob]));
    });

    xhr.addEventListener('progress', function (event) {
      if (xhr.status === 200) {
        onprogress(event.loaded);
      }
    });
    xhr.open('get', getApiUrl(`/api/download/blob/${id}`));
    xhr.setRequestHeader('Authorization', auth);
    xhr.responseType = 'blob';
    xhr.send();
    onprogress(0);
  });
}

async function tryDownload(
  id: string,
  keychain: Keychain,
  onprogress: (loaded: number) => void,
  canceller: DownloadCanceller,
  tries = 2
): Promise<Blob> {
  try {
    return await download(id, keychain, onprogress, canceller);
  } catch (e) {
    if ((e as Error).message === '401' && --tries > 0) {
      return tryDownload(id, keychain, onprogress, canceller, tries);
    }
    throw e;
  }
}

export function downloadFile(
  id: string,
  keychain: Keychain,
  onprogress: (loaded: number) => void
): Cancellable<Blob> {
  const canceller: DownloadCanceller = {
    oncancel: function () {} // download() sets this
  };
  function cancel() {
    canceller.oncancel();
  }
  return {
    cancel,
    result: tryDownload(id, keychain, onprogress, canceller)
  };
}

export async function getFileList(
  bearerToken: string,
  kid: string
): Promise<Blob> {
  const headers = new Headers({ Authorization: `Bearer ${bearerToken}` });
  const response = await fetch(getApiUrl(`/api/filelist/${kid}`), { headers });
  if (response.ok) {
    return response.blob();
  }
  throw httpError(response.status);
}

export async function setFileList(
  bearerToken: string,
  kid: string,
  data: BodyInit
): Promise<boolean> {
  const headers = new Headers({ Authorization: `Bearer ${bearerToken}` });
  const response = await fetch(getApiUrl(`/api/filelist/${kid}`), {
    headers,
    method: 'POST',
    body: data
  });
  return response.ok;
}

export async function getConstants(): Promise<unknown> {
  const response = await fetch(getApiUrl('/config'));
  if (response.ok) {
    return response.json();
  }
  throw httpError(response.status);
}
