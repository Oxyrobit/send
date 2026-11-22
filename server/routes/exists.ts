import storage from '../storage';
import type { Response } from 'express';
import type { SendRequest } from '../types/express';

export default async function exists(req: SendRequest, res: Response) {
  try {
    const meta = await storage.metadata(req.params.id);
    if (!meta) {
      return res.sendStatus(404);
    }
    res.set('WWW-Authenticate', `send-v1 ${meta.nonce}`);
    res.send({
      requiresPassword: meta.pwd
    });
  } catch {
    res.sendStatus(404);
  }
}
