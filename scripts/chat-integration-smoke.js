'use strict';

const assert = require('node:assert/strict');

const baseUrl = String(process.env.RIMAZ_BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const socketUrl = baseUrl.replace(/^http/, 'ws') + '/socket.io/?EIO=4&transport=websocket';
const timeoutMs = 10000;

async function requestJson(path, options = {}) {
  const response = await fetch(baseUrl + path, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(path + ' returned HTTP ' + response.status + ': ' + (body.error || 'request failed'));
  return body;
}

class SocketIoProbe {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.waiters = new Map();
  }

  async connect() {
    if (typeof WebSocket !== 'function') throw new Error('Node.js WebSocket support is required for Socket.IO integration tests');
    await new Promise((resolve, reject) => {
      const ws = this.ws = new WebSocket(socketUrl);
      const timer = setTimeout(() => reject(new Error('Socket.IO handshake timed out')), timeoutMs);
      ws.addEventListener('message', event => {
        const packet = String(event.data);
        if (packet.startsWith('0')) {
          ws.send('40');
          return;
        }
        if (packet === '2') {
          ws.send('3');
          return;
        }
        if (packet.startsWith('40')) {
          this.connected = true;
          clearTimeout(timer);
          resolve();
          return;
        }
        if (packet.startsWith('42')) {
          let data;
          try { data = JSON.parse(packet.slice(2)); } catch { return; }
          if (!Array.isArray(data) || typeof data[0] !== 'string') return;
          const name = data[0], payload = data[1];
          const waiters = this.waiters.get(name) || [];
          for (const waiter of [...waiters]) {
            if (!waiter.predicate || waiter.predicate(payload)) {
              clearTimeout(waiter.timer);
              this.waiters.set(name, waiters.filter(item => item !== waiter));
              waiter.resolve(payload);
            }
          }
        }
        if (packet.startsWith('44')) {
          clearTimeout(timer);
          reject(new Error('Socket.IO rejected namespace connection: ' + packet));
        }
      });
      ws.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('Socket.IO WebSocket transport failed'));
      }, { once: true });
      ws.addEventListener('close', () => {
        if (!this.connected) {
          clearTimeout(timer);
          reject(new Error('Socket.IO transport closed before connection'));
        }
      });
    });
  }

  emit(name, payload) {
    if (!this.connected || this.ws.readyState !== WebSocket.OPEN) throw new Error('Socket.IO probe is not connected');
    this.ws.send('42' + JSON.stringify([name, payload]));
  }

  waitFor(name, predicate = null, timeout = timeoutMs) {
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        timer: setTimeout(() => {
          const list = this.waiters.get(name) || [];
          this.waiters.set(name, list.filter(item => item !== waiter));
          reject(new Error('Timed out waiting for Socket.IO event: ' + name));
        }, timeout)
      };
      const list = this.waiters.get(name) || [];
      list.push(waiter);
      this.waiters.set(name, list);
    });
  }

  close() {
    if (this.ws && this.ws.readyState < WebSocket.CLOSING) this.ws.close(1000, 'integration test complete');
  }
}

async function createAccount(path, name, password) {
  return requestJson(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, password })
  });
}

async function joinRoom(client, sid, room) {
  const history = client.waitFor('history', value => value?.room === room);
  client.emit('join', { sid, room });
  await history;
}

async function main() {
  const clients = [];
  try {
    const alpha = await createAccount('/api/register', 'admin', 'Rimaz-CI-Admin-Password-2026!');
    const beta = await createAccount('/api/guest', 'integration-peer', undefined);
    const intruder = await createAccount('/api/guest', 'integration-outsider', undefined);
    const first = new SocketIoProbe(), second = new SocketIoProbe();
    clients.push(first, second);
    await Promise.all([first.connect(), second.connect()]);
    await Promise.all([joinRoom(first, alpha.sid, 'public'), joinRoom(second, beta.sid, 'public')]);

    const publicMarker = 'rimaz-ci-public-' + Date.now();
    const publicMessage = second.waitFor('message', value => value?.text === publicMarker && value?.from === 'admin');
    first.emit('send-message', { room: 'public', text: publicMarker });
    await publicMessage;

    const privateMarker = 'rimaz-ci-private-' + Date.now();
    const privateMessage = second.waitFor('private-message', value => value?.text === privateMarker && value?.from === 'admin');
    first.emit('private-message', { to: 'integration-peer', text: privateMarker });
    await privateMessage;

    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64');
    const form = new FormData();
    form.append('file', new Blob([png], { type: 'image/png' }), 'private-test.png');
    form.append('scope', 'private');
    form.append('to', 'integration-peer');
    const privateMediaEvent = second.waitFor('private-media', value => value?.from === 'admin');
    const uploaded = await requestJson('/api/media', { method: 'POST', headers: { 'x-session': alpha.sid }, body: form });
    assert.match(uploaded.media.url, /^\/api\/private\/media\/[a-zA-Z0-9._-]+$/);
    const deliveredMedia = await privateMediaEvent;
    assert.equal(deliveredMedia.media.url, uploaded.media.url, 'private media must be delivered to the intended recipient');

    const denied = await fetch(baseUrl + uploaded.media.url, { headers: { 'x-session': intruder.sid } });
    assert.equal(denied.status, 404, 'unrelated account must not read private media');
    const ticket = await requestJson('/api/private/media-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-session': beta.sid },
      body: JSON.stringify({ url: uploaded.media.url })
    });
    const streamed = await fetch(new URL(ticket.url, baseUrl));
    assert.equal(streamed.status, 200, 'recipient playback ticket must stream private media');
    const streamedBytes = Buffer.from(await streamed.arrayBuffer());
    assert.deepEqual(streamedBytes.subarray(0, 8), png.subarray(0, 8), 'private media stream must preserve PNG signature');

    await Promise.all([joinRoom(first, alpha.sid, 'voice'), joinRoom(second, beta.sid, 'voice')]);
    const micGranted = first.waitFor('voice-mic-granted');
    first.emit('request-mic', { room: 'voice', raised: true, seatIndex: 0 });
    await micGranted;

    const offer = { type: 'offer', sdp: 'v=0\r\n' };
    const voiceOffer = second.waitFor('voice-peer-offer', value => value?.from === alpha.sid);
    first.emit('voice-peer-offer', { room: 'voice', to: beta.sid, offer });
    await voiceOffer;

    const answer = { type: 'answer', sdp: 'v=0\r\n' };
    const voiceAnswer = first.waitFor('voice-peer-answer', value => value?.from === beta.sid);
    second.emit('voice-peer-answer', { room: 'voice', to: alpha.sid, answer });
    await voiceAnswer;

    const incomingCall = second.waitFor('call-offer', value => value?.from === 'admin');
    first.emit('call-offer', { to: 'integration-peer', offer, video: true });
    await incomingCall;
    const accepted = second.waitFor('call-answer-accepted');
    const callerAnswer = first.waitFor('call-answer', value => value?.from === 'integration-peer');
    second.emit('call-answer', { to: 'admin', answer });
    await Promise.all([accepted, callerAnswer]);

    console.log('✓ authenticated public chat, private text/media authorization and playback, voice-room negotiation, and video-call signaling');
  } finally {
    for (const client of clients) client.close();
  }
}

main().catch(error => {
  console.error('✗ authenticated chat integration smoke test:', error.message);
  process.exitCode = 1;
});
