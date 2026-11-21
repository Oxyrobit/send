import crypto from 'crypto';
import storage from '../storage';
import config from '../config';
import fxa from '../fxa';
import type { Response, NextFunction } from 'express';
import type { SendRequest } from '../types/express';

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default {
  /** Checks the HMAC of the current nonce, signed with the file's auth key. */
  hmac: async function (req: SendRequest, res: Response, next: NextFunction) {
    const id = req.params.id;
    const authHeader = req.header('Authorization');
    let authorized = false;
    if (id && authHeader) {
      try {
        const auth = authHeader.split(' ')[1] || '';
        const meta = await storage.metadata(id);
        if (!meta) {
          return res.sendStatus(404);
        }
        const hmac = crypto.createHmac(
          'sha256',
          Buffer.from(meta.auth, 'base64')
        );
        hmac.update(Buffer.from(meta.nonce, 'base64'));
        const verifyHash = hmac.digest();
        if (safeEqual(verifyHash, Buffer.from(auth, 'base64'))) {
          const nonce = crypto.randomBytes(16).toString('base64');
          // Rotate the nonce before answering, so a signature can't be replayed
          await storage.setField(id, 'nonce', nonce);
          req.nonce = nonce;
          res.set('WWW-Authenticate', `send-v1 ${nonce}`);
          req.meta = meta;
          authorized = true;
        } else {
          res.set('WWW-Authenticate', `send-v1 ${meta.nonce}`);
        }
      } catch {
        authorized = false;
      }
    }
    req.authorized = authorized;
    if (authorized) {
      next();
    } else {
      res.sendStatus(401);
    }
  },

  /** Checks the owner token, given to the uploader only. */
  owner: async function (req: SendRequest, res: Response, next: NextFunction) {
    const id = req.params.id;
    const ownerToken = req.body && req.body.owner_token;
    let authorized = false;
    if (id && typeof ownerToken === 'string') {
      try {
        const meta = await storage.metadata(id);
        if (!meta) {
          return res.sendStatus(404);
        }
        req.meta = meta;
        authorized = safeEqual(
          Buffer.from(meta.owner, 'utf8'),
          Buffer.from(ownerToken, 'utf8')
        );
      } catch {
        authorized = false;
      }
    }
    req.authorized = authorized;
    if (authorized) {
      next();
    } else {
      res.sendStatus(401);
    }
  },

  /** Resolves the FxA user of a bearer token, if any. */
  fxa: async function (req: SendRequest, res: Response, next: NextFunction) {
    const authHeader = req.header('Authorization');
    if (authHeader && /^Bearer\s/i.test(authHeader)) {
      const token = authHeader.split(' ')[1];
      req.user = await fxa.verify(token);
    }

    if (config.fxa_required && !req.user) {
      res.sendStatus(401);
    } else {
      next();
    }
  }
};
