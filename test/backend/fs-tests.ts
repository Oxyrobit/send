import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PassThrough } from 'stream';
import FSStorage from '../../server/storage/fs';

describe('FSStorage', function () {
  let dir: string;
  let storage: FSStorage;

  beforeEach(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'send-fs-test-'));
    storage = new FSStorage({ file_dir: dir });
  });

  afterEach(function () {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('stores, measures, reads and deletes a file', async function () {
    const file = new PassThrough();
    const done = storage.set('1-abc', file);
    file.end('hello');
    await done;
    assert.equal(await storage.length('1-abc'), 5);
    const chunks: Buffer[] = [];
    for await (const chunk of storage.getStream('1-abc')) {
      chunks.push(chunk as Buffer);
    }
    assert.equal(Buffer.concat(chunks).toString(), 'hello');
    await storage.del('1-abc');
    assert.ok(!fs.existsSync(path.join(dir, '1-abc')));
  });

  it('removes the partial file when the upload errors', async function () {
    const file = new PassThrough();
    const done = storage.set('1-partial', file);
    file.write('part');
    file.destroy(new Error('Upload cancelled'));
    await assert.rejects(done, /Upload cancelled/);
    assert.ok(!fs.existsSync(path.join(dir, '1-partial')));
  });

  it('refuses ids that leave the storage directory', async function () {
    await assert.rejects(storage.length('../etc/passwd'), /invalid file id/);
    assert.throws(() => storage.getStream('a/../../x'), /invalid file id/);
  });

  it('rejects when deleting a missing file', async function () {
    await assert.rejects(storage.del('1-missing'));
  });

  it('pings a writable directory', async function () {
    await storage.ping();
  });
});
