'use strict';

const fs = require('node:fs');
const path = require('node:path');

// A database reference must never become durable before its upload bytes and
// directory entry have been committed to the same persistent filesystem.
function syncDirectory(directoryPath) {
  const directory = path.resolve(directoryPath);
  let directoryFd;
  try {
    directoryFd = fs.openSync(directory, 'r');
    if (!fs.fstatSync(directoryFd).isDirectory()) throw new Error('Upload directory is not a directory');
    fs.fsyncSync(directoryFd);
  } finally {
    if (directoryFd !== undefined) fs.closeSync(directoryFd);
  }
}

function syncFileAndDirectory(filePath, directoryPath = path.dirname(filePath)) {
  const file = path.resolve(filePath);
  const directory = path.resolve(directoryPath);
  if (path.dirname(file) !== directory) {
    throw new Error('Durable file and containing directory do not match');
  }

  let fd;
  try {
    const before = fs.lstatSync(file);
    if (!before.isFile() || before.isSymbolicLink()) {
      throw new Error('Durable upload must be a regular file');
    }
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new Error('Durable upload changed while it was being opened');
    }
    fs.fsyncSync(fd);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }

  syncDirectory(directory);
}

module.exports = { syncFileAndDirectory, syncDirectory };
