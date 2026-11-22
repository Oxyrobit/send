/* eslint-disable no-console */
// End to end check of a running server: upload a file over the websocket
// API, download it once, and check it is gone afterwards.
//   SEND_URL=http://localhost:1443 node test/smoke/smoke.mts
import assert from 'assert';
import crypto from 'crypto';

const base = (process.env.SEND_URL || 'http://localhost:1443').replace(
  /\/$/,
  ''
);
const wsUrl = base.replace(/^http/, 'ws') + '/api/ws';

const b64url = (b: Buffer) => b.toString('base64url');

function nextMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    ws.addEventListener('message', e => resolve(JSON.parse(String(e.data))), {
      once: true
    });
    ws.addEventListener('error', () => reject(new Error('ws error')), {
      once: true
    });
  });
}

async function upload(data: Buffer, authKey: Buffer) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('cannot connect')), {
      once: true
    });
  });
  const info = nextMessage(ws);
  ws.send(
    JSON.stringify({
      fileMetadata: b64url(crypto.randomBytes(32)),
      authorization: `send-v1 ${b64url(authKey)}`,
      timeLimit: 300,
      dlimit: 1
    })
  );
  const meta = await info;
  assert.ok(meta.id && meta.url && meta.ownerToken, JSON.stringify(meta));
  const done = nextMessage(ws);
  for (let i = 0; i < data.length; i += 64 * 1024) {
    ws.send(new Uint8Array(data.subarray(i, i + 64 * 1024)));
  }
  ws.send(new Uint8Array([0]));
  assert.deepEqual(await done, { ok: true });
  ws.close();
  return meta as { id: string; url: string; ownerToken: string };
}

function sign(authKey: Buffer, nonce: string): string {
  const sig = crypto
    .createHmac('sha256', authKey)
    .update(Buffer.from(nonce, 'base64'))
    .digest();
  return `send-v1 ${b64url(sig)}`;
}

async function main() {
  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200, 'GET /');
  assert.match(await home.text(), /<html/);
  console.log(
    'ok  GET / (csp: %s)',
    home.headers.has('content-security-policy')
  );

  const hb = await fetch(`${base}/__heartbeat__`);
  assert.equal(hb.status, 200, 'heartbeat (redis + storage)');
  console.log('ok  GET /__heartbeat__');

  const data = crypto.randomBytes(300 * 1024 + 7);
  const authKey = crypto.randomBytes(64);
  const { id } = await upload(data, authKey);
  console.log('ok  websocket upload', id);

  const exists = await fetch(`${base}/api/exists/${id}`);
  assert.equal(exists.status, 200);
  const nonce = (exists.headers.get('www-authenticate') || '').split(' ')[1];
  assert.ok(nonce, 'nonce');

  const bad = await fetch(`${base}/api/download/${id}`, {
    headers: { Authorization: sign(crypto.randomBytes(64), nonce) }
  });
  assert.equal(bad.status, 401, 'download with a wrong key');
  const nonce2 = (bad.headers.get('www-authenticate') || '').split(' ')[1];

  const dl = await fetch(`${base}/api/download/${id}`, {
    headers: { Authorization: sign(authKey, nonce2) }
  });
  assert.equal(dl.status, 200, 'download');
  const body = Buffer.from(await dl.arrayBuffer());
  assert.ok(body.equals(data), 'downloaded bytes differ');
  console.log('ok  download', body.length, 'bytes');

  // dlimit was 1: the file is deleted after its first download
  for (let i = 0; i < 20; i++) {
    const gone = await fetch(`${base}/api/exists/${id}`);
    if (gone.status === 404) {
      console.log('ok  deleted after the last download');
      return;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  assert.fail('file still exists after its last download');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
