// The production-only paths the gate cannot reach: a real reply, the consent
// dialog, the two cap messages, and the request the server builds for the
// proxy. Driven with fabricated answers, no browser and no proxy.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  classify, sendMessage, usageState, formatCents, historyFor, MESSAGES, LIMIT_SHARE,
} from '../public/assistant.js';
import { formatTimecode, timecodePair, withTrim, trackModel, nextSlot } from '../public/timeline.js';
import { describeRequest, describeExport, SIM_LINE } from '../public/generate.js';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { buildProxyRequest, parseMeterHeaders, callProxy, replyText, overLimit, SPEND_SHARE } = require('../lib/llm-proxy.js');

function refusal(status, code) {
  const err = new Error('refused');
  err.status = status;
  err.code = code;
  return err;
}

test('classify names each platform state in the app\'s own words', () => {
  assert.equal(classify(200, '').state, 'reply');
  assert.deepEqual(classify(403, 'grant_required'), { state: 'grant_required' });
  assert.equal(classify(429, 'app_cap_exceeded').text, 'Daily AI cap for this app reached, resets at midnight UTC.');
  assert.equal(classify(429, 'budget_exceeded').text, 'Your daily AI budget is used up for today, resets at midnight UTC.');
  assert.equal(classify(503, 'assistant_unavailable').text, 'AI assistant unavailable in this environment.');
  assert.equal(classify(500, '').state, 'failed');
});

test('a grant_required answer opens the platform dialog and retries the same message once', async () => {
  const posts = [];
  let calls = 0;
  const deps = {
    post: async (text) => { posts.push(text); calls += 1; if (calls === 1) throw refusal(403, 'grant_required'); return { reply: 'Hello' }; },
    requestAccess: async () => ({ granted: true, dailyCapCents: 50, allowByok: false }),
  };
  const out = await sendMessage('Draft a title', [], deps);
  assert.equal(out.state, 'reply');
  assert.equal(out.reply.reply, 'Hello');
  assert.deepEqual(posts, ['Draft a title', 'Draft a title']);
});

test('a declined grant posts nothing more and prints the declined line', async () => {
  let calls = 0;
  const out = await sendMessage('Hi', [], {
    post: async () => { calls += 1; throw refusal(403, 'grant_required'); },
    requestAccess: async () => ({ granted: false, declined: true }),
  });
  assert.equal(calls, 1);
  assert.equal(out.state, 'declined');
  assert.equal(out.text, MESSAGES.declined);
});

test('a 429 is never retried and names the right cap', async () => {
  let calls = 0;
  const cap = await sendMessage('Hi', [], { post: async () => { calls += 1; throw refusal(429, 'app_cap_exceeded'); } });
  assert.equal(calls, 1);
  assert.equal(cap.state, 'app_cap');
  const budget = await sendMessage('Hi', [], { post: async () => { throw refusal(429, 'budget_exceeded'); } });
  assert.equal(budget.state, 'budget');
  assert.match(budget.text, /midnight UTC/);
});

test('503 assistant_unavailable is the unavailable state', async () => {
  const out = await sendMessage('Hi', [], { post: async () => { throw refusal(503, 'assistant_unavailable'); } });
  assert.equal(out.state, 'unavailable');
  assert.equal(out.text, 'AI assistant unavailable in this environment.');
});

