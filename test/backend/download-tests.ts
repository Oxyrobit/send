import assert from 'assert';
import { type EventEmitter } from 'events';
import { PassThrough, Writable } from 'stream';
import sinon from 'sinon';
import proxyquireBase from 'proxyquire';

const proxyquire = proxyquireBase.noCallThru();

const storage = {
  length: sinon.stub(),
  get: sinon.stub(),
  incrementField: sinon.stub(),
  del: sinon.stub()
};

const log = { error: sinon.stub(), info: sinon.stub() };

const download = proxyquire('../../server/routes/download', {
  '../storage': storage,
  '../log': () => log
}).default;

/** A response that collects what is written to it. */
class FakeResponse extends Writable {
  status?: number;
  body: Buffer[] = [];
  sendStatus = sinon.stub();
  writeHead(status: number) {
    this.status = status;
    return this;
  }
  override _write(chunk: Buffer, enc: BufferEncoding, cb: () => void) {
    this.body.push(chunk);
    cb();
  }
}

function finished(res: EventEmitter) {
  return new Promise(resolve => res.once('finish', resolve));
}

function tick() {
  return new Promise(resolve => setImmediate(resolve));
}

describe('/api/download', function () {
  afterEach(function () {
    Object.values(storage).forEach(s => s.reset());
  });

  it('sends a 404 when the file is missing', async function () {
    storage.length.rejects(new Error('no such file'));
    const res = new FakeResponse();
    await download({ params: { id: 'x' }, meta: { dl: 0, dlimit: 1 } }, res);
    sinon.assert.calledWith(res.sendStatus, 404);
  });

  it('deletes the file once the download limit is reached', async function () {
    const file = new PassThrough();
    storage.length.resolves(5);
    storage.get.resolves(file);
    storage.incrementField.resolves(2);
    const res = new FakeResponse();
    await download({ params: { id: 'x' }, meta: { dl: 1, dlimit: 2 } }, res);
    file.end('hello');
    await finished(res);
    await tick();
    assert.equal(Buffer.concat(res.body).toString(), 'hello');
    sinon.assert.calledWith(storage.incrementField, 'x', 'dl');
    sinon.assert.calledWith(storage.del, 'x');
  });

  it('keeps the file while downloads remain', async function () {
    const file = new PassThrough();
    storage.length.resolves(5);
    storage.get.resolves(file);
    storage.incrementField.resolves(1);
    const res = new FakeResponse();
    await download({ params: { id: 'x' }, meta: { dl: 0, dlimit: 2 } }, res);
    file.end('hello');
    await finished(res);
    await tick();
    sinon.assert.calledOnce(storage.incrementField);
    sinon.assert.notCalled(storage.del);
  });
});
