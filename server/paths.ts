import fs from 'fs';
import path from 'path';

/**
 * The directory holding dist/ and public/. It is found by walking up from this
 * module, so it is the same whether the server runs from the TypeScript
 * sources (development, tests) or from the bundle built into the image.
 */
function findRoot(): string {
  if (process.env.SEND_ROOT) {
    return path.resolve(process.env.SEND_ROOT);
  }
  let dir = __dirname;
  for (;;) {
    if (fs.existsSync(path.join(dir, 'public', 'locales'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `cannot find public/locales above ${__dirname}, set SEND_ROOT`
      );
    }
    dir = parent;
  }
}

export const ROOT = findRoot();
export const DIST_DIR = path.join(ROOT, 'dist');
export const LOCALES_DIR = path.join(ROOT, 'public', 'locales');

/** Read a JSON file from dist/, or return `fallback` when it doesn't exist. */
export function readDistJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIST_DIR, name), 'utf8')) as T;
  } catch {
    return fallback;
  }
}
