import storage from '../storage';
import type { Response } from 'express';
import type { SendRequest } from '../types/express';

export default async function metadata(req: SendRequest, res: Response) {
  try {
    const ttl = await storage.ttl(req.params.id);
    const meta = req.meta as NonNullable<SendRequest['meta']>;
    res.send({
      metadata: meta.metadata,
      finalDownload: Number(meta.dl) + 1 === Number(meta.dlimit),
      ttl
    });
  } catch {
    res.sendStatus(404);
  }
}
