import config from '../config';
import storage from '../storage';
import type { Response } from 'express';
import type { SendRequest } from '../types/express';

export default async function params(req: SendRequest, res: Response) {
  const max = config.max_downloads;
  const dlimit = Number(req.body && req.body.dlimit);
  if (!Number.isInteger(dlimit) || dlimit < 1 || dlimit > max) {
    return res.sendStatus(400);
  }

  try {
    await storage.setField(req.params.id, 'dlimit', dlimit);
    res.sendStatus(200);
  } catch {
    res.sendStatus(404);
  }
}
