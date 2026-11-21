// Webpack evaluates generate_asset_map.js at build time (val-loader) and
// replaces it with a map of asset names to hashed file names. Everywhere else
// (the server, the tests) the module is the generator function itself.
declare const assetMap: Record<string, string> | (() => unknown);
export default assetMap;
