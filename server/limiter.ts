import { Transform, type TransformCallback } from 'stream';

export const LIMIT_ERROR = 'limit';

/** Passes data through, and errors once more than `limit` bytes went by. */
export default class Limiter extends Transform {
  length = 0;

  constructor(private readonly limit: number) {
    super();
  }

  override _transform(
    chunk: Buffer,
    encoding: BufferEncoding,
    callback: TransformCallback
  ): void {
    this.length += chunk.length;
    if (this.length > this.limit) {
      return callback(new Error(LIMIT_ERROR));
    }
    callback(null, chunk);
  }
}

export function isLimitError(e: unknown): boolean {
  return e instanceof Error && e.message === LIMIT_ERROR;
}
