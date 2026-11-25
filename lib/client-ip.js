'use strict';
const net = require('node:net');
const proxyaddr = require('proxy-addr');

function normalizeIp(value) {
  let ip = String(value || '').trim();
  if (ip.includes(',')) ip = ip.split(',')[0].trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip.startsWith('[') && ip.includes(']')) ip = ip.slice(1, ip.indexOf(']'));
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.replace(/:\d+$/, '');
  return net.isIP(ip) ? ip.toLowerCase() : '';
}

function createTrustedProxyTrust(configuration = '') {
  const ranges = String(configuration || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!ranges.length) return () => false;
  return proxyaddr.compile(ranges);
}

function resolveClientIp(headers, remoteAddress, trustProxy = () => false) {
  const remote = normalizeIp(remoteAddress);
  if (!remote) return '';
  if (typeof trustProxy !== 'function' || !trustProxy(remote, 0)) return remote;

  const source = headers || {};
  for (const name of ['cf-connecting-ip', 'x-real-ip']) {
    const candidate = normalizeIp(source[name]);
    if (candidate) return candidate;
  }

  try {
    const resolved = normalizeIp(proxyaddr({ headers: source, socket: { remoteAddress: remote } }, trustProxy));
    return resolved || remote;
  } catch {
    return remote;
  }
}

module.exports = { normalizeIp, createTrustedProxyTrust, resolveClientIp };
