import crypto from 'crypto';
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response
} from 'express';
import helmet from 'helmet';
import storage from '../storage';
import config, { trustProxySetting } from '../config';
import auth from '../middleware/auth';
import language from '../middleware/language';
import pages from './pages';
import filelist from './filelist';
import clientConstants from '../clientConstants';
import webmanifest from './webmanifest';
import download from './download';
import exists from './exists';
import metadata from './metadata';
import upload from './upload';
import deleteRoute from './delete';
import password from './password';
import params from './params';
import info from './info';
import mozlog from '../log';
import { DIST_DIR } from '../paths';
import { wrap, type SendRequest } from '../types/express';
import path from 'path';

const IS_DEV = config.env === 'development';
const ID_REGEX = '([0-9a-fA-F]{10,16})';
const log = mozlog('send.server');

/** Origins allowed by the CSP connect-src, for the websocket upload. */
function wsOrigin(req: Request): string {
  return config.deriveBaseUrl(req).replace(/^http(s?):\/\//, 'ws$1://');
}

export default function routes(app: Express): void {
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxySetting(config.trust_proxy));
  app.use(function (req, res, next) {
    (req as SendRequest).cspNonce = crypto.randomBytes(16).toString('hex');
    next();
  });
  const nonce = (req: unknown) => `'nonce-${(req as SendRequest).cspNonce}'`;
  app.use(
    helmet({
      contentSecurityPolicy: IS_DEV
        ? false
        : {
            useDefaults: false,
            directives: {
              defaultSrc: ["'self'"],
              connectSrc: [
                "'self'",
                (req: unknown) => wsOrigin(req as Request)
              ],
              imgSrc: ["'self'", 'data:'],
              scriptSrc: ["'self'", nonce],
              styleSrc: ["'self'", nonce],
              formAction: ["'none'"],
              frameAncestors: ["'none'"],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
              reportUri: ['/__cspreport__']
            }
          },
      strictTransportSecurity: IS_DEV ? false : { maxAge: 31536000 },
      // The page is never framed (frame-ancestors) and fetches nothing
      // cross-origin, the defaults are fine except for the user avatar which
      // may come from the FxA profile server.
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' }
    })
  );

  app.use(function (req, res, next) {
    res.set('Pragma', 'no-cache');
    res.set(
      'Cache-Control',
      'private, no-cache, no-store, must-revalidate, max-age=0'
    );
    next();
  });
  app.use(express.json());
  app.use(express.text());
  app.get('/', language, wrap(pages.index));
  app.get('/config', function (req, res) {
    res.json(clientConstants);
  });
  app.get('/error', language, wrap(pages.blank));
  app.get('/oauth', language, wrap(pages.blank));
  app.get('/login', language, wrap(pages.index));
  app.get('/app.webmanifest', language, wrap(webmanifest));
  app.get(`/download/:id${ID_REGEX}`, language, wrap(pages.download));
  app.get('/unsupported/:reason', language, wrap(pages.unsupported));
  app.get(`/api/download/:id${ID_REGEX}`, wrap(auth.hmac), wrap(download));
  app.get(`/api/download/blob/:id${ID_REGEX}`, wrap(auth.hmac), wrap(download));
  app.get(`/api/exists/:id${ID_REGEX}`, wrap(exists));
  app.get(`/api/metadata/:id${ID_REGEX}`, wrap(auth.hmac), wrap(metadata));
  app.get('/api/filelist/:id([\\w-]{16})', wrap(auth.fxa), wrap(filelist.get));
  app.post(
    '/api/filelist/:id([\\w-]{16})',
    wrap(auth.fxa),
    wrap(filelist.post)
  );
  app.post('/api/upload', wrap(auth.fxa), wrap(upload));
  app.post(`/api/delete/:id${ID_REGEX}`, wrap(auth.owner), wrap(deleteRoute));
  app.post(`/api/password/:id${ID_REGEX}`, wrap(auth.owner), wrap(password));
  app.post(
    `/api/params/:id${ID_REGEX}`,
    wrap(auth.owner),
    wrap(auth.fxa),
    wrap(params)
  );
  app.post(`/api/info/:id${ID_REGEX}`, wrap(auth.owner), wrap(info));
  app.get('/__version__', function (req, res) {
    res.sendFile(path.join(DIST_DIR, 'version.json'));
  });

  app.get('/__lbheartbeat__', function (req, res) {
    res.sendStatus(200);
  });

  app.get(
    '/__heartbeat__',
    wrap(async (req, res) => {
      try {
        await storage.ping();
        res.sendStatus(200);
      } catch {
        res.sendStatus(500);
      }
    })
  );
}

/** Last handler: log unexpected errors instead of leaking stack traces. */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const status =
    (err as { status?: number; statusCode?: number }).status ||
    (err as { statusCode?: number }).statusCode ||
    500;
  if (status >= 500) {
    log.error('RequestError', {
      path: req.path,
      err: err instanceof Error ? err.stack : String(err)
    });
  }
  if (res.headersSent) {
    return next(err);
  }
  res.sendStatus(status);
}
