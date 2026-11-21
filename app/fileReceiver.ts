import Nanobus from 'nanobus';
import Keychain from './keychain';
import { delay, bytes, streamToArrayBuffer } from './utils';
import {
  downloadFile,
  getApiUrl,
  httpError,
  metadata,
  type Cancellable,
  type TransferError
} from './api';
import { blobStream } from './streams';
import Zip from './zip';
import type { Manifest } from '../common/types';

/** What the download page knows about the file being downloaded. */
export interface DownloadFileInfo {
  id: string;
  secretKey: string;
  nonce?: string | null;
  requiresPassword?: boolean;
  password?: string | null;
  url?: string;
  name?: string;
  type?: string;
  iv?: string;
  size?: number;
  manifest?: Manifest;
  /** UI state: is the file list expanded */
  open?: boolean;
}

export type ReceiverState =
  'initialized' | 'ready' | 'downloading' | 'decrypting' | 'complete';

interface SwResponse {
  progress?: number;
  error?: string;
}

export default class FileReceiver extends Nanobus {
  readonly keychain: Keychain;
  readonly fileInfo: DownloadFileInfo;
  msg = 'fileSizeProgress';
  state: ReceiverState = 'initialized';
  progress: [number, number] = [0, 1];
  private downloadRequest: Pick<Cancellable<unknown>, 'cancel'> | null = null;

  constructor(fileInfo: DownloadFileInfo) {
    super('FileReceiver');
    this.keychain = new Keychain(fileInfo.secretKey, fileInfo.nonce);
    if (fileInfo.requiresPassword && fileInfo.password && fileInfo.url) {
      this.keychain.setPassword(fileInfo.password, fileInfo.url);
    }
    this.fileInfo = fileInfo;
    this.reset();
  }

  get progressRatio(): number {
    return this.progress[0] / this.progress[1];
  }

  get progressIndefinite(): boolean {
    return this.state !== 'downloading';
  }

  get sizes(): { partialSize: string; totalSize: string } {
    return {
      partialSize: bytes(this.progress[0]),
      totalSize: bytes(this.progress[1])
    };
  }

  private get size(): number {
    return this.fileInfo.size || 0;
  }

  cancel(): void {
    if (this.downloadRequest) {
      this.downloadRequest.cancel();
    }
  }

  reset(): void {
    this.msg = 'fileSizeProgress';
    this.state = 'initialized';
    this.progress = [0, 1];
  }

  async getMetadata(): Promise<void> {
    const meta = await metadata(this.fileInfo.id, this.keychain);
    this.fileInfo.name = meta.name;
    this.fileInfo.type = meta.type;
    this.fileInfo.iv = meta.iv;
    this.fileInfo.size = +meta.size;
    this.fileInfo.manifest = meta.manifest;
    this.state = 'ready';
  }

  private sendMessageToSw(msg: Record<string, unknown>): Promise<SwResponse> {
    return new Promise((resolve, reject) => {
      const controller = navigator.serviceWorker.controller;
      if (!controller) {
        reject('no serviceWorker');
        return;
      }
      const channel = new MessageChannel();
      channel.port1.onmessage = function (event: MessageEvent) {
        if (event.data === undefined) {
          reject('bad response from serviceWorker');
        } else if (event.data.error !== undefined) {
          reject(event.data.error);
        } else {
          resolve(event.data as SwResponse);
        }
      };
      controller.postMessage(msg, [channel.port2]);
    });
  }

  async downloadBlob(noSave = false): Promise<void> {
    this.state = 'downloading';
    const request = downloadFile(this.fileInfo.id, this.keychain, p => {
      this.progress = [p, this.size];
      this.emit('progress');
    });
    this.downloadRequest = request;
    try {
      const ciphertext = await request.result;
      this.downloadRequest = null;
      this.msg = 'decryptingFile';
      this.state = 'decrypting';
      this.emit('decrypting');
      let size = this.size;
      let plainStream = this.keychain.decryptStream(blobStream(ciphertext));
      if (this.fileInfo.type === 'send-archive' && this.fileInfo.manifest) {
        const zip = new Zip(this.fileInfo.manifest, plainStream);
        plainStream = zip.stream;
        size = zip.size;
      }
      const plaintext = await streamToArrayBuffer(plainStream, size);
      if (!noSave) {
        await saveFile({
          plaintext,
          name: decodeURIComponent(this.fileInfo.name || 'download'),
          type: this.fileInfo.type || 'application/octet-stream'
        });
      }
      this.msg = 'downloadFinish';
      this.emit('complete');
      this.state = 'complete';
    } catch (e) {
      this.downloadRequest = null;
      throw e;
    }
  }

