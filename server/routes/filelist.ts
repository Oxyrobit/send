import crypto from 'crypto';
import config from '../config';
import storage from '../storage';
import Limiter, { isLimitError } from '../limiter';
import type { Response } from 'express';
import type { SendRequest } from '../types/express';

const MAX_FILELIST_SIZE = 1024 * 1024 * 10;

function id(user: string, kid: string): string {
  const sha = crypto.createHash('sha256');
  sha.update(user);
  sha.update(kid);
  const hash = sha.digest('hex');
  return `filelist-${hash}`;
}

export default {
  async get(req: SendRequest, res: Response) {
    const kid = req.params.id;
    if (!req.user) {
      return res.sendStatus(401);
    }
    try {
      const fileId = id(req.user, kid);
      const contentLength = await storage.length(fileId);
      const fileStream = await storage.get(fileId);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': contentLength
      });
      fileStream.pipe(res);
    } catch {
      res.sendStatus(404);
    }
  },

  async post(req: SendRequest, res: Response) {
    const kid = req.params.id;
    if (!req.user) {
      return res.sendStatus(401);
    }
    try {
      const limiter = new Limiter(MAX_FILELIST_SIZE);
      req.on('error', err => limiter.destroy(err));
      const fileStream = req.pipe(limiter);
      await storage.set(
        id(req.user, kid),
        fileStream,
        null,
        config.max_expire_seconds
      );
      res.sendStatus(200);
    } catch (e) {
      if (isLimitError(e)) {
        return res.sendStatus(413);
      }
      res.sendStatus(500);
    }
  }
};
