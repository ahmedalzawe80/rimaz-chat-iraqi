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
    this.acknowledgements = new Map();
    this.nextAckId = 0;
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
        if (packet.startsWith('43')) {
          const match = packet.match(/^43(\d+)(.*)$/);
          if (!match) return;
          const acknowledgement = this.acknowledgements.get(Number(match[1]));
          if (!acknowledgement) return;
          let values;
          try { values = JSON.parse(match[2]); } catch { return; }
          clearTimeout(acknowledgement.timer);
          this.acknowledgements.delete(Number(match[1]));
          acknowledgement.resolve(values[0]);
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

  emitWithAck(name, payload, timeout = timeoutMs) {
    if (!this.connected || this.ws.readyState !== WebSocket.OPEN) throw new Error('Socket.IO probe is not connected');
    const id = this.nextAckId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.acknowledgements.delete(id);
        reject(new Error('Timed out waiting for Socket.IO acknowledgement: ' + name));
      }, timeout);
      this.acknowledgements.set(id, { resolve, reject, timer });
      this.ws.send('42' + id + JSON.stringify([name, payload]));
    });
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

async function assertNoEvent(client, name, emit, timeout = 300) {
  const unexpected = client.waitFor(name, null, timeout);
  emit();
  await assert.rejects(unexpected, new RegExp('Timed out waiting for Socket.IO event: ' + name));
}

