import { blobStream, concatStream } from './streams';
import type { Manifest } from '../common/types';

function isDupe(newFile: File, array: File[]): boolean {
  return array.some(
    file =>
      newFile.name === file.name &&
      newFile.size === file.size &&
      newFile.lastModified === file.lastModified
  );
}

export default class Archive {
  files: File[];
  readonly defaultTimeLimit: number;
  readonly defaultDownloadLimit: number;
  timeLimit: number;
  dlimit: number;
  password: string | null;
  /** Only used while uploading, to identify the upload area */
  id?: string;

  constructor(
    files: Iterable<File> = [],
    defaultTimeLimit = 86400,
    defaultDownloadLimit = 1
  ) {
    this.files = Array.from(files);
    this.defaultTimeLimit = defaultTimeLimit;
    this.defaultDownloadLimit = defaultDownloadLimit;
    this.timeLimit = defaultTimeLimit;
    this.dlimit = defaultDownloadLimit;
    this.password = null;
  }

  get name(): string {
    return this.files.length > 1 ? 'Send-Archive.zip' : this.files[0].name;
  }

  get type(): string {
    return this.files.length > 1 ? 'send-archive' : this.files[0].type;
  }

  get size(): number {
    return this.files.reduce((total, file) => total + file.size, 0);
  }

  get numFiles(): number {
    return this.files.length;
  }

  get manifest(): Manifest {
    return {
      files: this.files.map(file => ({
        name: file.name,
        size: file.size,
        type: file.type
      }))
    };
  }

  get stream(): ReadableStream<Uint8Array> {
    return concatStream(this.files.map(file => blobStream(file)));
  }

  addFiles(files: File[], maxSize: number, maxFiles: number): boolean {
    if (this.files.length + files.length > maxFiles) {
      throw new Error('tooManyFiles');
    }
    const newFiles = files.filter(
      file => file.size > 0 && !isDupe(file, this.files)
    );
    const newSize = newFiles.reduce((total, file) => total + file.size, 0);
    if (this.size + newSize > maxSize) {
      throw new Error('fileTooBig');
    }
    this.files = this.files.concat(newFiles);
    return true;
  }

  remove(file: File): void {
    const index = this.files.indexOf(file);
    if (index > -1) {
      this.files.splice(index, 1);
    }
  }

  clear(): void {
    this.files = [];
    this.dlimit = this.defaultDownloadLimit;
    this.timeLimit = this.defaultTimeLimit;
    this.password = null;
  }
}
