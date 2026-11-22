import Nanobus from 'nanobus';
import OwnedFile from './ownedFile';
import Keychain from './keychain';
import { arrayToB64, bytes, encryptedSize } from './utils';
import {
  httpError,
  uploadWs,
  type Cancellable,
  type UploadResult
} from './api';
import type Archive from './archive';

export default class FileSender extends Nanobus {
  readonly keychain: Keychain;
  private uploadRequest: Cancellable<UploadResult> | null = null;
  msg = 'importingFile';
  progress: [number, number] = [0, 1];
  private cancelled = false;

  constructor() {
    super('FileSender');
    this.keychain = new Keychain();
    this.reset();
  }

  get progressRatio(): number {
    return this.progress[0] / this.progress[1];
  }

  get progressIndefinite(): boolean {
    return !['fileSizeProgress', 'notifyUploadEncryptDone'].includes(this.msg);
  }

  get sizes(): { partialSize: string; totalSize: string } {
    return {
      partialSize: bytes(this.progress[0]),
      totalSize: bytes(this.progress[1])
    };
  }

  reset(): void {
    this.uploadRequest = null;
    this.msg = 'importingFile';
    this.progress = [0, 1];
    this.cancelled = false;
  }

  cancel(): void {
    this.cancelled = true;
    if (this.uploadRequest) {
      this.uploadRequest.cancel();
    }
  }

  async upload(archive: Archive, bearerToken?: string): Promise<OwnedFile> {
    if (this.cancelled) {
      throw httpError(0);
    }
    this.msg = 'encryptingFile';
    this.emit('encrypting');
    const totalSize = encryptedSize(archive.size);
    const encStream = this.keychain.encryptStream(archive.stream);
    const metadata = await this.keychain.encryptMetadata(archive);
    const authKeyB64 = await this.keychain.authKeyB64();

    this.uploadRequest = uploadWs(
      encStream,
      metadata,
      authKeyB64,
      archive.timeLimit,
      archive.dlimit,
      bearerToken,
      p => {
        this.progress = [p, totalSize];
        this.emit('progress');
      }
    );

    if (this.cancelled) {
      this.uploadRequest.cancel();
      throw httpError(0);
    }

    this.msg = 'fileSizeProgress';
    this.emit('progress'); // HACK to kick MS Edge
    try {
      const result = await this.uploadRequest.result;
      this.msg = 'notifyUploadEncryptDone';
      this.uploadRequest = null;
      this.progress = [1, 1];
      const secretKey = arrayToB64(this.keychain.rawSecret);
      return new OwnedFile({
        id: result.id,
        url: `${result.url}#${secretKey}`,
        name: archive.name,
        size: archive.size,
        manifest: archive.manifest,
        time: result.duration,
        speed: archive.size / (result.duration / 1000),
        createdAt: Date.now(),
        expiresAt: Date.now() + archive.timeLimit * 1000,
        secretKey: secretKey,
        nonce: this.keychain.nonce,
        ownerToken: result.ownerToken,
        dlimit: archive.dlimit,
        timeLimit: archive.timeLimit
      });
    } catch (e) {
      this.msg = 'errorPageHeader';
      this.uploadRequest = null;
      throw e;
    }
  }
}
