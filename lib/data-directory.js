'use strict';

const path = require('node:path');

function isWithinPersistentRoot(root, candidate) {
  if (!root || !candidate) return false;
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}

function resolveDataDirectory({ persistentRoot, configuredPath, defaultPath }) {
  if (!persistentRoot) return path.resolve(configuredPath || defaultPath);
  const root = path.resolve(persistentRoot);
  if (configuredPath && isWithinPersistentRoot(root, configuredPath)) return path.resolve(configuredPath);
  return path.join(root, 'rimaz');
}

function canInitializeEmptyDatabase({ persistentRoot, allowEmpty = false, legacyDatabaseExists = false } = {}) {
  if (!persistentRoot) return true;
  return allowEmpty === true && legacyDatabaseExists !== true;
}

module.exports = { isWithinPersistentRoot, resolveDataDirectory, canInitializeEmptyDatabase };
