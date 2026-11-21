import crypto from 'crypto';
import { Transform, type Readable, type TransformCallback } from 'stream';
import storage from '../storage';
import config from '../config';
import mozlog from '../log';
import Limiter, { isLimitError } from '../limiter';
import fxa from '../fxa';
import { encryptedSize } from '../../app/utils';
import type { Request } from 'express';
import type WebSocket from 'ws';

const log = mozlog('send.upload');

const OPEN = 1;

interface FileInfo {
  timeLimit?: number;
  dlimit?: number;
  fileMetadata?: string;
  authorization?: string;
  bearer?: string;
}

/** The ws module's WebSocket class, which knows how to make a stream. */
interface WebSocketClass {
  createWebSocketStream(ws: WebSocket): Readable;
}

export default function wsUpload(ws: WebSocket, req: Request): void {
  let fileStream: Readable | undefined;
  let eofReceived = false;
  let cancelled = false;

  ws.on('close', () => {
    if (eofReceived) {
      return;
    }
    // The client went away before sending the whole file. Error the stream so
    // the storage backend aborts the upload and cleans up what it stored.
    cancelled = true;
    if (fileStream !== undefined) {
      fileStream.destroy(new Error('Upload cancelled'));
    }
  });

  ws.once('message', async function (message: WebSocket.RawData) {
    try {
      const newId = crypto.randomBytes(8).toString('hex');
      const owner = crypto.randomBytes(10).toString('hex');

      const fileInfo = JSON.parse(message.toString()) as FileInfo;
      const timeLimit = Number(
        fileInfo.timeLimit || config.default_expire_seconds
      );
      const dlimit = Number(fileInfo.dlimit || config.default_downloads);
      const metadata = fileInfo.fileMetadata;
      const auth = fileInfo.authorization;
      const user = await fxa.verify(fileInfo.bearer);
      if (cancelled) {
        return;
      }
      const maxFileSize = config.max_file_size;
      const maxExpireSeconds = config.max_expire_seconds;
      const maxDownloads = config.max_downloads;

      if (config.fxa_required && !user) {
        ws.send(
          JSON.stringify({
            error: 401
          })
        );
        return ws.close();
      }
      if (
        typeof metadata !== 'string' ||
        typeof auth !== 'string' ||
        !Number.isInteger(timeLimit) ||
        timeLimit <= 0 ||
        timeLimit > maxExpireSeconds ||
        !Number.isInteger(dlimit) ||
        dlimit < 1 ||
        dlimit > maxDownloads
      ) {
        ws.send(
          JSON.stringify({
            error: 400
          })
        );
        return ws.close();
      }

      const meta = {
        owner,
        metadata,
        dlimit,
        auth: auth.split(' ')[1],
        nonce: crypto.randomBytes(16).toString('base64')
      };

      const url = `${config.deriveBaseUrl(req)}/download/${newId}/`;

      ws.send(
        JSON.stringify({
          url,
          ownerToken: meta.owner,
          id: newId
        })
      );
      const limiter = new Limiter(encryptedSize(maxFileSize));
      const eof = new Transform({
        transform: function (
          chunk: Buffer,
          encoding: BufferEncoding,
          callback: TransformCallback
        ) {
          if (chunk.length === 1 && chunk[0] === 0) {
            eofReceived = true;
            this.push(null);
          } else {
            this.push(chunk);
          }
          callback();
        }
      });
      const wsStream = (
        ws.constructor as unknown as WebSocketClass
      ).createWebSocketStream(ws);

      fileStream = wsStream.pipe(eof).pipe(limiter); // limiter needs to be the last in the chain

      await storage.set(newId, fileStream, meta, timeLimit);

      // The client may have left after sending the whole file, in which case
      // the upload is complete but there is nobody left to tell.
      if (ws.readyState === OPEN) {
        ws.send(JSON.stringify({ ok: true }));
      }
    } catch (e) {
      if (!cancelled) {
        log.error('upload', e);
      }
      if (ws.readyState === OPEN) {
        ws.send(
          JSON.stringify({
            error: isLimitError(e) ? 413 : 500
          })
        );
      }
    }
    ws.close();
  });
}