test('the meter reads the three states and prints the limit', () => {
  assert.equal(usageState(false, { granted: true, spentCentsToday: 5, dailyCapCents: 100 }, null).state, 'unavailable');
  const r = usageState(true, { granted: true, spentCentsToday: 4.7914, dailyCapCents: 100 }, null);
  assert.equal(r.state, 'reading');
  assert.equal(r.text, 'AI today $0.05 of $1.00, limit $0.25');
  assert.equal(r.limit, 25);
  assert.equal(r.warn, false);
  assert.equal(r.limited, false);
  assert.equal(usageState(true, { granted: false }, null).text, 'AI permission not granted');
  const near = usageState(true, null, { spentCents: 23, capCents: 100 });
  assert.equal(near.state, 'reading');
  assert.equal(near.warn, true);
  assert.equal(near.limited, false);
  const at = usageState(true, null, { spentCents: 25, capCents: 100 });
  assert.equal(at.limited, true);
  assert.equal(at.pct, 100);
  assert.equal(at.warn, true);
  const zero = usageState(true, { granted: true, spentCentsToday: 5, dailyCapCents: 0 }, null);
  assert.equal(zero.limited, false);
  assert.equal(zero.pct, 0);
  assert.equal(usageState(true, null, null).state, 'unavailable');
  assert.equal(formatCents('x'), '$0.00');
});

test('overLimit is a quarter of the cap, never tripped by a zero or missing reading', () => {
  assert.equal(overLimit(24.99, 100), false);
  assert.equal(overLimit(25, 100), true);
  assert.equal(overLimit(5, 0), false);
  assert.equal(overLimit(5, null), false);
  assert.equal(overLimit(null, 100), false);
});

test('server and client share the same spend share', () => {
  assert.equal(SPEND_SHARE, 0.25);
  assert.equal(LIMIT_SHARE, 0.25);
  assert.equal(SPEND_SHARE, LIMIT_SHARE);
});

test('classify names the app limit in the app\'s own words', () => {
  assert.deepEqual(classify(429, 'app_limit_reached'), { state: 'app_limit', text: MESSAGES.appLimit });
});

test('the app limit is answered like a cap and never retried', async () => {
  let calls = 0;
  const out = await sendMessage('Hi', [], {
    post: async () => { calls += 1; throw refusal(429, 'app_limit_reached'); },
  });
  assert.equal(calls, 1);
  assert.equal(out.state, 'app_limit');
  assert.equal(out.text, MESSAGES.appLimit);
});

test('the system prompt names the wider refusals', () => {
  const src = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const start = src.indexOf('const ASSISTANT_SYSTEM');
  assert.ok(start > -1, 'ASSISTANT_SYSTEM not found');
  const block = src.slice(start, src.indexOf('].join', start));
  for (const word of ['children', 'minors', 'explicit', 'nude', 'violent', 'weapons', 'gambling']) {
    assert.ok(block.includes(word), 'ASSISTANT_SYSTEM should name ' + word);
  }
});

test('the new copy carries no em dash', () => {
  for (const line of [MESSAGES.appLimit, MESSAGES.declines]) {
    assert.ok(!line.includes('—'), 'copy should not contain an em dash: ' + line);
  }
});

