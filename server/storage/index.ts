import type { Readable } from 'stream';
import config, { type Config } from '../config';
import Metadata, { type StoredMetadata } from '../metadata';
import mozlog, { type Logger } from '../log';
import createRedisClient, { type RedisClient } from './redis';
import type { StorageBackend, StorageBackendCtor } from './types';

/**
 * Load a backend only when it is used: the cloud SDKs are big, and most
 * instances never need them.
 */
function backend(name: 's3' | 'gcs' | 'fs'): StorageBackendCtor {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const mod =
    name === 's3'
      ? require('./s3')
      : name === 'gcs'
        ? require('./gcs')
        : require('./fs');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return (mod.default || mod) as StorageBackendCtor;
}

function getPrefix(seconds: number): number {
  return Math.max(Math.floor(seconds / 86400), 1);
}

export class DB {
  readonly log: Logger;
  readonly storage: StorageBackend;
  readonly redis: RedisClient;

  constructor(config: Config) {
    this.log = mozlog('send.storage');
    const Storage = backend(
      config.s3_bucket ? 's3' : config.gcs_bucket ? 'gcs' : 'fs'
    );
    this.storage = new Storage(config, this.log);

    this.redis = createRedisClient(config);
    this.redis.on('error', (err: unknown) => {
      this.log.error('Redis:', err);
    });
  }

  async ttl(id: string): Promise<number> {
    const result = await this.redis.ttlAsync(id);
    return Math.ceil(result) * 1000;
  }

  async getPrefixedId(id: string): Promise<string> {
    const prefix = await this.redis.hgetAsync(id, 'prefix');
    if (!prefix) {
      throw new Error(`no such file: ${id}`);
    }
    return `${prefix}-${id}`;
  }

  async length(id: string): Promise<number> {
    const filePath = await this.getPrefixedId(id);
    return this.storage.length(filePath);
  }

  async get(id: string): Promise<Readable> {
    const filePath = await this.getPrefixedId(id);
    return this.storage.getStream(filePath);
  }

  async set(
    id: string,
    file: Readable,
    meta: Partial<Record<keyof StoredMetadata, string | number>> | null,
    expireSeconds = config.default_expire_seconds
  ): Promise<void> {
    const prefix = getPrefix(expireSeconds);
    const filePath = `${prefix}-${id}`;
    await this.storage.set(filePath, file);
    // One transaction, so the key can't be left without its expiry
    const multi = this.redis.multi();
    multi.hset(id, 'prefix', String(prefix));
    if (meta) {
      const fields: string[] = [];
      for (const [k, v] of Object.entries(meta)) {
        if (v !== undefined) fields.push(k, String(v));
      }
      if (fields.length) multi.hmset(id, fields);
    }
    multi.expire(id, expireSeconds);
    await this.redis.execAsync(multi);
  }

  setField(
    id: string,
    key: string,
    value: string | number | boolean
  ): Promise<unknown> {
    return new Promise((resolve, reject) =>
      this.redis.hset(id, key, String(value), (err, res) =>
        err ? reject(err) : resolve(res)
      )
    );
  }

  /** Increments a field and returns its new value. */
  incrementField(id: string, key: string, increment = 1): Promise<number> {
    return this.redis.hincrbyAsync(id, key, increment);
  }

  async del(id: string): Promise<void> {
    const filePath = await this.getPrefixedId(id);
    // Remove the metadata first: a file whose metadata is gone can't be
    // downloaded anymore, even when deleting the file itself fails.
    await this.redis.delAsync(id);
    await this.storage.del(filePath);
  }

  async ping(): Promise<void> {
    await this.redis.pingAsync();
    await this.storage.ping();
  }

  async metadata(id: string): Promise<Metadata | null> {
    const result = await this.redis.hgetallAsync(id);
    return result && new Metadata(result);
  }
}

export default new DB(config);
