import storage from '../storage';
import mozlog from '../log';
import type { Response } from 'express';
import type { SendRequest } from '../types/express';

const log = mozlog('send.download');

export default async function download(req: SendRequest, res: Response) {
  const id = req.params.id;
  const meta = req.meta;
  let fileStream;
  let contentLength;
  try {
    contentLength = await storage.length(id);
    fileStream = await storage.get(id);
  } catch {
    return res.sendStatus(404);
  }
  if (!meta) {
    fileStream.destroy();
    return res.sendStatus(404);
  }

  let cancelled = false;
  // 'close' fires when the response finished or the client went away
  res.on('close', () => {
    if (!res.writableFinished) {
      cancelled = true;
      fileStream.destroy();
    }
  });
  fileStream.on('error', err => {
    log.error('DownloadError:', { id, err: String(err) });
    res.destroy();
  });

  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': contentLength
  });
  fileStream.pipe(res).on('finish', async () => {
    if (cancelled) {
      return;
    }
    try {
      // Count atomically, so concurrent downloads can't exceed the limit
      const dl = await storage.incrementField(id, 'dl');
      if (dl >= meta.dlimit) {
        await storage.del(id);
      }
    } catch {
      log.info('StorageError:', id);
    }
  });
}
