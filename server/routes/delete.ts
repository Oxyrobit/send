import storage from '../storage';
import type { Response } from 'express';
import type { SendRequest } from '../types/express';

export default async function deleteRoute(req: SendRequest, res: Response) {
  try {
    await storage.del(req.params.id);
    res.sendStatus(200);
  } catch {
    res.sendStatus(404);
  }
}
