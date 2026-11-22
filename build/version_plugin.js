const gitRevSync = require('git-rev-sync');
const pkg = require('../package.json');

// In a container build there is no .git: the commit comes from GIT_COMMIT
let commit = process.env.GIT_COMMIT
  ? process.env.GIT_COMMIT.slice(0, 7)
  : 'unknown';

if (!process.env.GIT_COMMIT) {
  try {
    commit = gitRevSync.short();
  } catch (e) {
    console.warn('Error fetching current git commit: ' + e);
  }
}

const version = JSON.stringify({
  commit,
  source: pkg.homepage,
  version:
    process.env.VERSION_TAG || process.env.CIRCLE_TAG || `v${pkg.version}`
});

class VersionPlugin {
  apply(compiler) {
    compiler.hooks.emit.tap('VersionPlugin', compilation => {
      compilation.assets['version.json'] = {
        source() {
          return version;
        },
        size() {
          return version.length;
        }
      };
    });
  }
}

module.exports = VersionPlugin;
