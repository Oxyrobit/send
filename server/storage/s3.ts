import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  type S3ClientConfig
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { Readable } from 'stream';
import type { Logger } from '../log';
import type { StorageBackend, StorageConfig } from './types';

export default class S3Storage implements StorageBackend {
  readonly bucket: string;
  readonly s3: S3Client;

  constructor(
    config: Pick<
      StorageConfig,
      's3_bucket' | 's3_endpoint' | 's3_use_path_style_endpoint'
    >,
    readonly log?: Logger
  ) {
    this.bucket = config.s3_bucket;
    const cfg: S3ClientConfig = {
      forcePathStyle: !!config.s3_use_path_style_endpoint
    };
    if (config.s3_endpoint) {
      cfg.endpoint = config.s3_endpoint;
    }
    this.s3 = new S3Client(cfg);
  }

  async length(id: string): Promise<number> {
    const result = await this.s3.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: id })
    );
    return Number(result.ContentLength);
  }

  async getStream(id: string): Promise<Readable> {
    const result = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: id })
    );
    return result.Body as Readable;
  }

  async set(id: string, file: Readable): Promise<void> {
    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: id,
        Body: file
      }
    });
    // A failed or cancelled upload errors the source stream: abort the
    // multipart upload so no incomplete parts are left in the bucket.
    const onError = () => {
      upload.abort().catch(() => {});
    };
    file.on('error', onError);
    try {
      await upload.done();
    } finally {
      file.off('error', onError);
    }
  }

  async del(id: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: id })
    );
  }

  ping(): Promise<unknown> {
    return this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }
}