async function main() {
  const clients = [];
  try {
    const alpha = await createAccount('/api/register', 'admin', 'Rimaz-CI-Admin-Password-2026!');
    const beta = await createAccount('/api/guest', 'integration-peer', undefined);
    const intruder = await createAccount('/api/guest', 'integration-outsider', undefined);
    const first = new SocketIoProbe(), second = new SocketIoProbe(), outsider = new SocketIoProbe();
    clients.push(first, second, outsider);
    await Promise.all([first.connect(), second.connect(), outsider.connect()]);
    await Promise.all([joinRoom(first, alpha.sid, 'public'), joinRoom(second, beta.sid, 'public')]);

    const publicMarker = 'rimaz-ci-public-' + Date.now();
    const publicRequestId = 'smoke-public-' + Date.now();
    const publicMessage = second.waitFor('message', value => value?.text === publicMarker && value?.from === 'admin');
    const publicAck = await first.emitWithAck('send-message', { room: 'public', text: publicMarker, requestId: publicRequestId });
    assert.equal(publicAck?.ok, true, 'public message must be acknowledged after durable acceptance');
    assert.ok(publicAck.messageId, 'public acknowledgement must include the stored message ID');
    await publicMessage;
    const duplicatePublicAck = await first.emitWithAck('send-message', { room: 'public', text: publicMarker, requestId: publicRequestId });
    assert.equal(duplicatePublicAck.messageId, publicAck.messageId, 'public retry must reuse original result');
    const duplicatePublicBroadcast = first.waitFor('message', value => value?.id === publicAck.messageId, 300);
    first.emit('send-message', { room: 'public', text: publicMarker, requestId: publicRequestId });
    await assert.rejects(duplicatePublicBroadcast, /Timed out waiting for Socket.IO event: message/);
    const rejectedPublicAck = await first.emitWithAck('send-message', { room: 'missing-room', text: 'must be rejected', requestId: 'smoke-rejected-' + Date.now() });
    assert.equal(rejectedPublicAck?.ok, false, 'invalid room must return a negative acknowledgement');

    const privateMarker = 'rimaz-ci-private-' + Date.now();
    const privateRequestId = 'smoke-private-' + Date.now();
    const privateMessage = second.waitFor('private-message', value => value?.text === privateMarker && value?.from === 'admin');
    const privateAck = await first.emitWithAck('private-message', { to: 'integration-peer', text: privateMarker, requestId: privateRequestId });
    assert.equal(privateAck?.ok, true, 'private message must be acknowledged after in-memory acceptance');
    assert.ok(privateAck.messageId, 'private acknowledgement must include accepted message ID');
    await privateMessage;
    const duplicatePrivateAck = await first.emitWithAck('private-message', { to: 'integration-peer', text: privateMarker, requestId: privateRequestId });
    assert.equal(duplicatePrivateAck.messageId, privateAck.messageId, 'private retry must reuse original result');
    const duplicatePrivateDelivery = second.waitFor('private-message', value => value?.id === privateAck.messageId, 300);
    first.emit('private-message', { to: 'integration-peer', text: privateMarker, requestId: privateRequestId });
    await assert.rejects(duplicatePrivateDelivery, /Timed out waiting for Socket.IO event: private-message/);

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
    const ticketUrl = new URL(ticket.url, baseUrl);
    const ranged = await fetch(ticketUrl, { headers: { Range: 'bytes=0-7' } });
    assert.equal(ranged.status, 206, 'private media stream must support byte-range requests for seeking');
    assert.equal(ranged.headers.get('content-range'), 'bytes 0-7/' + png.length);
    const rangedBytes = Buffer.from(await ranged.arrayBuffer());
    assert.deepEqual(rangedBytes, png.subarray(0, 8), 'private media range must return the exact requested bytes');

    const streamed = await fetch(ticketUrl);
    assert.equal(streamed.status, 200, 'recipient playback ticket must stream private media');
    const streamedBytes = Buffer.from(await streamed.arrayBuffer());
    assert.deepEqual(streamedBytes, png, 'private media stream must preserve the complete file');

    const wrongFilenameUrl = new URL(ticketUrl);
    wrongFilenameUrl.pathname += '.wrong';
    const wrongFilename = await fetch(wrongFilenameUrl);
    assert.equal(wrongFilename.status, 401, 'playback ticket must be bound to its exact media filename');

    const emptyVoiceState = second.waitFor('voice-state', value => value?.room === 'voice' && value.count === 0);
    await Promise.all([joinRoom(first, alpha.sid, 'voice'), joinRoom(second, beta.sid, 'voice')]);
    await emptyVoiceState;
    const micGranted = first.waitFor('voice-mic-granted');
    const initialVoiceState = second.waitFor('voice-state', value => value?.room === 'voice' && value.count === 1);
    first.emit('request-mic', { room: 'voice', raised: true, seatIndex: 0 });
    await Promise.all([micGranted, initialVoiceState]);

    const duplicateGrant = first.waitFor('voice-mic-granted');
    await assertNoEvent(second, 'voice-state', () => {
      first.emit('request-mic', { room: 'voice', raised: true, seatIndex: 0 });
    });
    await duplicateGrant;

    const offer = { type: 'offer', sdp: 'v=0\r\n' };
    const voiceOffer = second.waitFor('voice-peer-offer', value => value?.from === alpha.sid);
    first.emit('voice-peer-offer', { room: 'voice', to: beta.sid, offer });
    await voiceOffer;

    const answer = { type: 'answer', sdp: 'v=0\r\n' };
    const voiceAnswer = first.waitFor('voice-peer-answer', value => value?.from === beta.sid);
    second.emit('voice-peer-answer', { room: 'voice', to: alpha.sid, answer });
    await voiceAnswer;
    await assertNoEvent(outsider, 'voice-peer-offer', () => {
      first.emit('voice-peer-offer', { room: 'voice', to: intruder.sid, offer });
    });

    const incomingCall = second.waitFor('call-offer', value => value?.from === 'admin');
    first.emit('call-offer', { to: 'integration-peer', offer, video: true });
    await incomingCall;
    const accepted = second.waitFor('call-answer-accepted');
    const callerAnswer = first.waitFor('call-answer', value => value?.from === 'integration-peer');
    second.emit('call-answer', { to: 'admin', answer });
    await Promise.all([accepted, callerAnswer]);
    await assertNoEvent(first, 'call-answer', () => {
      outsider.emit('call-answer', { to: 'admin', answer });
    });

    const lowered = first.waitFor('voice-mic-lowered');
    const loweredState = second.waitFor('voice-state', value => value?.room === 'voice' && value.count === 0);
    first.emit('request-mic', { room: 'voice', raised: false });
    await Promise.all([lowered, loweredState]);
    const duplicateLowered = first.waitFor('voice-mic-lowered');
    await assertNoEvent(second, 'voice-state', () => {
      first.emit('request-mic', { room: 'voice', raised: false });
    });
    await duplicateLowered;

    console.log('✓ authenticated public chat, private text/media authorization and playback, idempotent room-mic transitions, room-scoped voice signaling, and authorized video-call signaling');
  } finally {
    for (const client of clients) client.close();
  }
}

main().catch(error => {
  console.error('✗ authenticated chat integration smoke test:', error.message);
  process.exitCode = 1;
});
