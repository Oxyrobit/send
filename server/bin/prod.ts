import config from '../config';
import mozlog from '../log';
import createApp from '../app';

const log = mozlog('send.server');

if (config.sentry_dsn) {
  // Only loaded when configured, it is big and probes the environment
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Sentry = require('@sentry/node') as typeof import('@sentry/node');
  Sentry.init({ dsn: config.sentry_dsn });
}

process.on('unhandledRejection', reason => {
  log.error('unhandledRejection', { err: String(reason) });
});

const server = createApp().listen(config.listen_port, config.listen_address);
server.on('listening', () => {
  log.info('listening', {
    address: config.listen_address,
    port: config.listen_port
  });
});
server.on('error', err => {
  log.critical('listen', { err: String(err) });
  process.exit(1);
});

// As PID 1 in a container, node gets no default signal handling: stop
// accepting connections and let the running transfers finish first.
let stopping = false;
function shutdown(signal: string) {
  if (stopping) {
    return;
  }
  stopping = true;
  log.info('shutdown', { signal });
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  setTimeout(() => process.exit(0), 10 * 1000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
