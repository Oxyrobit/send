import express, { type Express } from 'express';
import expressWs from 'express-ws';
import routes, { errorHandler } from './routes';
import pages from './routes/pages';
import wsUpload from './routes/ws';
import { DIST_DIR } from './paths';
import { wrap } from './types/express';

const IMMUTABLE = 'public, max-age=31536000, immutable';

/** The production application: API, pages, and the built frontend. */
export default function createApp(): Express {
  const app = express();
  const { app: wsApp } = expressWs(app, undefined, {
    wsOptions: { perMessageDeflate: false }
  });

  routes(app);
  wsApp.ws('/api/ws', wsUpload);

  app.use(
    express.static(DIST_DIR, {
      index: false,
      setHeaders: function (res, filePath) {
        if (!/serviceWorker\.js$/.test(filePath)) {
          res.set('Cache-Control', IMMUTABLE);
        }
        res.removeHeader('Pragma');
      }
    })
  );

  app.use(wrap(pages.notfound));
  app.use(errorHandler);
  return app;
}
