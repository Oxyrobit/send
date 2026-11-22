import { arrayToB64, isFile } from './utils';
import OwnedFile, { type OwnedFileData } from './ownedFile';

type Engine = Pick<
  globalThis.Storage,
  'length' | 'getItem' | 'setItem' | 'removeItem' | 'key'
>;

/** In-memory fallback when localStorage is not available. */
class Mem implements Engine {
  private readonly items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  getItem(key: string): string | null {
    const value = this.items.get(key);
    return value === undefined ? null : value;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, String(value));
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  key(i: number): string | null {
    const key = Array.from(this.items.keys())[i];
    return key === undefined ? null : key;
  }
}

export interface MergeResult {
  incoming: boolean;
  outgoing: boolean;
  downloadCount: boolean;
}

export class Storage {
  private readonly engine: Engine;
  private _files: Map<string, OwnedFile>;

  constructor() {
    let engine: Engine;
    try {
      engine = localStorage || new Mem();
    } catch {
      engine = new Mem();
    }
    this.engine = engine;
    this._files = this.loadFiles();
  }

  private loadFiles(): Map<string, OwnedFile> {
    const fs = new Map<string, OwnedFile>();
    // Iterate over a snapshot, since broken entries get removed on the way
    const keys: string[] = [];
    for (let i = 0; i < this.engine.length; i++) {
      const k = this.engine.key(i);
      if (isFile(k)) {
        keys.push(k);
      }
    }
    for (const k of keys) {
      try {
        const data = JSON.parse(this.engine.getItem(k) || '') as OwnedFileData;
        const f = new OwnedFile(data);
        if (!f.id && data.fileId) {
          f.id = data.fileId;
        }
        fs.set(f.id, f);
      } catch {
        // obviously you're not a golfer
        this.engine.removeItem(k);
      }
    }
    return fs;
  }

  get id(): string {
    let id = this.engine.getItem('device_id');
    if (!id) {
      id = arrayToB64(crypto.getRandomValues(new Uint8Array(16)));
      this.engine.setItem('device_id', id);
    }
    return id;
  }

  get totalDownloads(): number {
    return Number(this.engine.getItem('totalDownloads'));
  }
  set totalDownloads(n: number) {
    this.engine.setItem('totalDownloads', String(n));
  }
  get totalUploads(): number {
    return Number(this.engine.getItem('totalUploads'));
  }
  set totalUploads(n: number) {
    this.engine.setItem('totalUploads', String(n));
  }
  get referrer(): string | null {
    return this.engine.getItem('referrer');
  }
  set referrer(str: string | null) {
    this.engine.setItem('referrer', String(str));
  }
  get enrolled(): Record<string, string | number> {
    try {
      return JSON.parse(this.engine.getItem('ab_experiments') || '{}');
    } catch {
      return {};
    }
  }

  enroll(id: string, variant: string | number): void {
    this.engine.setItem('ab_experiments', JSON.stringify({ [id]: variant }));
  }

  get files(): OwnedFile[] {
    return Array.from(this._files.values()).sort(
      (a, b) => a.createdAt - b.createdAt
    );
  }

  get user(): Record<string, unknown> | null {
    try {
      return JSON.parse(this.engine.getItem('user') || 'null');
    } catch {
      return null;
    }
  }

  set user(info: Record<string, unknown> | null) {
    this.engine.setItem('user', JSON.stringify(info));
  }

  getFileById(id: string): OwnedFile | undefined {
    return this._files.get(id);
  }

  get(id: string): string | null {
    return this.engine.getItem(id);
  }

  set(id: string, value: string): void {
    this.engine.setItem(id, value);
  }

  remove(property: string): void {
    if (isFile(property)) {
      this._files.delete(property);
    }
    this.engine.removeItem(property);
  }

  addFile(file: OwnedFile): void {
    this._files.set(file.id, file);
    this.writeFile(file);
  }

  writeFile(file: OwnedFile): void {
    this.engine.setItem(file.id, JSON.stringify(file));
  }

  writeFiles(): void {
    this._files.forEach(f => this.writeFile(f));
  }

  clearLocalFiles(): void {
    this._files.forEach(f => this.engine.removeItem(f.id));
    this._files = new Map();
  }

  async merge(files: OwnedFileData[] = []): Promise<MergeResult> {
    let incoming = false;
    let outgoing = false;
    let downloadCount = false;
    for (const f of files) {
      if (!this.getFileById(f.id)) {
        this.addFile(new OwnedFile(f));
        incoming = true;
      }
    }
    const workingFiles = this.files;
    // Refresh all download counts in parallel instead of one request at a time
    const changed = await Promise.all(
      workingFiles.map(f => f.updateDownloadCount())
    );
    workingFiles.forEach((f, i) => {
      const cc = changed[i];
      if (cc) {
        this.writeFile(f);
      }
      downloadCount = downloadCount || cc;
      outgoing = outgoing || f.expired;
      if (f.expired) {
        this.remove(f.id);
      } else if (!files.find(x => x.id === f.id)) {
        outgoing = true;
      }
    });
    return {
      incoming,
      outgoing,
      downloadCount
    };
  }
}

export default new Storage();
