import { Buffer } from 'buffer';
import { transformStream, type StreamController } from './streams';

const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 16;
type Mode = 'encrypt' | 'decrypt';
const MODE_ENCRYPT: Mode = 'encrypt';
const MODE_DECRYPT: Mode = 'decrypt';
export const ECE_RECORD_SIZE = 1024 * 64;

const encoder = new TextEncoder();

function generateSalt(len: number): ArrayBuffer {
  const randSalt = new Uint8Array(len);
  crypto.getRandomValues(randSalt);
  return randSalt.buffer;
}

/** A view of the bytes of `chunk`, without copying and without the bytes
 * outside of the view that `chunk.buffer` may also contain. */
/** WebCrypto only takes views over plain (non shared) ArrayBuffers. */
function bufferSource(b: Uint8Array): BufferSource {
  return b as Uint8Array<ArrayBuffer>;
}

function toBuffer(chunk: Uint8Array): Buffer {
  return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
}

interface Header {
  salt: ArrayBuffer;
  rs: number;
  length: number;
}

class ECETransformer {
  private prevChunk: Buffer | null = null;
  private seq = 0;
  private firstchunk = true;
  private readonly ikm: ArrayBuffer;
  private key!: CryptoKey;
  private nonceBase!: Buffer;

  constructor(
    private readonly mode: Mode,
    ikm: Uint8Array,
    private rs: number,
    private salt?: ArrayBuffer
  ) {
    this.ikm = ikm.slice().buffer;
  }

  private async importIkm(): Promise<CryptoKey> {
    return crypto.subtle.importKey('raw', this.ikm, 'HKDF', false, [
      'deriveKey'
    ]);
  }

  private async generateKey(): Promise<CryptoKey> {
    const inputKey = await this.importIkm();
    return crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        salt: this.salt as ArrayBuffer,
        info: encoder.encode('Content-Encoding: aes128gcm\0'),
        hash: 'SHA-256'
      },
      inputKey,
      {
        name: 'AES-GCM',
        length: 128
      },
      true, // Edge polyfill requires key to be extractable to encrypt :/
      ['encrypt', 'decrypt']
    );
  }

  private async generateNonceBase(): Promise<Buffer> {
    const inputKey = await this.importIkm();
    const base = await crypto.subtle.exportKey(
      'raw',
      await crypto.subtle.deriveKey(
        {
          name: 'HKDF',
          salt: this.salt as ArrayBuffer,
          info: encoder.encode('Content-Encoding: nonce\0'),
          hash: 'SHA-256'
        },
        inputKey,
        {
          name: 'AES-GCM',
          length: 128
        },
        true,
        ['encrypt', 'decrypt']
      )
    );
    return Buffer.from(base.slice(0, NONCE_LENGTH));
  }

  private generateNonce(seq: number): Buffer {
    if (seq > 0xffffffff) {
      throw new Error('record sequence number exceeds limit');
    }
    const nonce = Buffer.from(this.nonceBase);
    const m = nonce.readUIntBE(nonce.length - 4, 4);
    const xor = (m ^ seq) >>> 0; //forces unsigned int xor
    nonce.writeUIntBE(xor, nonce.length - 4, 4);
    return nonce;
  }

  private pad(data: Buffer, isLast: boolean): Buffer {
    const len = data.length;
    if (len + TAG_LENGTH >= this.rs) {
      throw new Error('data too large for record size');
    }
    if (isLast) {
      const padding = Buffer.alloc(1);
      padding.writeUInt8(2, 0);
      return Buffer.concat([data, padding]);
    }
    const padding = Buffer.alloc(this.rs - len - TAG_LENGTH);
    padding.writeUInt8(1, 0);
    return Buffer.concat([data, padding]);
  }

  private unpad(data: Buffer, isLast: boolean): Buffer {
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i]) {
        if (isLast) {
          if (data[i] !== 2) {
            throw new Error('delimiter of final record is not 2');
          }
        } else if (data[i] !== 1) {
          throw new Error('delimiter of not final record is not 1');
        }
        // slice: a view like subarray, but the browser Buffer polyfill only
        // returns a Buffer from slice
        return data.slice(0, i);
      }
    }
    throw new Error('no delimiter found');
  }

  private createHeader(): Buffer {
    const nums = Buffer.alloc(5);
    nums.writeUIntBE(this.rs, 0, 4);
    nums.writeUIntBE(0, 4, 1);
    return Buffer.concat([Buffer.from(this.salt as ArrayBuffer), nums]);
  }

  private readHeader(buffer: Buffer): Header {
    if (buffer.length < 21) {
      throw new Error('chunk too small for reading header');
    }
    const salt = new Uint8Array(KEY_LENGTH);
    salt.set(buffer.subarray(0, KEY_LENGTH));
    const rs = buffer.readUIntBE(KEY_LENGTH, 4);
    const idlen = buffer.readUInt8(KEY_LENGTH + 4);
    return { salt: salt.buffer, rs, length: idlen + KEY_LENGTH + 5 };
  }

  private async encryptRecord(
    buffer: Buffer,
    seq: number,
    isLast: boolean
  ): Promise<Buffer> {
    const nonce = this.generateNonce(seq);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: bufferSource(nonce) },
      this.key,
      bufferSource(this.pad(buffer, isLast))
    );
    return Buffer.from(encrypted);
  }

  private async decryptRecord(
    buffer: Buffer,
    seq: number,
    isLast: boolean
  ): Promise<Buffer> {
    const nonce = this.generateNonce(seq);
    const data = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: bufferSource(nonce),
        tagLength: 128
      },
      this.key,
      bufferSource(buffer)
    );
    return this.unpad(Buffer.from(data), isLast);
  }

  async start(controller: StreamController<Uint8Array>): Promise<void> {
    if (this.mode === MODE_ENCRYPT) {
      this.key = await this.generateKey();
      this.nonceBase = await this.generateNonceBase();
      controller.enqueue(this.createHeader());
    } else if (this.mode !== MODE_DECRYPT) {
      throw new Error('mode must be either encrypt or decrypt');
    }
  }

  private async transformPrevChunk(
    isLast: boolean,
    controller: StreamController<Uint8Array>
  ): Promise<void> {
    const chunk = this.prevChunk as Buffer;
    if (this.mode === MODE_ENCRYPT) {
      controller.enqueue(await this.encryptRecord(chunk, this.seq, isLast));
    } else if (this.seq === 0) {
      //the first chunk during decryption contains only the header
      const header = this.readHeader(chunk);
      this.salt = header.salt;
      this.rs = header.rs;
      this.key = await this.generateKey();
      this.nonceBase = await this.generateNonceBase();
    } else {
      controller.enqueue(await this.decryptRecord(chunk, this.seq - 1, isLast));
    }
    this.seq++;
  }

  async transform(
    chunk: Uint8Array,
    controller: StreamController<Uint8Array>
  ): Promise<void> {
    if (!this.firstchunk) {
      await this.transformPrevChunk(false, controller);
    }
    this.firstchunk = false;
    this.prevChunk = toBuffer(chunk);
  }

  async flush(controller: StreamController<Uint8Array>): Promise<void> {
    if (this.prevChunk) {
      await this.transformPrevChunk(true, controller);
    }
  }
}

