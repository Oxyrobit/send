import nanotiming from 'nanotiming';
import routes from '../../app/routes';
import storage from '../storage';
import state from '../state';
import type { Response, NextFunction } from 'express';
import type { SendRequest } from '../types/express';

// choo times every render with nanotiming, which in Node adds entries to the
// global performance timeline that are never cleared. Nothing reads them on the
// server, and they leak heap on every rendered page until we run out of memory.
nanotiming.disabled = true;

// The router only holds the route table, one for the whole process is enough
const app = routes();

function stripEvents(str: string): string {
  // For CSP we need to remove all the event handler placeholders.
  // It's ok, app.js will add them when it attaches to the DOM.
  return str.replace(/\son\w+=""/g, '');
}

function render(location: string, appState: object): string {
  return stripEvents(
    app.toString(location, appState as Parameters<typeof app.toString>[1])
  );
}

export default {
  index: async function (req: SendRequest, res: Response) {
    const appState = await state(req);
    res.send(render('/blank', appState));
  },

  blank: async function (req: SendRequest, res: Response) {
    const appState = await state(req);
    res.send(render('/blank', appState));
  },

  download: async function (
    req: SendRequest,
    res: Response,
    next: NextFunction
  ) {
    const id = req.params.id;
    const appState = await state(req);
    try {
      const meta = await storage.metadata(id);
      if (!meta) {
        return next();
      }
      const { nonce, pwd } = meta;
      res.set('WWW-Authenticate', `send-v1 ${nonce}`);
      res.send(
        render(
          `/download/${id}`,
          Object.assign(appState, {
            downloadMetadata: { nonce, pwd }
          })
        )
      );
    } catch {
      next();
    }
  },

  unsupported: async function (req: SendRequest, res: Response) {
    const appState = await state(req);
    res.send(render(`/unsupported/${req.params.reason}`, appState));
  },

  notfound: async function (req: SendRequest, res: Response) {
    const appState = await state(req);
    res
      .status(404)
      .send(
        render(
          '/404',
          Object.assign(appState, { downloadMetadata: { status: 404 } })
        )
      );
  }
};
