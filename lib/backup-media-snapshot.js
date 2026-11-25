'use strict';
const fs = require('node:fs');
const path = require('node:path');
const UPLOAD_URL = /^\/uploads\/([a-zA-Z0-9._-]{1,180})$/;

const MEDIA_REFERENCE_FIELDS = new Set(['url', 'image', 'avatar', 'banner', 'bannerUrl', 'icon', 'cover', 'background', 'giftImage', 'artUrl']);
function collectReferencedUploadNames(database) {
  const names = new Set(), seen = new Set(), pending = [{ value: database, key: '' }];
  while (pending.length) {
    const { value, key } = pending.pop();
    if (typeof value === 'string') {
      if (!MEDIA_REFERENCE_FIELDS.has(key)) continue;
      const match = UPLOAD_URL.exec(value);
      if (match && path.basename(match[1]) === match[1]) names.add(match[1]);
      continue;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const child of value) pending.push({ value: child, key });
    } else {
      for (const [childKey, child] of Object.entries(value)) pending.push({ value: child, key: childKey });
    }
  }
  return [...names].sort();
}
function createBackupMediaSnapshot(options = {}) {
  const { database, uploadDirectory, dataDirectory } = options;
  if (!database || typeof database !== 'object' || Array.isArray(database)) throw new TypeError('A database snapshot is required');
  if (typeof uploadDirectory !== 'string' || !uploadDirectory || typeof dataDirectory !== 'string' || !dataDirectory) throw new TypeError('Upload and data directories are required');
  const directory = fs.mkdtempSync(path.join(dataDirectory, '.rimaz-backup-media-'));
  const entries = [];
  try {
    fs.chmodSync(directory, 0o700);
    for (const filename of collectReferencedUploadNames(database)) {
      const source = path.join(uploadDirectory, filename);
      let sourceStat;
      try { sourceStat = fs.lstatSync(source); }
      catch (error) { throw new Error('Referenced public upload is missing or unreadable: ' + filename, { cause: error }); }
      if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new Error('Referenced public upload is not a regular file: ' + filename);
      const target = path.join(directory, filename);
      try { fs.linkSync(source, target); }
      catch (error) { throw new Error('Could not snapshot referenced public upload: ' + filename, { cause: error }); }
      const snapshotStat = fs.lstatSync(target);
      if (!snapshotStat.isFile() || snapshotStat.isSymbolicLink() || snapshotStat.dev !== sourceStat.dev || snapshotStat.ino !== sourceStat.ino) {
        fs.unlinkSync(target);
        throw new Error('Referenced public upload changed while the backup snapshot was being created: ' + filename);
      }
      entries.push({ name: 'uploads/' + filename, disk: target, size: snapshotStat.size, mtime: snapshotStat.mtimeMs });
    }
    let cleaned = false;
    return {
      entries,
      directory,
      cleanup() {
        if (cleaned) return;
        cleaned = true;
        fs.rmSync(directory, { recursive: true, force: true });
      }
    };
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}
module.exports = { collectReferencedUploadNames, createBackupMediaSnapshot };