  async downloadStream(noSave = false): Promise<void> {
    const start = Date.now();
    const onprogress = (p: number) => {
      this.progress = [p, this.size];
      this.emit('progress');
    };

    this.downloadRequest = {
      cancel: () => {
        this.sendMessageToSw({ request: 'cancel', id: this.fileInfo.id }).catch(
          () => {}
        );
      }
    };

    try {
      this.state = 'downloading';

      const info = {
        request: 'init',
        id: this.fileInfo.id,
        filename: this.fileInfo.name,
        type: this.fileInfo.type,
        manifest: this.fileInfo.manifest,
        key: this.fileInfo.secretKey,
        requiresPassword: this.fileInfo.requiresPassword,
        password: this.fileInfo.password,
        url: this.fileInfo.url,
        size: this.fileInfo.size,
        nonce: this.keychain.nonce,
        noSave
      };
      await this.sendMessageToSw(info);

      onprogress(0);

      const downloadPath = `/api/download/${this.fileInfo.id}`;
      if (noSave) {
        const res = await fetch(getApiUrl(downloadPath));
        if (res.status !== 200) {
          throw httpError(res.status);
        }
      } else {
        let downloadUrl = getApiUrl(downloadPath);
        if (downloadUrl === downloadPath) {
          downloadUrl = `${location.protocol}//${location.host}${downloadPath}`;
        }
        clickDownloadLink(downloadUrl);
      }

      let prog = 0;
      let hangs = 0;
      while (prog < this.size) {
        const msg = await this.sendMessageToSw({
          request: 'progress',
          id: this.fileInfo.id
        });
        const progress = msg.progress || 0;
        if (progress === prog) {
          hangs++;
        } else {
          hangs = 0;
        }
        if (hangs > 30) {
          // TODO: On Chrome we don't get a cancel
          // signal so one is indistinguishable from
          // a hang. We may be able to detect
          // which end is hung in the service worker
          // to improve on this.
          const e: TransferError = new Error('hung download');
          e.duration = Date.now() - start;
          e.size = this.size;
          e.progress = prog;
          throw e;
        }
        prog = progress;
        onprogress(prog);
        await delay(1000);
      }

      this.downloadRequest = null;
      this.msg = 'downloadFinish';
      this.emit('complete');
      this.state = 'complete';
    } catch (e) {
      this.downloadRequest = null;
      if (e === 'cancelled' || (e instanceof Error && e.message === '400')) {
        throw httpError(0);
      }
      throw e;
    }
  }

  download(options: { stream?: boolean; noSave?: boolean }): Promise<void> {
    if (options.stream) {
      return this.downloadStream(options.noSave);
    }
    return this.downloadBlob(options.noSave);
  }
}

function clickDownloadLink(href: string, filename?: string): void {
  const a = document.createElement('a');
  a.href = href;
  if (filename) {
    a.download = filename;
  }
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Don't leave a dangling anchor in the page for every download
  document.body.removeChild(a);
}

interface SaveableFile {
  plaintext: ArrayBuffer;
  name: string;
  type: string;
}

async function saveFile(file: SaveableFile): Promise<void> {
  const blob = new Blob([file.plaintext], { type: file.type });

  if (navigator.msSaveBlob) {
    navigator.msSaveBlob(blob, file.name);
    return;
  }
  const downloadUrl = URL.createObjectURL(blob);
  clickDownloadLink(downloadUrl, file.name);
  // Revoking right away can abort the download in some browsers
  await delay(100);
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 60 * 1000);
}
