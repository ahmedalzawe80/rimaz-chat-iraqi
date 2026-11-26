'use strict';

const fs = require('node:fs');
const { JSONParser, TokenType } = require('@streamparser/json');

const DEFAULT_READ_CHUNK_SIZE = 64 * 1024;
const DEFAULT_MAX_JSON_DEPTH = 512;

function asSyntaxError(error) {
  const syntaxError = new SyntaxError('Invalid JSON: ' + (error?.message || 'parse failed'));
  syntaxError.cause = error;
  return syntaxError;
}

// Parse a JSON file incrementally. The complete source text is never materialized;
// only the final value graph is retained. This is used for the live database and
// administrator restore files, both of which can be large relative to the heap.
function readJsonFile(filePath, options = {}) {
  const maxBytes = options.maxBytes === undefined ? Infinity : options.maxBytes;
  const maxDepth = options.maxDepth === undefined ? DEFAULT_MAX_JSON_DEPTH : options.maxDepth;
  const chunkSize = options.chunkSize === undefined ? DEFAULT_READ_CHUNK_SIZE : options.chunkSize;

  if (maxBytes !== Infinity && (!Number.isSafeInteger(maxBytes) || maxBytes < 0)) {
    throw new TypeError('maxBytes must be a non-negative safe integer or Infinity');
  }
  if (!Number.isInteger(maxDepth) || maxDepth < 1) {
    throw new TypeError('maxDepth must be a positive integer');
  }
  if (!Number.isInteger(chunkSize) || chunkSize < 1024 || chunkSize > 1024 * 1024) {
    throw new TypeError('chunkSize must be an integer between 1024 and 1048576');
  }

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error('JSON source must be a regular file');
  if (stat.size > maxBytes) throw new RangeError('JSON file exceeds the configured size limit');

  const fd = fs.openSync(filePath, 'r');
  try {
    const prefix = Buffer.alloc(3);
    const prefixBytes = fs.readSync(fd, prefix, 0, prefix.length, 0);
    if (prefixBytes === 3 && prefix.equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
      throw new SyntaxError('JSON byte-order marks are not supported');
    }

    const parser = new JSONParser({
      paths: ['$'],
      stringBufferSize: chunkSize,
      numberBufferSize: 1024
    });
    let depth = 0;
    let rootValue;
    let rootSeen = false;

    parser.onToken = ({ token }) => {
      if (token === TokenType.LEFT_BRACE || token === TokenType.LEFT_BRACKET) {
        depth++;
        if (depth > maxDepth) throw new RangeError('JSON nesting depth exceeds the configured limit');
      } else if (token === TokenType.RIGHT_BRACE || token === TokenType.RIGHT_BRACKET) {
        depth--;
      }
    };
    parser.onValue = ({ value }) => {
      if (rootSeen) throw new SyntaxError('Multiple root JSON values are not supported');
      rootValue = value;
      rootSeen = true;
    };

    const buffer = Buffer.allocUnsafe(chunkSize);
    let position = 0;
    let totalBytes = 0;
    for (;;) {
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      position += bytesRead;
      totalBytes += bytesRead;
      if (totalBytes > maxBytes) throw new RangeError('JSON file exceeds the configured size limit');
      try {
        parser.write(buffer.subarray(0, bytesRead));
      } catch (error) {
        throw asSyntaxError(error);
      }
    }

    try {
      if (!parser.isEnded) parser.end();
    } catch (error) {
      throw asSyntaxError(error);
    }
    if (!rootSeen) throw new SyntaxError('JSON file is empty or incomplete');
    return rootValue;
  } finally {
    fs.closeSync(fd);
  }
}


/**
 * Validate a JSON file incrementally without retaining the parsed object graph.
 * Used before promoting database snapshots and before rotating recovery copies.
 */
function validateJsonFile(filePath, options = {}) {
  const maxBytes = options.maxBytes === undefined ? Infinity : options.maxBytes;
  const maxDepth = options.maxDepth === undefined ? DEFAULT_MAX_JSON_DEPTH : options.maxDepth;
  const chunkSize = options.chunkSize === undefined ? DEFAULT_READ_CHUNK_SIZE : options.chunkSize;
  if (maxBytes !== Infinity && (!Number.isSafeInteger(maxBytes) || maxBytes < 0)) {
    throw new TypeError('maxBytes must be a non-negative safe integer or Infinity');
  }
  if (!Number.isInteger(maxDepth) || maxDepth < 1) throw new TypeError('maxDepth must be a positive integer');
  if (!Number.isInteger(chunkSize) || chunkSize < 1024 || chunkSize > 1024 * 1024) {
    throw new TypeError('chunkSize must be an integer between 1024 and 1048576');
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error('JSON source must be a regular file');
  if (stat.size > maxBytes) throw new RangeError('JSON file exceeds the configured size limit');
  const fd = fs.openSync(filePath, 'r');
  try {
    const prefix = Buffer.alloc(3);
    const prefixBytes = fs.readSync(fd, prefix, 0, prefix.length, 0);
    if (prefixBytes === 3 && prefix.equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
      throw new SyntaxError('JSON byte-order marks are not supported');
    }
    const parser = new JSONParser({
      paths: [],
      keepStack: false,
      stringBufferSize: chunkSize,
      numberBufferSize: 1024
    });
    let firstToken = null;
    let depth = 0;
    parser.onToken = ({ token }) => {
      if (token === TokenType.SEPARATOR) return;
      if (firstToken === null) firstToken = token;
      if (token === TokenType.LEFT_BRACE || token === TokenType.LEFT_BRACKET) {
        depth++;
        if (depth > maxDepth) throw new RangeError('JSON nesting depth exceeds the configured limit');
      } else if (token === TokenType.RIGHT_BRACE || token === TokenType.RIGHT_BRACKET) {
        depth--;
      }
    };
    const buffer = Buffer.allocUnsafe(chunkSize);
    let position = 0;
    let totalBytes = 0;
    for (;;) {
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      position += bytesRead;
      totalBytes += bytesRead;
      if (totalBytes > maxBytes) throw new RangeError('JSON file exceeds the configured size limit');
      try { parser.write(buffer.subarray(0, bytesRead)); }
      catch (error) { throw asSyntaxError(error); }
    }
    try { if (!parser.isEnded) parser.end(); }
    catch (error) { throw asSyntaxError(error); }
    if (firstToken !== TokenType.LEFT_BRACE || depth !== 0) {
      throw new SyntaxError('JSON database must contain one complete object root');
    }
    return { bytes: totalBytes };
  } finally {
    fs.closeSync(fd);
  }
}


module.exports = { readJsonFile, validateJsonFile };
