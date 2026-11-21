import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type Metadata from '../metadata';

/** What our middlewares add to the express request. */
export interface SendRequest extends Request {
  language?: string;
  cspNonce?: string;
  nonce?: string;
  authorized?: boolean;
  meta?: Metadata;
  user?: string | null;
}

export type Handler = (
  req: SendRequest,
  res: Response,
  next: NextFunction
) => unknown;

/**
 * Express 4 ignores the promise an async handler returns: a rejection would
 * neither answer the request nor be caught. Forward it to the error handler.
 */
export function wrap(handler: Handler): RequestHandler {
  return function (req, res, next) {
    try {
      const result = handler(req as SendRequest, res, next);
      if (result && typeof (result as Promise<unknown>).catch === 'function') {
        (result as Promise<unknown>).catch(next);
      }
    } catch (e) {
      next(e);
    }
  };
}
