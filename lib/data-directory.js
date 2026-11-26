'use strict';

const fs = require('node:fs');
const path = require('node:path');

function isWithinPersistentRoot(root, candidate) {
  if (!root || !candidate) return false;
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const lexicalRelative = path.relative(resolvedRoot, resolvedCandidate);
  if (lexicalRelative !== '' &&
      (lexicalRelative === '..' || lexicalRelative.startsWith('..' + path.sep) || path.isAbsolute(lexicalRelative))) {
    return false;
  }

  // Resolve every existing path component before accepting the boundary.
  // This also handles a not-yet-created DATA_DIR by resolving its nearest
  // existing parent and then appending the missing path components.
  function resolveThroughExistingParents(value) {
    let current = path.resolve(value);
    const missing = [];
    for (;;) {
      try {
        const real = fs.realpathSync(current);
        return path.resolve(real, ...missing.reverse());
      } catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') return null;
        // A dangling symlink also reports ENOENT from realpathSync. Do not
        // treat it as a missing ordinary directory: its target could appear
        // later outside the persistent root.
        try {
          if (fs.lstatSync(current).isSymbolicLink()) return null;
        } catch (statError) {
          if (statError.code !== 'ENOENT' && statError.code !== 'ENOTDIR') return null;
        }
        const parent = path.dirname(current);
        if (parent === current) return null;
        missing.push(path.basename(current));
        current = parent;
      }
    }
  }

  const realRoot = resolveThroughExistingParents(resolvedRoot);
  const realCandidate = resolveThroughExistingParents(resolvedCandidate);
  if (!realRoot || !realCandidate) return false;
  const realRelative = path.relative(realRoot, realCandidate);
  return realRelative === '' ||
    (realRelative !== '..' && !realRelative.startsWith('..' + path.sep) && !path.isAbsolute(realRelative));
}

function resolveDataDirectory({ persistentRoot, configuredPath, defaultPath }) {
  if (!persistentRoot) return path.resolve(configuredPath || defaultPath);
  const root = path.resolve(persistentRoot);
  if (configuredPath && isWithinPersistentRoot(root, configuredPath)) return path.resolve(configuredPath);
  const fallback = path.join(root, 'rimaz');
  if (!isWithinPersistentRoot(root, fallback)) {
    throw new Error('Default persistent data directory resolves outside the persistent storage root');
  }
  return fallback;
}

function canInitializeEmptyDatabase({ persistentRoot, allowEmpty = false, legacyDatabaseExists = false } = {}) {
  if (!persistentRoot) return true;
  return allowEmpty === true && legacyDatabaseExists !== true;
}

module.exports = { isWithinPersistentRoot, resolveDataDirectory, canInitializeEmptyDatabase };
