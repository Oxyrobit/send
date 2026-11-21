import { promisify } from 'util';
import redis from 'redis';
import redisMock from 'redis-mock';
import type { Config } from '../config';

type RedisConfig = Pick<
  Config,
  | 'env'
  | 'redis_host'
  | 'redis_port'
  | 'redis_user'
  | 'redis_password'
  | 'redis_db'
  | 'redis_retry_time'
  | 'redis_retry_delay'
>;

/** The callback based redis 3 client, with promise versions of what we use. */
export interface RedisClient extends redis.RedisClient {
  ttlAsync(key: string): Promise<number>;
  hgetallAsync(key: string): Promise<Record<string, string> | null>;
  hgetAsync(key: string, field: string): Promise<string | null>;
  hincrbyAsync(key: string, field: string, increment: number): Promise<number>;
  delAsync(key: string): Promise<number>;
  pingAsync(): Promise<string>;
  execAsync(multi: redis.Multi): Promise<unknown[]>;
}

export default function createRedisClient(config: RedisConfig): RedisClient {
  const lib =
    config.env === 'development' && config.redis_host === 'localhost'
      ? redisMock
      : redis;

  const clientConfig: redis.ClientOpts = {
    host: config.redis_host,
    port: config.redis_port,
    retry_strategy: options => {
      if (options.total_retry_time > config.redis_retry_time) {
        client.emit('error', 'Retry time exhausted');
        return new Error('Retry time exhausted');
      }
      return config.redis_retry_delay;
    }
  };
  if (config.redis_user) {
    (clientConfig as { user?: string }).user = config.redis_user;
  }
  if (config.redis_password) {
    clientConfig.password = config.redis_password;
  }
  if (config.redis_db) {
    clientConfig.db = config.redis_db;
  }
  const client = lib.createClient(clientConfig) as RedisClient;

  client.ttlAsync = promisify(client.ttl).bind(client);
  client.hgetallAsync = promisify(client.hgetall).bind(
    client
  ) as RedisClient['hgetallAsync'];
  client.hgetAsync = promisify(client.hget).bind(client);
  client.hincrbyAsync = promisify(client.hincrby).bind(client);
  client.delAsync = promisify(client.del).bind(
    client
  ) as RedisClient['delAsync'];
  client.pingAsync = promisify(client.ping).bind(
    client
  ) as RedisClient['pingAsync'];
  client.execAsync = (multi: redis.Multi) =>
    new Promise((resolve, reject) =>
      multi.exec((err, replies) => (err ? reject(err) : resolve(replies)))
    );
  return client;
}
