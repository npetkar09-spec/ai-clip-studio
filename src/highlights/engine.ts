import type { Highlight, HighlightFeatures, HighlightOptions, TranscriptSegment } from './types';

export const SCORING_VERSION = 'heuristic-v0.1';

export const DEFAULT_OPTIONS: HighlightOptions = {
  count: 5,
  minMs: 15_000,
  maxMs: 60_000,
  idealMs: 35_000,
  maxInnerGapMs: 2_500,
  maxOverlap: 0.3,
};

// Experimental weights (hypotheses to evaluate with real feedback). Sum = 1.
// Visual and audio signals are not available in the prototype, so their share
// from the roadmap is folded into transcript-based signals.
const WEIGHTS: Record<keyof HighlightFeatures, number> = {
  hook: 0.2,
  emotion: 0.15,
  content: 0.25,
  standalone: 0.2,
  completeness: 0.1,
  durationFit: 0.1,
};

const STOPWORDS = new Set(
  ('a an the and or but if so of to in on at for from with by as is are was were be been being it its this that these those ' +
    'i you he she we they me him her us them my your his our their do does did have has had not no yes just very really ' +
    'then than too also can could would should will about into over out up down off there here what when where who how why which')
    .split(' '),
);

const HOOK_PHRASES = [
  'here is', "here's", 'the secret', 'the truth', 'the biggest', 'the best', 'the worst', 'the first', 'the one thing',
  'nobody tells', 'no one tells', 'most people', 'you need to', 'you should', 'you have to', 'stop', 'never', 'always',
  'imagine', 'what if', 'let me tell you', 'did you know', 'the reason', 'the problem', 'the mistake', 'in this video',
  'here are', 'number one', 'the key',
];

const EMOTION_WORDS = new Set([
  'amazing', 'incredible', 'unbelievable', 'insane', 'crazy', 'shocking', 'terrible', 'horrible', 'love', 'hate',
  'afraid', 'scared', 'angry', 'excited', 'surprised', 'wow', 'best', 'worst', 'disaster', 'miracle', 'huge', 'painful',
  'beautiful', 'powerful', 'dangerous', 'impossible', 'fantastic', 'brilliant', 'ridiculous', 'hilarious', 'funny',
]);

// Starting a clip with these usually means it needs earlier context.
const DEPENDENT_STARTS = new Set([
  'and', 'but', 'so', 'because', 'which', 'also', 'then', 'however', 'anyway', 'like', 'or', 'yet', 'plus',
  'it', 'this', 'that', 'they', 'he', 'she', 'those', 'these', 'them',
]);

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

