import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import type { Readable } from 'stream';
import type { Logger } from '../log';
import type { StorageBackend, StorageConfig } from './types';

export default class FSStorage implements StorageBackend {
  readonly dir: string;

  constructor(
    config: Pick<StorageConfig, 'file_dir'>,
    readonly log?: Logger
  ) {
    this.dir = path.resolve(config.file_dir);
    fs.mkdirSync(this.dir, {
      recursive: true
    });
  }

  /** The path of a stored file, refusing ids that would leave the directory. */
  private filePath(id: string): string {
    const filepath = path.join(this.dir, id);
    if (path.dirname(filepath) !== this.dir) {
      throw new Error(`invalid file id: ${id}`);
    }
    return filepath;
  }

  async length(id: string): Promise<number> {
    const result = await fs.promises.stat(this.filePath(id));
    return result.size;
  }

  getStream(id: string): Readable {
    return fs.createReadStream(this.filePath(id));
  }

  async set(id: string, file: Readable): Promise<void> {
    const filepath = this.filePath(id);
    try {
      // pipeline closes the file and destroys both streams on error, so a
      // failed or cancelled upload leaks no file descriptor
      await pipeline(file, fs.createWriteStream(filepath));
    } catch (err) {
      await fs.promises.rm(filepath, { force: true });
      throw err;
    }
  }

  async del(id: string): Promise<void> {
    await fs.promises.unlink(this.filePath(id));
  }

  ping(): Promise<void> {
    return fs.promises.access(this.dir, fs.constants.W_OK);
  }
}
