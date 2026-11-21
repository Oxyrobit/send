import os from 'os';
import util from 'util';
import conf from './config';

// A small structured logger, a drop-in for what Send used from mozlog: in
// production one JSON object per line in the mozlog "heka" format, in
// development a readable line on stderr.

export type Level =
  'critical' | 'error' | 'warn' | 'info' | 'debug' | 'verbose';

// Syslog severities, as mozlog used for the heka format
const SEVERITY: Record<Level, number> = {
  critical: 2,
  error: 3,
  warn: 4,
  info: 6,
  debug: 7,
  verbose: 7
};
const ORDER: Level[] = [
  'critical',
  'error',
  'warn',
  'info',
  'debug',
  'verbose'
];

export type Logger = Record<Level, (op: string, ...details: unknown[]) => void>;

const isProduction = conf.env === 'production';
const threshold = ORDER.indexOf(isProduction ? 'info' : 'verbose');
const hostname = os.hostname();
const APP = 'FirefoxSend';

function fields(details: unknown[]): Record<string, unknown> {
  if (details.length === 0) {
    return {};
  }
  const [first] = details;
  if (details.length === 1 && first && typeof first === 'object') {
    if (first instanceof Error) {
      return { error: first.message, stack: first.stack };
    }
    return first as Record<string, unknown>;
  }
  return {
    msg: details
      .map(d => (typeof d === 'string' ? d : util.inspect(d)))
      .join(' ')
  };
}

function write(name: string, level: Level, op: string, details: unknown[]) {
  if (ORDER.indexOf(level) > threshold) {
    return;
  }
  if (isProduction) {
    process.stdout.write(
      JSON.stringify({
        Timestamp: Date.now() * 1000000,
        Logger: APP,
        Type: `${name}.${op}`,
        Severity: SEVERITY[level],
        Pid: process.pid,
        EnvVersion: '2.0',
        Hostname: hostname,
        Fields: fields(details)
      }) + '\n'
    );
  } else {
    const rest = details.length ? ' ' + util.inspect(fields(details)) : '';
    process.stderr.write(
      `${new Date().toISOString()} ${level.toUpperCase()} ${name}.${op}${rest}\n`
    );
  }
}

export default function mozlog(name: string): Logger {
  const logger = {} as Logger;
  for (const level of ORDER) {
    logger[level] = (op, ...details) => write(name, level, op, details);
  }
  return logger;
}