function endsSentence(text: string): boolean {
  return /[.!?]["')\]]?\s*$/.test(text.trim());
}

function cleanSegments(input: TranscriptSegment[]): TranscriptSegment[] {
  return input
    .filter((s) => Number.isFinite(s.startMs) && Number.isFinite(s.endMs) && s.endMs > s.startMs && s.text.trim().length > 0)
    .map((s) => ({ startMs: Math.round(s.startMs), endMs: Math.round(s.endMs), text: s.text.trim() }))
    .sort((a, b) => a.startMs - b.startMs);
}

interface Candidate {
  from: number;
  to: number; // inclusive segment indexes
  startMs: number;
  endMs: number;
}

function buildCandidates(segs: TranscriptSegment[], opt: HighlightOptions): Candidate[] {
  const out: Candidate[] = [];
  for (let i = 0; i < segs.length; i++) {
    // A clip should begin where a thought begins: first segment, or after a sentence end / pause.
    const prev = segs[i - 1];
    const startsClean = !prev || endsSentence(prev.text) || segs[i].startMs - prev.endMs >= 700;
    if (!startsClean) continue;
    for (let j = i; j < segs.length; j++) {
      if (j > i && segs[j].startMs - segs[j - 1].endMs > opt.maxInnerGapMs) break;
      const dur = segs[j].endMs - segs[i].startMs;
      if (dur > opt.maxMs) break;
      if (dur >= opt.minMs && endsSentence(segs[j].text)) {
        out.push({ from: i, to: j, startMs: segs[i].startMs, endMs: segs[j].endMs });
      }
    }
  }
  return out;
}

function hasHook(text: string): boolean {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9?' ]+/g, ' ')} `;
  return HOOK_PHRASES.some((p) => t.includes(` ${p}`)) || /\b\d+\b/.test(t) || text.includes('?');
}

function computeFeatures(
  segs: TranscriptSegment[],
  c: Candidate,
  opt: HighlightOptions,
  termFreq: Map<string, number>,
): HighlightFeatures {
  const clip = segs.slice(c.from, c.to + 1);
  const text = clip.map((s) => s.text).join(' ');
  const ws = words(text);
  const durS = (c.endMs - c.startMs) / 1000;

  // Hook: the opening sentence(s) grab attention.
  const opening = clip.slice(0, 2).map((s) => s.text).join(' ');
  let hook = 0;
  if (hasHook(opening)) hook += 0.6;
  if (clip[0].text.includes('?')) hook += 0.25;
  if (/\b(you|your)\b/i.test(clip[0].text)) hook += 0.15;
  hook = clamp01(hook);

  // Emotion: emphatic words and punctuation, normalised by length.
  let emoHits = 0;
  for (const w of ws) if (EMOTION_WORDS.has(w)) emoHits++;
  const bangs = (text.match(/!/g) ?? []).length;
  const emotion = clamp01((emoHits + bangs * 0.6) / Math.max(3, ws.length / 25));

  // Content: density of distinctive terms that recur across the whole video (topic words), plus pace.
  const contentWords = ws.filter((w) => w.length > 3 && !STOPWORDS.has(w));
  let topical = 0;
  for (const w of contentWords) if ((termFreq.get(w) ?? 0) > 1) topical++;
  const density = contentWords.length / Math.max(1, ws.length);
  const topicShare = topical / Math.max(1, contentWords.length);
  const wps = ws.length / Math.max(1, durS);
  const pace = wps >= 1.8 && wps <= 3.8 ? 1 : wps >= 1.2 && wps <= 4.5 ? 0.6 : 0.2;
  const content = clamp01((0.4 * density) / 0.55 + 0.35 * topicShare + 0.25 * pace);

  // Standalone: understandable without earlier context.
  const fw = words(clip[0].text)[0] ?? '';
  let standalone = DEPENDENT_STARTS.has(fw) ? 0.3 : 0.9;
  if (c.from === 0) standalone = Math.max(standalone, 0.8);
  if (/\b(as i said|like i said|as we saw|earlier|previously|the last one|that one)\b/i.test(text)) standalone -= 0.25;
  standalone = clamp01(standalone);

  // Completeness: ends a sentence; starts like a sentence; no long internal pauses.
  let completeness = 0;
  if (endsSentence(clip[clip.length - 1].text)) completeness += 0.5;
  if (/^[A-Z0-9"'(]/.test(clip[0].text)) completeness += 0.3;
  let maxGap = 0;
  for (let k = 1; k < clip.length; k++) maxGap = Math.max(maxGap, clip[k].startMs - clip[k - 1].endMs);
  if (maxGap <= 1200) completeness += 0.2;

  // Duration fit: closeness to the ideal length.
  const spread = Math.max(opt.idealMs - opt.minMs, opt.maxMs - opt.idealMs);
  const durationFit = clamp01(1 - Math.abs(c.endMs - c.startMs - opt.idealMs) / spread);

  return { hook, emotion, content, standalone, completeness: clamp01(completeness), durationFit };
}

function totalScore(f: HighlightFeatures): number {
  let s = 0;
  (Object.keys(WEIGHTS) as (keyof HighlightFeatures)[]).forEach((k) => {
    s += WEIGHTS[k] * f[k];
  });
  return Math.round(clamp01(s) * 1000) / 10;
}

const REASON_LABELS: Record<keyof HighlightFeatures, string> = {
  hook: 'opens with a strong hook or question',
  emotion: 'contains emphatic or emotional language',
  content: 'has dense, on-topic speech at a good pace',
  standalone: 'makes sense without earlier context',
  completeness: 'starts and ends on complete sentences',
  durationFit: 'is a good length for a short clip',
};

function makeReason(f: HighlightFeatures): string {
  const top = (Object.keys(f) as (keyof HighlightFeatures)[])
    .filter((k) => f[k] >= 0.6)
    .sort((a, b) => WEIGHTS[b] * f[b] - WEIGHTS[a] * f[a])
    .slice(0, 3)
    .map((k) => REASON_LABELS[k]);
  return top.length ? `Selected because it ${top.join(', ')}.` : 'Selected as the best available moment; no strong signal stood out.';
}

function makeTitle(text: string): string {
  const first = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  const t = first.replace(/\s+/g, ' ').trim();
  return t.length <= 60 ? t : `${t.slice(0, 57).trimEnd()}...`;
}

function overlapFraction(a: { startMs: number; endMs: number }, b: { startMs: number; endMs: number }): number {
  const inter = Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs);
  if (inter <= 0) return 0;
  return inter / Math.min(a.endMs - a.startMs, b.endMs - b.startMs);
}

/**
 * Suggest highlight clips from a timestamped transcript.
 * Pure and deterministic. Scores are experimental heuristics, not predictions of engagement.
 */
export function suggestHighlights(
  transcript: TranscriptSegment[],
  options: Partial<HighlightOptions> = {},
): Highlight[] {
  const opt: HighlightOptions = { ...DEFAULT_OPTIONS, ...options };
  const segs = cleanSegments(transcript);
  if (segs.length === 0) return [];

  const termFreq = new Map<string, number>();
  for (const s of segs) {
    for (const w of words(s.text)) {
      if (w.length > 3 && !STOPWORDS.has(w)) termFreq.set(w, (termFreq.get(w) ?? 0) + 1);
    }
  }

  const scored = buildCandidates(segs, opt).map((c) => {
    const features = computeFeatures(segs, c, opt, termFreq);
    return { c, features, score: totalScore(features) };
  });
  scored.sort((a, b) => b.score - a.score || a.c.startMs - b.c.startMs);

  const chosen: typeof scored = [];
  for (const cand of scored) {
    if (chosen.length >= opt.count) break;
    if (chosen.some((k) => overlapFraction(k.c, cand.c) > opt.maxOverlap)) continue;
    chosen.push(cand);
  }

  return chosen.map(({ c, features, score }) => ({
    startMs: c.startMs,
    endMs: c.endMs,
    title: makeTitle(segs[c.from].text),
    score,
    reason: makeReason(features),
    features,
    segmentRange: [c.from, c.to] as [number, number],
    scoringVersion: SCORING_VERSION,
  }));
}
