import storage from '../storage';
import type { Response } from 'express';
import type { SendRequest } from '../types/express';

export default async function password(req: SendRequest, res: Response) {
  const id = req.params.id;
  const auth = req.body && req.body.auth;
  if (!auth || typeof auth !== 'string') {
    return res.sendStatus(400);
  }

  try {
    await storage.setField(id, 'auth', auth);
    await storage.setField(id, 'pwd', true);
    res.sendStatus(200);
  } catch {
    return res.sendStatus(404);
  }
}