class StreamSlicer {
  private chunkSize: number;
  private partialChunk: Uint8Array;
  private offset = 0;

  constructor(
    private readonly rs: number,
    private readonly mode: Mode
  ) {
    this.chunkSize = mode === MODE_ENCRYPT ? rs - 17 : 21;
    this.partialChunk = new Uint8Array(this.chunkSize); //where partial chunks are saved
  }

  private send(buf: Uint8Array, controller: StreamController<Uint8Array>) {
    controller.enqueue(buf);
    if (this.chunkSize === 21 && this.mode === MODE_DECRYPT) {
      this.chunkSize = this.rs;
    }
    this.partialChunk = new Uint8Array(this.chunkSize);
    this.offset = 0;
  }

  //reslice input into record sized chunks
  transform(chunk: Uint8Array, controller: StreamController<Uint8Array>): void {
    let i = 0;

    if (this.offset > 0) {
      const len = Math.min(chunk.byteLength, this.chunkSize - this.offset);
      this.partialChunk.set(chunk.subarray(0, len), this.offset);
      this.offset += len;
      i += len;

      if (this.offset === this.chunkSize) {
        this.send(this.partialChunk, controller);
      }
    }

    while (i < chunk.byteLength) {
      const remainingBytes = chunk.byteLength - i;
      if (remainingBytes >= this.chunkSize) {
        const record = chunk.slice(i, i + this.chunkSize);
        i += this.chunkSize;
        this.send(record, controller);
      } else {
        const end = chunk.subarray(i, i + remainingBytes);
        i += end.byteLength;
        this.partialChunk.set(end);
        this.offset = end.byteLength;
      }
    }
  }

  flush(controller: StreamController<Uint8Array>): void {
    if (this.offset > 0) {
      controller.enqueue(this.partialChunk.slice(0, this.offset));
    }
  }
}

/*
input: a ReadableStream containing data to be transformed
key:  Uint8Array containing key of size KEY_LENGTH
rs:   int containing record size, optional
salt: ArrayBuffer containing salt of KEY_LENGTH length, optional
*/
export function encryptStream(
  input: ReadableStream<Uint8Array>,
  key: Uint8Array,
  rs = ECE_RECORD_SIZE,
  salt: ArrayBuffer = generateSalt(KEY_LENGTH)
): ReadableStream<Uint8Array> {
  const inputStream = transformStream(
    input,
    new StreamSlicer(rs, MODE_ENCRYPT)
  );
  return transformStream(
    inputStream,
    new ECETransformer(MODE_ENCRYPT, key, rs, salt)
  );
}

/*
input: a ReadableStream containing data to be transformed
key:  Uint8Array containing key of size KEY_LENGTH
rs:   int containing record size, optional
*/
export function decryptStream(
  input: ReadableStream<Uint8Array>,
  key: Uint8Array,
  rs = ECE_RECORD_SIZE
): ReadableStream<Uint8Array> {
  const inputStream = transformStream(
    input,
    new StreamSlicer(rs, MODE_DECRYPT)
  );
  return transformStream(
    inputStream,
    new ECETransformer(MODE_DECRYPT, key, rs)
  );
}
