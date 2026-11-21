import crypto from 'crypto';
import storage from '../storage';
import config from '../config';
import mozlog from '../log';
import Limiter, { isLimitError } from '../limiter';
import { encryptedSize } from '../../app/utils';
import type { Response } from 'express';
import type { SendRequest } from '../types/express';

const log = mozlog('send.upload');

/** Legacy upload over a single HTTP request, superseded by ws.ts */
export default async function upload(req: SendRequest, res: Response) {
  const newId = crypto.randomBytes(8).toString('hex');
  const metadata = req.header('X-File-Metadata');
  const auth = req.header('Authorization');
  if (!metadata || !auth) {
    return res.sendStatus(400);
  }
  const owner = crypto.randomBytes(10).toString('hex');
  const meta = {
    owner,
    metadata,
    auth: auth.split(' ')[1],
    nonce: crypto.randomBytes(16).toString('base64')
  };

  try {
    const limiter = new Limiter(encryptedSize(config.max_file_size));
    req.on('error', err => limiter.destroy(err));
    const fileStream = req.pipe(limiter);
    await storage.set(newId, fileStream, meta, config.default_expire_seconds);
    const url = `${config.deriveBaseUrl(req)}/download/${newId}/`;
    res.set('WWW-Authenticate', `send-v1 ${meta.nonce}`);
    res.json({
      url,
      owner: meta.owner,
      id: newId
    });
  } catch (e) {
    if (isLimitError(e)) {
      return res.sendStatus(413);
    }
    log.error('upload', e);
    res.sendStatus(500);
  }
}
