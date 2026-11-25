'use strict';

const fs = require('node:fs');
const { JSONParser, TokenType } = require('@streamparser/json');

const DEFAULT_READ_CHUNK_SIZE = 64 * 1024;
const DEFAULT_MAX_JSON_DEPTH = 512;
const RESTORE_FORMATS = new Set(['rimaz-database-backup', 'rimaz-full-backup']);

function tokenValueType(token) {
  switch (token) {
    case TokenType.LEFT_BRACE: return 'object';
    case TokenType.LEFT_BRACKET: return 'array';
    case TokenType.STRING: return 'string';
    case TokenType.NUMBER: return 'number';
    case TokenType.TRUE:
    case TokenType.FALSE: return 'boolean';
    case TokenType.NULL: return 'null';
    default: return 'unknown';
  }
}

function inspectDatabaseRestoreFile(filePath, options = {}) {
  const template = options.template;
  if (!template || typeof template !== 'object' || Array.isArray(template)) {
    throw new TypeError('A database defaults template is required');
  }

  const maxBytes = options.maxBytes === undefined ? 20 * 1024 * 1024 : options.maxBytes;
  const maxDepth = options.maxDepth === undefined ? DEFAULT_MAX_JSON_DEPTH : options.maxDepth;
  const chunkSize = options.chunkSize === undefined ? DEFAULT_READ_CHUNK_SIZE : options.chunkSize;
  const normalizeName = typeof options.normalizeName === 'function'
    ? options.normalizeName
    : (value) => String(value || '').trim().toLowerCase();
  const configuredOwner = normalizeName(options.configuredOwnerName || '');
  const actorName = normalizeName(options.ownerName || '');

  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new TypeError('maxBytes must be a non-negative safe integer');
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

    const stack = [];
    const databaseFieldTypes = new Map();
    let rootSeen = false;
    let rootComplete = false;
    let formatType = 'missing';
    let formatValue;
    let versionType = 'missing';
    let versionValue;
    let databaseType = 'missing';
    let members = 0;
    let guests = 0;
    let rooms = 0;
    let messages = 0;
    let wall = 0;
    let createdAt;
    let appVersion;
    const configuredOwnerFound = { users: false, guests: false };
    const ownerKeyFound = { users: false, guests: false };
    const ownerRoleAccounts = new Set();

    function resetDatabaseStats() {
      databaseFieldTypes.clear();
      members = 0;
      guests = 0;
      rooms = 0;
      messages = 0;
      wall = 0;
      configuredOwnerFound.users = false;
      configuredOwnerFound.guests = false;
      ownerKeyFound.users = false;
      ownerKeyFound.guests = false;
      ownerRoleAccounts.clear();
    }

    function resetCollection(name) {
      if (name === 'users') {
        members = 0;
        configuredOwnerFound.users = false;
        ownerKeyFound.users = false;
        for (const id of ownerRoleAccounts) if (id.startsWith('users\u0000')) ownerRoleAccounts.delete(id);
      } else if (name === 'guests') {
        guests = 0;
        configuredOwnerFound.guests = false;
        ownerKeyFound.guests = false;
        for (const id of ownerRoleAccounts) if (id.startsWith('guests\u0000')) ownerRoleAccounts.delete(id);
      } else if (name === 'rooms') rooms = 0;
      else if (name === 'messages') messages = 0;
      else if (name === 'wall') wall = 0;
    }

    function nextPath() {
      if (!stack.length) return [];
      const parent = stack[stack.length - 1];
      if (parent.type === 'object') {
        if (parent.key === null) throw new SyntaxError('Invalid JSON object key sequence');
        return parent.path.concat(parent.key);
      }
      return parent.path.concat(parent.index);
    }

    function consumeValue() {
      if (!stack.length) {
        rootComplete = true;
        return;
      }
      const parent = stack[stack.length - 1];
      if (parent.type === 'object') {
        parent.key = null;
        parent.expectingKey = true;
      } else {
        parent.index++;
      }
    }

    function beginValue(path, token, value) {
      const actualType = tokenValueType(token);
      if (path.length === 0) {
        if (token !== TokenType.LEFT_BRACE) {
          throw new Error('صيغة النسخة غير مدعومة أو تالفة');
        }
        rootSeen = true;
        return;
      }

      if (path.length === 1) {
        const key = path[0];
        if (key === 'format') {
          formatType = actualType;
          formatValue = token === TokenType.STRING ? value : undefined;
        } else if (key === 'version') {
          versionType = actualType;
          versionValue = token === TokenType.NUMBER ? value : undefined;
        } else if (key === 'database') {
          databaseType = actualType;
          resetDatabaseStats();
        } else if (key === 'createdAt') {
          createdAt = token === TokenType.STRING || token === TokenType.NUMBER || token === TokenType.TRUE || token === TokenType.FALSE || token === TokenType.NULL
            ? value : undefined;
        } else if (key === 'appVersion') {
          appVersion = token === TokenType.STRING || token === TokenType.NUMBER || token === TokenType.TRUE || token === TokenType.FALSE || token === TokenType.NULL
            ? value : undefined;
        }
        return;
      }

      if (path.length === 2 && path[0] === 'database') {
        const key = path[1];
        databaseFieldTypes.set(key, actualType);
        resetCollection(key);
        return;
      }

      if (path.length === 3 && path[0] === 'database') {
        const collection = path[1];
        const accountName = String(path[2]);
        const normalized = normalizeName(accountName);
        if (collection === 'users') {
          members++;
          if (configuredOwner && normalized === configuredOwner) configuredOwnerFound.users = true;
          if (normalized === 'owner') ownerKeyFound.users = true;
          ownerRoleAccounts.delete('users\u0000' + normalized);
        } else if (collection === 'guests') {
          guests++;
          if (configuredOwner && normalized === configuredOwner) configuredOwnerFound.guests = true;
          if (normalized === 'owner') ownerKeyFound.guests = true;
          ownerRoleAccounts.delete('guests\u0000' + normalized);
        } else if (collection === 'rooms' && path[2] !== undefined) rooms++;
        else if (collection === 'messages' && path[2] !== undefined) messages++;
        else if (collection === 'wall' && path[2] !== undefined) wall++;
        return;
      }

      if (path.length === 4 && path[0] === 'database' &&
          (path[1] === 'users' || path[1] === 'guests') && path[3] === 'role') {
        const id = path[1] + '\u0000' + normalizeName(path[2]);
        ownerRoleAccounts.delete(id);
        if (token === TokenType.STRING && normalizeName(value) === 'owner') ownerRoleAccounts.add(id);
      }
    }

    const parser = new JSONParser({
      paths: [],
      keepStack: false,
      stringBufferSize: chunkSize,
      numberBufferSize: 1024
    });

    parser.onToken = ({ token, value }) => {
      if (token === TokenType.SEPARATOR) return;

      const parent = stack[stack.length - 1];
      if (token === TokenType.STRING && parent?.type === 'object' && parent.expectingKey) {
        parent.key = value;
        parent.expectingKey = false;
        return;
      }
      if (token === TokenType.COLON) return;
      if (token === TokenType.COMMA) {
        if (parent?.type === 'object') {
          parent.key = null;
          parent.expectingKey = true;
        }
        return;
      }

      if (token === TokenType.LEFT_BRACE || token === TokenType.LEFT_BRACKET) {
        const path = nextPath();
        beginValue(path, token, value);
        stack.push({
          type: token === TokenType.LEFT_BRACE ? 'object' : 'array',
          path,
          key: null,
          index: 0,
          expectingKey: true
        });
        if (stack.length > maxDepth) throw new RangeError('JSON nesting depth exceeds the configured limit');
        return;
      }

      if (token === TokenType.RIGHT_BRACE || token === TokenType.RIGHT_BRACKET) {
        if (!stack.length) throw new SyntaxError('Unexpected JSON closing token');
        stack.pop();
        consumeValue();
        return;
      }

      if (token === TokenType.STRING || token === TokenType.NUMBER ||
          token === TokenType.TRUE || token === TokenType.FALSE || token === TokenType.NULL) {
        const path = nextPath();
        beginValue(path, token, value);
        consumeValue();
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
      parser.write(buffer.subarray(0, bytesRead));
    }
    if (!parser.isEnded) parser.end();

    if (!rootSeen || !rootComplete || stack.length !== 0 ||
        formatType !== 'string' || !RESTORE_FORMATS.has(formatValue) ||
        versionType !== 'number' || versionValue !== 1 || databaseType !== 'object') {
      throw new Error('صيغة النسخة غير مدعومة أو تالفة');
    }

    for (const [key, defaultValue] of Object.entries(template)) {
      if (key === 'sessions' || key === 'privateMessages' || !databaseFieldTypes.has(key)) continue;
      const actualType = databaseFieldTypes.get(key);
      const valid = Array.isArray(defaultValue)
        ? actualType === 'array'
        : defaultValue && typeof defaultValue === 'object'
          ? actualType === 'object'
          : defaultValue === null
            ? actualType === 'null' || actualType === 'object' || actualType === 'array'
            : actualType === typeof defaultValue;
      if (!valid) throw new Error('نوع بيانات غير صالح داخل النسخة: ' + key);
    }

    const requiredObjectTypes = ['users', 'guests'];
    const requiredArrayTypes = ['rooms', 'messages'];
    if (requiredObjectTypes.some(key => databaseFieldTypes.has(key) && databaseFieldTypes.get(key) !== 'object') ||
        requiredArrayTypes.some(key => databaseFieldTypes.has(key) && databaseFieldTypes.get(key) !== 'array')) {
      throw new Error('النسخة لا تحتوي البنية الأساسية لقاعدة بيانات ريماز');
    }

    if (members > 100000 || guests > 100000 || rooms > 10000 || messages > 2000000) {
      throw new Error('حجم البيانات داخل النسخة يتجاوز الحدود الآمنة');
    }

    const hasOwner = configuredOwner
      ? configuredOwnerFound
      : actorName && actorName !== 'owner'
        ? ownerRoleAccounts.has('users\u0000' + actorName) || ownerRoleAccounts.has('guests\u0000' + actorName)
        : ownerKeyFound || ownerRoleAccounts.size > 0;
    if (!hasOwner) {
      throw new Error('النسخة لا تحتوي حساب صاحب الموقع؛ رُفضت لحماية إمكانية الدخول للإدارة');
    }

    return {
      members,
      guests,
      rooms,
      messages,
      wall,
      createdAt: createdAt || null,
      appVersion: appVersion || 'غير معروف'
    };
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = { inspectDatabaseRestoreFile };
