import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/storage.js', import.meta.url), 'utf8');
const match = source.match(/function parseAiSseEvents[\s\S]*?\n}\n\nasync function streamAiChat/);
assert.ok(match, 'parseAiSseEvents must remain in storage.js');
const context = {};
vm.runInNewContext(`${match[0].replace(/\n\nasync function streamAiChat[\s\S]*$/, '')}\n globalThis.parseAiSseEvents = parseAiSseEvents;`, context);

const frames = [
  'event: status\ndata: {"phase":"searching","message":"正在查找"}\n\n',
  'event: answer.delta\ndata: {"delta":"含有🚀 和 \\"转义\\""}\n\n',
  'event: answer.completed\ndata: {"answer":"第一行\\n第二行","usage":{"output_tokens":3}}\n\n',
];
const joined = frames.join('');
let buffer = '';
const events = [];
for (let index = 0; index < joined.length; index += 1) {
  buffer += joined[index];
  const parsed = context.parseAiSseEvents(buffer);
  buffer = parsed.rest;
  events.push(...parsed.events);
}
events.push(...context.parseAiSseEvents(buffer, true).events);
assert.equal(events.length, 3);
assert.equal(events[0].type, 'status');
assert.equal(events[0].message, '正在查找');
assert.equal(events[1].type, 'answer.delta');
assert.equal(events[1].delta, '含有🚀 和 "转义"');
assert.equal(events[2].answer, '第一行\n第二行');
assert.equal(JSON.stringify(events[2].usage), JSON.stringify({ output_tokens: 3 }));

const partial = 'event: answer.delta\ndata: {"delta":"尾部"}';
assert.equal(context.parseAiSseEvents(partial).events.length, 0);
assert.equal(context.parseAiSseEvents(partial, true).events[0].delta, '尾部');
console.log('AI_COMPANION_SSE_OK');
