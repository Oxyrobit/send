import sinon from 'sinon';
import proxyquireBase from 'proxyquire';

const proxyquire = proxyquireBase.noCallThru();

const storage = {
  setField: sinon.stub()
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function request(id: string, body: object): any {
  return {
    params: { id },
    body
  };
}

function response() {
  return {
    sendStatus: sinon.stub()
  };
}

const passwordRoute = proxyquire('../../server/routes/password', {
  '../storage': storage
}).default;

describe('/api/password', function () {
  afterEach(function () {
    storage.setField.reset();
  });

  it('calls storage.setField with the correct parameter', async function () {
    const req = request('x', { auth: 'z' });
    const res = response();
    await passwordRoute(req, res);
    sinon.assert.calledWith(storage.setField, 'x', 'auth', 'z');
    sinon.assert.calledWith(storage.setField, 'x', 'pwd', true);
    sinon.assert.calledWith(res.sendStatus, 200);
  });

  it('sends a 400 if auth is missing', async function () {
    const req = request('x', {});
    const res = response();
    await passwordRoute(req, res);
    sinon.assert.calledWith(res.sendStatus, 400);
  });

  it('sends a 404 on failure', async function () {
    storage.setField.throws(new Error());
    const req = request('x', { auth: 'z' });
    const res = response();
    await passwordRoute(req, res);
    sinon.assert.calledWith(res.sendStatus, 404);
  });
});
