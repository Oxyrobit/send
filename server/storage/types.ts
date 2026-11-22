import type { Readable } from 'stream';
import type { Logger } from '../log';
import type { Config } from '../config';

/** A place to keep the encrypted files. Metadata lives in redis. */
export interface StorageBackend {
  length(id: string): Promise<number>;
  getStream(id: string): Readable | Promise<Readable>;
  set(id: string, file: Readable): Promise<unknown>;
  del(id: string): Promise<unknown>;
  ping(): Promise<unknown>;
}

export type StorageConfig = Pick<
  Config,
  | 's3_bucket'
  | 's3_endpoint'
  | 's3_use_path_style_endpoint'
  | 'gcs_bucket'
  | 'file_dir'
>;

export type StorageBackendCtor = new (
  config: StorageConfig,
  log: Logger
) => StorageBackend;
