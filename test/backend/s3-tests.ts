import assert from 'assert';
import sinon from 'sinon';
import proxyquireBase from 'proxyquire';
import type { Readable } from 'stream';

const proxyquire = proxyquireBase.noCallThru();

// Stand-ins for the AWS SDK v3 commands: they just keep their input
class Command {
  constructor(readonly input: Record<string, unknown>) {}
}
class HeadObjectCommand extends Command {}
class GetObjectCommand extends Command {}
class DeleteObjectCommand extends Command {}
class HeadBucketCommand extends Command {}

const send = sinon.stub();
const clientConfigs: unknown[] = [];
class S3Client {
  send = send;
  constructor(cfg: unknown) {
    clientConfigs.push(cfg);
  }
}

const uploads: { params: Record<string, unknown> }[] = [];
let uploadResult: () => Promise<unknown> = () => Promise.resolve();
const abort = sinon.stub().resolves();
class Upload {
  params: Record<string, unknown>;
  abort = abort;
  constructor(opts: { params: Record<string, unknown> }) {
    this.params = opts.params;
    uploads.push(this);
  }
  done() {
    return uploadResult();
  }
}

const S3Storage = proxyquire('../../server/storage/s3', {
  '@aws-sdk/client-s3': {
    S3Client,
    HeadObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadBucketCommand
  },
  '@aws-sdk/lib-storage': { Upload }
}).default;

function fakeFile() {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    on(ev: string, fn: () => void) {
      (listeners[ev] = listeners[ev] || []).push(fn);
      return this;
    },
    off(ev: string, fn: () => void) {
      listeners[ev] = (listeners[ev] || []).filter(f => f !== fn);
      return this;
    },
    emit(ev: string) {
      (listeners[ev] || []).forEach(f => f());
    }
  } as unknown as Readable & { emit(ev: string): void };
}

function sentCommand(): Command {
  return send.lastCall.args[0] as Command;
}

describe('S3Storage', function () {
  afterEach(function () {
    send.reset();
    abort.resetHistory();
    uploads.length = 0;
    clientConfigs.length = 0;
    uploadResult = () => Promise.resolve();
  });

  it('uses config.s3_bucket', function () {
    const s = new S3Storage({ s3_bucket: 'foo' });
    assert.equal(s.bucket, 'foo');
  });

  it('configures the endpoint and path style', function () {
    new S3Storage({
      s3_bucket: 'foo',
      s3_endpoint: 'http://minio:9000',
      s3_use_path_style_endpoint: true
    });
    assert.deepEqual(clientConfigs[0], {
      endpoint: 'http://minio:9000',
      forcePathStyle: true
    });
  });

  describe('length', function () {
    it('returns the ContentLength', async function () {
      send.resolves({ ContentLength: 123 });
      const s = new S3Storage({ s3_bucket: 'foo' });
      const len = await s.length('x');
      assert.equal(len, 123);
      assert.ok(sentCommand() instanceof HeadObjectCommand);
      assert.deepEqual(sentCommand().input, { Bucket: 'foo', Key: 'x' });
    });

    it('throws when id not found', async function () {
      const err = new Error();
      send.rejects(err);
      const s = new S3Storage({ s3_bucket: 'foo' });
      await assert.rejects(s.length('x'), e => e === err);
    });
  });

  describe('getStream', function () {
    it('returns the object body', async function () {
      const stream = {};
      send.resolves({ Body: stream });
      const s = new S3Storage({ s3_bucket: 'foo' });
      const result = await s.getStream('x');
      assert.equal(result, stream);
      assert.ok(sentCommand() instanceof GetObjectCommand);
      assert.deepEqual(sentCommand().input, { Bucket: 'foo', Key: 'x' });
    });
  });

  describe('set', function () {
    it('uploads the file', async function () {
      const file = fakeFile();
      const s = new S3Storage({ s3_bucket: 'foo' });
      await s.set('x', file);
      assert.equal(uploads.length, 1);
      assert.deepEqual(uploads[0].params, {
        Bucket: 'foo',
        Key: 'x',
        Body: file
      });
      sinon.assert.notCalled(abort);
    });

    it('aborts the upload when the source stream errors', async function () {
      const file = fakeFile();
      const err = new Error('limit');
      uploadResult = () => {
        file.emit('error');
        return Promise.reject(err);
      };
      const s = new S3Storage({ s3_bucket: 'foo' });
      await assert.rejects(
        s.set('x', file),
        e => (e as Error).message === 'limit'
      );
      sinon.assert.calledOnce(abort);
    });

    it('throws when the upload fails', async function () {
      const err = new Error();
      uploadResult = () => Promise.reject(err);
      const s = new S3Storage({ s3_bucket: 'foo' });
      await assert.rejects(s.set('x', fakeFile()), e => e === err);
    });
  });

  describe('del', function () {
    it('deletes the object', async function () {
      send.resolves({});
      const s = new S3Storage({ s3_bucket: 'foo' });
      await s.del('x');
      assert.ok(sentCommand() instanceof DeleteObjectCommand);
      assert.deepEqual(sentCommand().input, { Bucket: 'foo', Key: 'x' });
    });
  });

  describe('ping', function () {
    it('checks the bucket', async function () {
      send.resolves(true);
      const s = new S3Storage({ s3_bucket: 'foo' });
      const result = await s.ping();
      assert.equal(result, true);
      assert.ok(sentCommand() instanceof HeadBucketCommand);
      assert.deepEqual(sentCommand().input, { Bucket: 'foo' });
    });
  });
});
