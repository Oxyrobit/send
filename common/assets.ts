import genmap from './generate_asset_map';

type AssetMap = Record<string, string>;

/** The parts of webpack-dev-middleware used to read the in-memory manifest. */
export interface DevMiddleware {
  fileSystem: { readFileSync(path: string): Buffer | string };
  getFilenameFromUrl(url: string): string;
}

const isServer = typeof genmap === 'function';
let prefix = '';
// In the browser the map is generated at build time. On the server it is read
// from dist/manifest.json with setManifest() at startup.
let assets: AssetMap = isServer ? {} : (genmap as AssetMap);
let manifestReader: (() => AssetMap) | null = null;

function currentAssets(): AssetMap {
  return manifestReader ? manifestReader() : assets;
}

function getAsset(name: string): string {
  return prefix + currentAssets()[name];
}

function getMatches(match: RegExp): string[] {
  const m = currentAssets();
  return Object.keys(m)
    .filter(k => match.test(k))
    .map(k => prefix + m[k]);
}

const instance = {
  setPrefix(name: string): void {
    prefix = name;
  },
  setManifest(manifest: AssetMap): void {
    assets = manifest;
  },
  get: getAsset,
  match: getMatches,
  /** Development: read the manifest from webpack's in-memory filesystem. */
  setMiddleware(middleware?: DevMiddleware): void {
    if (middleware) {
      manifestReader = () =>
        JSON.parse(
          middleware.fileSystem
            .readFileSync(middleware.getFilenameFromUrl('/manifest.json'))
            .toString()
        ) as AssetMap;
    }
  }
};

export default instance;
