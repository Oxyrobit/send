export interface Transformer<I, O> {
  start?(controller: StreamController<O>): void | Promise<void>;
  transform(chunk: I, controller: StreamController<O>): void | Promise<void>;
  flush?(controller: StreamController<O>): void | Promise<void>;
}

/** The subset of TransformStreamDefaultController our transformers use. */
export interface StreamController<O> {
  enqueue(chunk: O): void;
}

export function transformStream<I, O>(
  readable: ReadableStream<I>,
  transformer: Transformer<I, O>,
  oncancel?: (reason?: unknown) => void
): ReadableStream<O> {
  try {
    return readable.pipeThrough(new TransformStream<I, O>(transformer));
  } catch {
    // Fallback for browsers without TransformStream support
    const reader = readable.getReader();
    return new ReadableStream<O>({
      start(controller) {
        if (transformer.start) {
          return transformer.start(controller);
        }
      },
      async pull(controller) {
        let enqueued = false;
        const wrappedController: StreamController<O> = {
          enqueue(d) {
            enqueued = true;
            controller.enqueue(d);
          }
        };
        while (!enqueued) {
          const data = await reader.read();
          if (data.done) {
            if (transformer.flush) {
              await transformer.flush(controller);
            }
            return controller.close();
          }
          await transformer.transform(data.value, wrappedController);
        }
      },
      cancel(reason) {
        reader.cancel(reason);
        if (oncancel) {
          oncancel(reason);
        }
      }
    });
  }
}

class BlobStreamController implements UnderlyingDefaultSource<Uint8Array> {
  private index = 0;
  private readonly chunkSize: number;

  constructor(
    private readonly blob: Blob,
    size?: number
  ) {
    this.chunkSize = size || 1024 * 64;
  }

  async pull(controller: ReadableStreamDefaultController<Uint8Array>) {
    const bytesLeft = this.blob.size - this.index;
    if (bytesLeft <= 0) {
      controller.close();
      return;
    }
    const size = Math.min(this.chunkSize, bytesLeft);
    const slice = this.blob.slice(this.index, this.index + size);
    this.index += size;
    controller.enqueue(new Uint8Array(await readAsArrayBuffer(slice)));
  }
}

function readAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

export function blobStream(
  blob: Blob,
  size?: number
): ReadableStream<Uint8Array> {
  return new ReadableStream(new BlobStreamController(blob, size));
}

class ConcatStreamController<T> implements UnderlyingDefaultSource<T> {
  private index = 0;
  private reader: ReadableStreamDefaultReader<T> | null = null;

  constructor(private readonly streams: ReadableStream<T>[]) {
    this.nextReader();
  }

  private nextReader() {
    const next = this.streams[this.index++];
    this.reader = next ? next.getReader() : null;
  }

  async pull(controller: ReadableStreamDefaultController<T>): Promise<void> {
    while (this.reader) {
      const data = await this.reader.read();
      if (!data.done) {
        controller.enqueue(data.value);
        return;
      }
      this.nextReader();
    }
    controller.close();
  }
}

export function concatStream<T>(
  streams: ReadableStream<T>[]
): ReadableStream<T> {
  return new ReadableStream(new ConcatStreamController(streams));
}
