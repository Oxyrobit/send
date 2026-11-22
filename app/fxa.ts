import { arrayToB64, b64ToArray } from './utils';
import type { Storage } from './storage';

interface JweHeader {
  alg: string;
  enc: string;
  epk: JsonWebKey;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function getOtherInfo(enc: string): Uint8Array<ArrayBuffer> {
  const name = encoder.encode(enc);
  const length = 256;
  const buffer = new ArrayBuffer(name.length + 16);
  const dv = new DataView(buffer);
  const result = new Uint8Array(buffer);
  let i = 0;
  dv.setUint32(i, name.length);
  i += 4;
  result.set(name, i);
  i += name.length;
  dv.setUint32(i, 0);
  i += 4;
  dv.setUint32(i, 0);
  i += 4;
  dv.setUint32(i, length);
  return result;
}

function concat(b1: Uint8Array, b2: Uint8Array): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(b1.length + b2.length);
  result.set(b1, 0);
  result.set(b2, b1.length);
  return result;
}

async function concatKdf(
  key: Uint8Array,
  enc: string
): Promise<Uint8Array<ArrayBuffer>> {
  if (key.length !== 32) {
    throw new Error('unsupported key length');
  }
  const otherInfo = getOtherInfo(enc);
  const buffer = new ArrayBuffer(4 + key.length + otherInfo.length);
  const dv = new DataView(buffer);
  const concat = new Uint8Array(buffer);
  dv.setUint32(0, 1);
  concat.set(key, 4);
  concat.set(otherInfo, key.length + 4);
  const result = await crypto.subtle.digest('SHA-256', concat);
  return new Uint8Array(result);
}

export async function prepareScopedBundleKey(
  storage: Storage
): Promise<string> {
  const keys = await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    true,
    ['deriveBits']
  );
  const privateJwk = await crypto.subtle.exportKey('jwk', keys.privateKey);
  const publicJwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
  const kid = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(JSON.stringify(publicJwk))
  );
  // NOTE: an ArrayBuffer serializes to `{}`; kept as is for compatibility
  // with what FxA has always received from Send.
  const privateWithKid = { ...privateJwk, kid };
  const publicWithKid = { ...publicJwk, kid };
  storage.set('scopedBundlePrivateKey', JSON.stringify(privateWithKid));
  return arrayToB64(encoder.encode(JSON.stringify(publicWithKid)));
}

export async function decryptBundle(
  storage: Storage,
  bundle: string
): Promise<Record<string, JsonWebKey>> {
  const privateJwk = JSON.parse(
    storage.get('scopedBundlePrivateKey') || 'null'
  ) as JsonWebKey | null;
  if (!privateJwk) {
    throw new Error('missing scoped bundle key');
  }
  storage.remove('scopedBundlePrivateKey');
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    privateJwk,
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    false,
    ['deriveBits']
  );
  const jweParts = bundle.split('.');
  if (jweParts.length !== 5) {
    throw new Error('invalid jwe');
  }
  const header = JSON.parse(
    decoder.decode(b64ToArray(jweParts[0]))
  ) as JweHeader;
  const additionalData = encoder.encode(jweParts[0]);
  const iv = b64ToArray(jweParts[2]);
  const ciphertext = b64ToArray(jweParts[3]);
  const tag = b64ToArray(jweParts[4]);

  if (header.alg !== 'ECDH-ES' || header.enc !== 'A256GCM') {
    throw new Error('unsupported jwe type');
  }

  const publicKey = await crypto.subtle.importKey(
    'jwk',
    header.epk,
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    false,
    []
  );
  const sharedBits = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: publicKey
    },
    privateKey,
    256
  );

  const rawSharedKey = await concatKdf(new Uint8Array(sharedBits), header.enc);
  const sharedKey = await crypto.subtle.importKey(
    'raw',
    rawSharedKey,
    {
      name: 'AES-GCM'
    },
    false,
    ['decrypt']
  );

  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv,
      additionalData: additionalData,
      tagLength: tag.length * 8
    },
    sharedKey,
    concat(ciphertext, tag)
  );

  return JSON.parse(decoder.decode(plaintext)) as Record<string, JsonWebKey>;
}

export async function preparePkce(storage: Storage): Promise<string> {
  const verifier = arrayToB64(crypto.getRandomValues(new Uint8Array(64)));
  storage.set('pkceVerifier', verifier);
  const challenge = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(verifier)
  );
  return arrayToB64(new Uint8Array(challenge));
}

export async function deriveFileListKey(ikm: string): Promise<string> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    b64ToArray(ikm),
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );
  const fileListKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      salt: new Uint8Array(),
      info: encoder.encode('fileList'),
      hash: 'SHA-256'
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: 128
    },
    true,
    ['encrypt', 'decrypt']
  );
  const rawFileListKey = await crypto.subtle.exportKey('raw', fileListKey);
  return arrayToB64(new Uint8Array(rawFileListKey));
}

export async function getFileListKey(
  storage: Storage,
  bundle: string,
  keyScope: string
): Promise<string> {
  const jwks = await decryptBundle(storage, bundle);
  const jwk = jwks[keyScope];
  if (!jwk || !jwk.k) {
    throw new Error('missing file list key');
  }
  return deriveFileListKey(jwk.k);
}
