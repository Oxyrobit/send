import express, { type Express } from 'express';
import expressWs from 'express-ws';
import morgan from 'morgan';
import assets, { type DevMiddleware } from '../../common/assets';
import routes from '../routes';
import pages from '../routes/pages';
import wsUpload from '../routes/ws';
import tests from '../../test/frontend/routes';
import config from '../config';
import { wrap } from '../types/express';

const ID_REGEX = '([0-9a-fA-F]{10,16})';

interface DevServer {
  middleware: DevMiddleware;
}

/** webpack-dev-server `before` hook: the API next to the dev middleware. */
export default function dev(app: Express, devServer: DevServer): void {
  const wsapp = express();
  const { app: ws } = expressWs(wsapp, undefined, {
    wsOptions: { perMessageDeflate: false }
  });
  routes(wsapp);
  ws.ws('/api/ws', wsUpload);
  wsapp.listen(8081, config.listen_address);

  assets.setMiddleware(devServer.middleware);
  app.use(morgan('dev', { stream: process.stderr }));
  function android(req: express.Request, res: express.Response) {
    const index = devServer.middleware.fileSystem
      .readFileSync(devServer.middleware.getFilenameFromUrl('/android.html'))
      .toString()
      .replace(
        '<base href="file:///android_asset/" />',
        '<base href="http://localhost:8080/" />'
      );
    res.set('Content-Type', 'text/html');
    res.send(index);
  }
  if (process.env.ANDROID) {
    // map all html routes to the android index.html
    app.get('/', android);
    app.get(`/share/:id${ID_REGEX}`, android);
    app.get('/completed', android);
    app.get('/preferences', android);
    app.get('/options', android);
    app.get('/oauth', android);
  }
  routes(app);
  tests(app);
  // webpack-dev-server routes haven't been added yet
  // so wait for next tick to add 404 handler
  process.nextTick(() => app.use(wrap(pages.notfound)));
}
