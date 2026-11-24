'use strict';

const fs = require('node:fs');

const DEFAULT_CHUNK_SIZE = 64 * 1024;
const STRING_CHUNK_SIZE = 4096;

function writeJsonSync(fd, input, options = {}) {
  const space = options.space === undefined ? 0 : options.space;
  const gap = typeof space === 'number'
    ? ' '.repeat(Math.max(0, Math.min(10, Math.floor(space))))
    : String(space).slice(0, 10);
  const chunkSize = Math.max(1024, Math.min(1024 * 1024, Number(options.chunkSize) || DEFAULT_CHUNK_SIZE));
  const ancestors = new Set();
  let pending = '';
  let bytesWritten = 0;

  function flush(force = false) {
    while (pending.length >= chunkSize || (force && pending.length)) {
      let end = pending.length >= chunkSize ? chunkSize : pending.length;
      if (end < pending.length) {
        const last = pending.charCodeAt(end - 1);
        const next = pending.charCodeAt(end);
        if (last >= 0xD800 && last <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) end++;
      }
      const buffer = Buffer.from(pending.slice(0, end), 'utf8');
      let offset = 0;
      while (offset < buffer.length) {
        const written = fs.writeSync(fd, buffer, offset, buffer.length - offset);
        if (written <= 0) throw new Error('Unable to make progress while writing JSON');
        offset += written;
      }
      bytesWritten += buffer.length;
      pending = pending.slice(end);
    }
  }

  function emit(value) {
    if (!value) return;
    pending += value;
    flush(false);
  }

  function emitString(value) {
    emit('"');
    for (let offset = 0; offset < value.length;) {
      let end = Math.min(value.length, offset + STRING_CHUNK_SIZE);
      if (end < value.length) {
        const last = value.charCodeAt(end - 1);
        const next = value.charCodeAt(end);
        if (last >= 0xD800 && last <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) end++;
      }
      const escaped = JSON.stringify(value.slice(offset, end));
      emit(escaped.slice(1, -1));
      offset = end;
    }
    emit('"');
  }

  function prepare(value, key) {
    if (value !== null && typeof value === 'object' && typeof value.toJSON === 'function') {
      return value.toJSON(key);
    }
    return value;
  }

  function serialize(input, depth, position, key, alreadyPrepared = false) {
    const value = alreadyPrepared ? input : prepare(input, key);
    const type = typeof value;
    if (value === null) { emit('null'); return true; }
    if (type === 'string') { emitString(value); return true; }
    if (type !== 'object') {
      if (type === 'undefined' || type === 'function' || type === 'symbol') {
        if (position === 'array') emit('null');
        return position === 'array';
      }
      emit(JSON.stringify(value));
      return true;
    }

    if (ancestors.has(value)) throw new TypeError('Converting circular structure to JSON');
    ancestors.add(value);
    try {
      const indent = gap ? '\\n' + gap.repeat(depth + 1) : '';
      const closingIndent = gap ? '\\n' + gap.repeat(depth) : '';
      if (Array.isArray(value)) {
        emit('[');
        for (let index = 0; index < value.length; index++) {
          if (index) emit(',');
          if (gap) emit(indent);
          serialize(value[index], depth + 1, 'array', String(index));
        }
        if (value.length && gap) emit(closingIndent);
        emit(']');
        return true;
      }

      emit('{');
      let emitted = 0;
      for (const property of Object.keys(value)) {
        const child = prepare(value[property], property);
        const childType = typeof child;
        if (child === undefined || childType === 'function' || childType === 'symbol') continue;
        if (emitted++) emit(',');
        if (gap) emit(indent);
        emitString(property);
        emit(gap ? ': ' : ':');
        serialize(child, depth + 1, 'object', property, true);
      }
      if (emitted && gap) emit(closingIndent);
      emit('}');
      return true;
    } finally {
      ancestors.delete(value);
    }
  }

  const written = serialize(input, 0, 'root', '');
  flush(true);
  return written ? bytesWritten : undefined;
}

module.exports = { writeJsonSync };
