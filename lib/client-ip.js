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

const TRUSTED_PROXY_HEADERS = new Set(['cf-connecting-ip', 'x-real-ip', 'x-forwarded-for']);

function normalizeTrustedProxyHeader(value) {
  const header = String(value || '').trim().toLowerCase();
  return TRUSTED_PROXY_HEADERS.has(header) ? header : '';
}

function createTrustedProxyTrust(configuration = '') {
  const ranges = String(configuration || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!ranges.length) return () => false;
  return proxyaddr.compile(ranges);
}

function resolveClientIp(headers, remoteAddress, trustProxy = () => false, trustedHeader = '') {
  const remote = normalizeIp(remoteAddress);
  if (!remote) return '';
  if (typeof trustProxy !== 'function' || !trustProxy(remote, 0)) return remote;

  const source = headers || {};
  const header = normalizeTrustedProxyHeader(trustedHeader);
  if (!header) return remote;

  if (header === 'x-forwarded-for') {
    try {
      const resolved = normalizeIp(proxyaddr({ headers: source, socket: { remoteAddress: remote } }, trustProxy));
      return resolved || remote;
    } catch {
      return remote;
    }
  }

  const raw = String(source[header] || '').trim();
  if (!raw || raw.includes(',')) return remote;
  return normalizeIp(raw) || remote;
}

module.exports = { normalizeIp, normalizeTrustedProxyHeader, createTrustedProxyTrust, resolveClientIp };
