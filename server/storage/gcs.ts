import { Storage } from '@google-cloud/storage';
import type { Bucket } from '@google-cloud/storage';
import type { Readable } from 'stream';
import type { Logger } from '../log';
import type { StorageBackend, StorageConfig } from './types';

let client: Storage | null = null;

export default class GCSStorage implements StorageBackend {
  readonly bucket: Bucket;

  constructor(
    config: Pick<StorageConfig, 'gcs_bucket'>,
    readonly log?: Logger
  ) {
    // Created on first use: the client looks for credentials when created
    client = client || new Storage();
    this.bucket = client.bucket(config.gcs_bucket);
  }

  async length(id: string): Promise<number> {
    const data = await this.bucket.file(id).getMetadata();
    return Number(data[0].size);
  }

  getStream(id: string): Readable {
    return this.bucket.file(id).createReadStream({ validation: false });
  }

  set(id: string, file: Readable): Promise<void> {
    return new Promise((resolve, reject) => {
      const fstream = this.bucket.file(id).createWriteStream({
        validation: false,
        resumable: true
      });
      // A failed or cancelled upload errors the source stream. Stop the
      // resumable upload so nothing is stored.
      file.on('error', err => {
        fstream.destroy(err);
        reject(err);
      });
      file.pipe(fstream).on('error', reject).on('finish', resolve);
    });
  }

  async del(id: string): Promise<void> {
    await this.bucket.file(id).delete();
  }

  ping(): Promise<unknown> {
    return this.bucket.exists();
  }
}