test('history keeps the last ten turns in the proxy shape', () => {
  const turns = Array.from({ length: 14 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', body: 'turn ' + i }));
  const h = historyFor(turns);
  assert.equal(h.length, 10);
  assert.deepEqual(h[0], { role: 'user', content: 'turn 4' });
});

test('the proxy request carries the app token, the forwarded user token and the Messages shape', () => {
  const req = buildProxyRequest({
    proxyUrl: 'http://usernode:3000/api/app-llm/', appToken: 'app-secret', userToken: 'user-jwt',
    body: { model: 'claude-sonnet-5-5', max_tokens: 600, messages: [{ role: 'user', content: 'hi' }] },
  });
  assert.equal(req.url, 'http://usernode:3000/api/app-llm/v1/messages');
  assert.equal(req.options.method, 'POST');
  assert.equal(req.options.headers['x-usernode-app-token'], 'app-secret');
  assert.equal(req.options.headers['x-usernode-user-token'], 'user-jwt');
  assert.equal(req.options.headers['anthropic-version'], '2023-06-01');
  assert.equal(JSON.parse(req.options.body).model, 'claude-sonnet-5-5');
});

test('the meter headers are read as numbers, fractional spend kept', () => {
  const m = parseMeterHeaders(new Map([['x-usernode-llm-spent-cents', '4.7914'], ['x-usernode-llm-cap-cents', '100']]));
  assert.deepEqual(m, { spentCents: 4.7914, capCents: 100 });
  assert.deepEqual(parseMeterHeaders(new Map()), { spentCents: null, capCents: null });
});

test('callProxy maps the proxy\'s answers and never leaks upstream text', async () => {
  const fake = (status, body, headers) => async () => ({
    status, headers: new Map(Object.entries(headers || {})), json: async () => body,
  });
  const ok = await callProxy({ proxyUrl: 'http://p', appToken: 'a', userToken: 'u', body: {},
    fetchImpl: fake(200, { model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'A title' }, { type: 'tool_use' }] },
      { 'x-usernode-llm-spent-cents': '1.5', 'x-usernode-llm-cap-cents': '50' }) });
  assert.equal(ok.status, 200);
  assert.equal(ok.text, 'A title');
  assert.deepEqual(ok.meter, { spentCents: 1.5, capCents: 50 });
  const grant = await callProxy({ proxyUrl: 'http://p', appToken: 'a', userToken: 'u', body: {}, fetchImpl: fake(403, { code: 'grant_required' }) });
  assert.equal(grant.code, 'grant_required');
  const cap = await callProxy({ proxyUrl: 'http://p', appToken: 'a', userToken: 'u', body: {}, fetchImpl: fake(429, { code: 'app_cap_exceeded' }, { 'x-usernode-llm-spent-cents': '50', 'x-usernode-llm-cap-cents': '50' }) });
  assert.equal(cap.status, 429);
  assert.equal(cap.meter.spentCents, 50);
  const bad = await callProxy({ proxyUrl: 'http://p', appToken: 'a', userToken: 'u', body: {}, fetchImpl: fake(500, { error: 'upstream secret detail' }) });
  assert.equal(bad.status, 502);
  assert.equal(bad.text, '');
  assert.equal(replyText({ content: [] }), '');
  const down = await callProxy({ proxyUrl: 'http://p', appToken: 'a', userToken: 'u', body: {}, fetchImpl: async () => { throw new Error('net'); } });
  assert.equal(down.status, 0);
});

test('the timecode is one printed reading', () => {
  assert.equal(formatTimecode(100000), '01:40');
  assert.equal(timecodePair(98000, 100000), '01:38/01:40');
  assert.equal(timecodePair(500000, 100000), '01:40/01:40');
  assert.equal(formatTimecode(-5), '00:00');
});

test('a trim can never make a negative block or pass the end', () => {
  const c = withTrim({ startMs: 34000, endMs: 54000, trimInMs: 99999 }, 99999, 100000);
  assert.equal(c.trimInMs, 54000 - 34000 - 250);
  const past = withTrim({ startMs: 90000, endMs: 150000, trimInMs: 0 }, 0, 100000);
  assert.equal(past.endMs, 100000);
  const lanes = trackModel([{ id: 't', kind: 'clip', sortOrder: 0 }], [{ id: 'c', trackId: 't', startMs: 0, endMs: 50000, trimInMs: 0 }], [], 100000);
  assert.equal(lanes[0].clips[0].widthPct, 50);
  assert.deepEqual(nextSlot([{ endMs: 90000 }], 0, 5000, 100000), { startMs: 90000, endMs: 95000 });
  assert.equal(nextSlot([{ endMs: 99900 }], 0, 5000, 100000), null);
});

test('the simulated panels print the request and the simulation line, never a price', () => {
  const lines = describeRequest('video', { name: 'Demo', aspect: '16:9', resolution: '4K', cameraPreset: 'orbit', motionPreset: 'natural', motionRealism: 7 });
  assert.match(lines[0], /Generate Video requested for Demo/);
  assert.equal(lines[lines.length - 1], SIM_LINE);
  assert.ok(!lines.join(' ').match(/credit|\$/i));
  assert.match(describeExport({ name: 'Demo', aspect: '16:9', resolution: '1K', durationMs: 100000 })[2], /No file was written/);
});
