import storage from '../storage';
import type { Response } from 'express';
import type { SendRequest } from '../types/express';

export default async function info(req: SendRequest, res: Response) {
  try {
    const ttl = await storage.ttl(req.params.id);
    const meta = req.meta as NonNullable<SendRequest['meta']>;
    return res.send({
      dlimit: Number(meta.dlimit),
      dtotal: Number(meta.dl),
      ttl
    });
  } catch {
    res.sendStatus(404);
  }
}
