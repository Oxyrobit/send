import expressWs from 'express-ws';
import type { Express } from 'express';
import assets, { type DevMiddleware } from '../../common/assets';
import routes from '../routes';
import pages from '../routes/pages';
import wsUpload from '../routes/ws';
import tests from '../../test/frontend/routes';
import { wrap } from '../types/express';

/** The API and the test page, for test/frontend/runner.ts */
export default function testServer(
  app: Express,
  devServer: { middleware: DevMiddleware }
): void {
  assets.setMiddleware(devServer.middleware);
  const { app: ws } = expressWs(app, undefined, {
    wsOptions: { perMessageDeflate: false }
  });
  routes(app);
  ws.ws('/api/ws', wsUpload);
  tests(app);
  // webpack-dev-server routes haven't been added yet
  // so wait for next tick to add 404 handler
  process.nextTick(() => app.use(wrap(pages.notfound)));
}
