'use strict';
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_STALE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MEDIA_SNAPSHOT_PREFIX = '.rimaz-backup-media-';

function isDatabaseBackupTemp(name, databaseFile) {
  const prefix = path.basename(databaseFile) + '.';
  if (!name.startsWith(prefix)) return false;
  const parts = name.slice(prefix.length).split('.');
  return parts.length === 4 &&
    /^\d+$/.test(parts[0]) &&
    (parts[1] === 'full-backup' || parts[1] === 'database-backup') &&
    /^[a-f0-9]{16}$/.test(parts[2]) &&
    parts[3] === 'tmp';
}

function cleanupStaleBackupTemps(dataDirectory, databaseFile, options = {}) {
  const filesystem = options.fs || fs;
  const now = Number(options.now) || Date.now();
  const maxAgeMs = Number.isFinite(options.maxAgeMs) && options.maxAgeMs >= 0
    ? options.maxAgeMs
    : DEFAULT_STALE_AGE_MS;
  const result = { removedDirectories: 0, removedFiles: 0, errors: [] };
  let entries;
  try { entries = filesystem.readdirSync(dataDirectory, { withFileTypes: true }); }
  catch (error) {
    if (error.code === 'ENOENT') return result;
    result.errors.push({ path: dataDirectory, message: error.message });
    return result;
  }

  for (const entry of entries) {
    const fullPath = path.join(dataDirectory, entry.name);
    const isMediaSnapshot = entry.name.startsWith(MEDIA_SNAPSHOT_PREFIX) && entry.isDirectory();
    const isDatabaseTemp = isDatabaseBackupTemp(entry.name, databaseFile) && entry.isFile();
    if (!isMediaSnapshot && !isDatabaseTemp) continue;
    try {
      const stat = filesystem.lstatSync(fullPath);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) continue;
      if (now - stat.mtimeMs < maxAgeMs) continue;
      if (stat.isDirectory()) {
        filesystem.rmSync(fullPath, { recursive: true, force: true });
        result.removedDirectories++;
      } else {
        filesystem.unlinkSync(fullPath);
        result.removedFiles++;
      }
    } catch (error) {
      result.errors.push({ path: fullPath, message: error.message });
    }
  }
  return result;
}

module.exports = { cleanupStaleBackupTemps, isDatabaseBackupTemp, DEFAULT_STALE_AGE_MS };
