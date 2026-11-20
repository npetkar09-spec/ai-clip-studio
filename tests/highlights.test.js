const test = require('node:test');
const assert = require('node:assert/strict');
const { suggestHighlights, DEFAULT_OPTIONS } = require('../build/src/highlights');

// Synthetic transcript: 5-second sentences, 1 second pauses, ~10 minutes.
function makeTranscript(lines) {
  let t = 0;
  return lines.map((text) => {
    const seg = { startMs: t, endMs: t + 5000, text };
    t += 6000;
    return seg;
  });
}

const filler = 'And so we went over to the other room and looked at it for a while.';
const hookBlock = [
  'Here is the one thing nobody tells you about saving money?',
  'Most people never track their spending, and that is the biggest mistake.',
  'You need to write down every purchase for thirty days.',
  'It sounds boring, but the results are incredible.',
  'Spending tracking shows you where your money actually goes.',
  'Once you see it, you will stop wasting money on things you hate.',
  'That simple habit changed my life.',
];

function longTranscript() {
  const lines = [];
  for (let i = 0; i < 100; i++) lines.push(filler);
  lines.splice(40, 0, ...hookBlock);
  return makeTranscript(lines);
}

test('returns no highlights for empty or invalid input', () => {
  assert.deepEqual(suggestHighlights([]), []);
  assert.deepEqual(suggestHighlights([{ startMs: 5, endMs: 5, text: 'x.' }, { startMs: 0, endMs: 10, text: '   ' }]), []);
});

test('returns at most the requested count, sorted by score', () => {
  const out = suggestHighlights(longTranscript());
  assert.ok(out.length > 0 && out.length <= DEFAULT_OPTIONS.count);
  for (let i = 1; i < out.length; i++) assert.ok(out[i - 1].score >= out[i].score);
});

test('clip lengths respect min and max', () => {
  for (const h of suggestHighlights(longTranscript())) {
    const d = h.endMs - h.startMs;
    assert.ok(d >= DEFAULT_OPTIONS.minMs && d <= DEFAULT_OPTIONS.maxMs, `duration ${d}`);
  }
});

test('boundaries land on transcript segment boundaries', () => {
  const t = longTranscript();
  const starts = new Set(t.map((s) => s.startMs));
  const ends = new Set(t.map((s) => s.endMs));
  for (const h of suggestHighlights(t)) {
    assert.ok(starts.has(h.startMs));
    assert.ok(ends.has(h.endMs));
  }
});

test('selected clips do not overlap beyond the limit', () => {
  const out = suggestHighlights(longTranscript());
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const inter = Math.min(out[i].endMs, out[j].endMs) - Math.max(out[i].startMs, out[j].startMs);
      const frac = inter > 0 ? inter / Math.min(out[i].endMs - out[i].startMs, out[j].endMs - out[j].startMs) : 0;
      assert.ok(frac <= DEFAULT_OPTIONS.maxOverlap);
    }
  }
});

test('the hook-rich passage outranks filler and is the top suggestion', () => {
  const t = longTranscript();
  const top = suggestHighlights(t)[0];
  const hookStart = t[40].startMs;
  const hookEnd = t[46].endMs;
  assert.ok(top.startMs >= hookStart - 6000 && top.startMs <= hookEnd, `top starts at ${top.startMs}`);
  assert.match(top.reason, /^Selected because it /);
});

test('is deterministic', () => {
  const t = longTranscript();
  assert.deepEqual(suggestHighlights(t), suggestHighlights(t));
});

test('does not cross long silent gaps', () => {
  const t = makeTranscript(Array(12).fill('This is a complete sentence about topics.'));
  t[6].startMs += 20000; t[6].endMs += 20000;
  for (let i = 7; i < t.length; i++) { t[i].startMs += 20000; t[i].endMs += 20000; }
  for (const h of suggestHighlights(t)) {
    const gapCrossed = h.startMs < t[6].startMs && h.endMs > t[6].startMs;
    assert.equal(gapCrossed, false);
  }
});

test('scores stay within 0-100 and carry a version', () => {
  for (const h of suggestHighlights(longTranscript())) {
    assert.ok(h.score >= 0 && h.score <= 100);
    assert.equal(h.scoringVersion, 'heuristic-v0.1');
  }
});
