import sinon from 'sinon';
import proxyquireBase from 'proxyquire';

const proxyquire = proxyquireBase.noCallThru();

const storage = {
  del: sinon.stub(),
  ttl: sinon.stub()
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function request(id: string): any {
  return {
    params: { id }
  };
}

function response() {
  return {
    sendStatus: sinon.stub()
  };
}

const delRoute = proxyquire('../../server/routes/delete', {
  '../storage': storage
}).default;

describe('/api/delete', function () {
  afterEach(function () {
    storage.del.reset();
  });

  it('calls storage.del with the id parameter', async function () {
    const req = request('x');
    const res = response();
    await delRoute(req, res);
    sinon.assert.calledWith(storage.del, 'x');
    sinon.assert.calledWith(res.sendStatus, 200);
  });

  it('sends a 404 on failure', async function () {
    storage.del.returns(Promise.reject(new Error()));
    const res = response();
    await delRoute(request('x'), res);
    sinon.assert.calledWith(res.sendStatus, 404);
  });
});
