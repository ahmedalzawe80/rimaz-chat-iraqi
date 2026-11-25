'use strict';
const fs = require('node:fs');

function readText(readFile, file) {
  try { return String(readFile(file, 'utf8')).trim(); }
  catch (error) { if (error.code === 'ENOENT' || error.code === 'EACCES') return ''; throw error; }
}

function parseNumber(value) {
  if (!/^\d+$/.test(String(value || ''))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function parseKeyValues(value) {
  const result = {};
  for (const line of String(value || '').split(/\r?\n/)) {
    const match = line.trim().match(/^([a-zA-Z0-9_]+)\s+(\d+)$/);
    if (match) result[match[1]] = parseNumber(match[2]);
  }
  return result;
}

function readCgroupMetrics(root = '/sys/fs/cgroup', readFile = fs.readFileSync) {
  const read = file => readText(readFile, root + '/' + file);
  const current = parseNumber(read('memory.current'));
  const peak = parseNumber(read('memory.peak'));
  const rawLimit = read('memory.max');
  const limit = rawLimit === 'max' ? null : parseNumber(rawLimit);
  const events = parseKeyValues(read('memory.events'));
  const cpu = parseKeyValues(read('cpu.stat'));
  const memoryAvailable = current !== null || peak !== null || limit !== null || Object.keys(events).length > 0;
  const cpuAvailable = Object.keys(cpu).length > 0;
  const available = memoryAvailable || cpuAvailable;
  return {
    available,
    version: available ? 2 : null,
    memory: {
      currentBytes: current,
      peakBytes: peak,
      limitBytes: limit,
      oomEvents: events.oom ?? null,
      oomKillEvents: events.oom_kill ?? null,
      highEvents: events.high ?? null,
      maxEvents: events.max ?? null
    },
    cpu: {
      usageMicros: cpu.usage_usec ?? null,
      periods: cpu.nr_periods ?? null,
      throttledPeriods: cpu.nr_throttled ?? null,
      throttledMicros: cpu.throttled_usec ?? null
    }
  };
}

module.exports = { readCgroupMetrics, parseKeyValues };
