import type { TranscriptSegment } from './types';

/** One spoken word with times in milliseconds (source-video time). */
export interface Word {
  startMs: number;
  endMs: number;
  text: string;
}

/** A word inside a caption chunk. Times are relative to the clip start. */
export interface CaptionWord {
  text: string;
  startMs: number;
  endMs: number;
}

/** A short group of words shown on screen together (like the reference clip). */
export interface CaptionChunk {
  startMs: number;
  endMs: number;
  words: CaptionWord[];
}

export interface CaptionOptions {
  maxWords: number;
  maxChars: number;
  /** A silence longer than this starts a new chunk. */
  pauseMs: number;
  /** How long a chunk stays on screen after its last word. */
  holdMs: number;
}

export const DEFAULT_CAPTION_OPTIONS: CaptionOptions = {
  maxWords: 3,
  maxChars: 18,
  pauseMs: 700,
  holdMs: 250,
};

/** A word never lasts longer than this (whisper attaches pauses to the previous word). */
const MAX_WORD_MS = 1500;

/** Whisper marks non-speech like [BLANK_AUDIO], [MUSIC], (music), *sigh*. */
const NON_SPEECH = /^\s*(\[[^\]]*\]|<\|[^|]*\|>|\([^)]*\)|\*[^*]*\*|♪+)\s*$/;

const SENTENCE_END = /[.?!…]["')\]]*$/;

/**
 * True when the segments look like one token or word each (what whisper returns
 * with tokenTimestamps on and maxLen 1), not whole sentences.
 */
export function looksLikeWordLevel(segs: TranscriptSegment[]): boolean {
  if (segs.length < 5) return false;
  let single = 0;
  for (const s of segs) {
    const t = s.text.trim();
    if (t === '' || !/\s/.test(t)) single++;
  }
  return single / segs.length >= 0.9;
}

/**
 * Merge whisper token segments into words. A token that starts with a space
 * begins a new word. Other tokens (word pieces, punctuation) attach to the
 * previous word.
 */
export function tokensToWords(tokens: TranscriptSegment[]): Word[] {
  const words: Word[] = [];
  for (const t of tokens) {
    const raw = t.text;
    if (raw.trim() === '') continue;
    if (NON_SPEECH.test(raw)) continue;
    const piece = raw.trim();
    const startsNew = /^\s/.test(raw) || words.length === 0;
    if (startsNew) {
      words.push({ startMs: t.startMs, endMs: Math.max(t.endMs, t.startMs), text: piece });
    } else {
      const last = words[words.length - 1];
      last.text += piece;
      last.endMs = Math.max(last.endMs, t.endMs);
    }
  }
  for (const w of words) {
    w.endMs = Math.min(w.endMs, w.startMs + MAX_WORD_MS);
  }
  return words;
}

/** Group words into sentence-like segments for the highlight engine. */
export function wordsToSentences(
  words: Word[],
  opts: { maxWords?: number; gapMs?: number } = {},
): TranscriptSegment[] {
  const maxWords = opts.maxWords ?? 30;
  const gapMs = opts.gapMs ?? 1200;
  const out: TranscriptSegment[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length === 0) return;
    out.push({
      startMs: cur[0].startMs,
      endMs: cur[cur.length - 1].endMs,
      text: cur.map((w) => w.text).join(' '),
    });
    cur = [];
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    cur.push(w);
    const next = words[i + 1];
    const endsSentence = SENTENCE_END.test(w.text);
    const bigGap = next !== undefined && next.startMs - w.endMs > gapMs;
    if (endsSentence || bigGap || cur.length >= maxWords) flush();
  }
  flush();
  return out;
}

/** Words that start inside [startMs, endMs). */
export function wordsInRange(words: Word[], startMs: number, endMs: number): Word[] {
  return words.filter((w) => w.startMs >= startMs && w.startMs < endMs);
}

/**
 * Build the on-screen caption chunks for one clip. Times in the result are
 * relative to the start of the clip.
 */
export function makeCaptionChunks(
  words: Word[],
  clipStartMs: number,
  clipEndMs: number,
  options: Partial<CaptionOptions> = {},
): CaptionChunk[] {
  const o = { ...DEFAULT_CAPTION_OPTIONS, ...options };
  const lengthMs = Math.max(0, clipEndMs - clipStartMs);
  const inClip = wordsInRange(words, clipStartMs, clipEndMs).map<CaptionWord>((w) => ({
    text: w.text,
    startMs: w.startMs - clipStartMs,
    endMs: Math.min(w.endMs - clipStartMs, lengthMs),
  }));

  const chunks: CaptionChunk[] = [];
  let cur: CaptionWord[] = [];
  let chars = 0;
  const flush = () => {
    if (cur.length === 0) return;
    chunks.push({
      startMs: cur[0].startMs,
      endMs: cur[cur.length - 1].endMs,
      words: cur,
    });
    cur = [];
    chars = 0;
  };
  for (const w of inClip) {
    const prev = cur[cur.length - 1];
    const tooMany = cur.length >= o.maxWords;
    const tooLong = cur.length > 0 && chars + 1 + w.text.length > o.maxChars;
    const pause = prev !== undefined && w.startMs - prev.endMs > o.pauseMs;
    const prevEndsSentence = prev !== undefined && SENTENCE_END.test(prev.text);
    if (tooMany || tooLong || pause || prevEndsSentence) flush();
    cur.push(w);
    chars += (cur.length > 1 ? 1 : 0) + w.text.length;
  }
  flush();

  // Keep each chunk on screen a little after its last word, but not into the next chunk.
  for (let i = 0; i < chunks.length; i++) {
    const nextStart = i + 1 < chunks.length ? chunks[i + 1].startMs : lengthMs;
    chunks[i].endMs = Math.max(
      chunks[i].endMs,
      Math.min(chunks[i].endMs + o.holdMs, nextStart),
    );
  }
  return chunks;
}

/** Move a clip start to the previous (dir -1) or next (dir +1) word start. */
export function stepStart(words: Word[], startMs: number, dir: -1 | 1): number {
  if (dir === 1) {
    const w = words.find((x) => x.startMs > startMs + 1);
    return w ? w.startMs : startMs;
  }
  for (let i = words.length - 1; i >= 0; i--) {
    if (words[i].startMs < startMs - 1) return words[i].startMs;
  }
  return startMs;
}

/** Move a clip end to the previous (dir -1) or next (dir +1) word end. */
export function stepEnd(words: Word[], endMs: number, dir: -1 | 1): number {
  if (dir === 1) {
    const w = words.find((x) => x.endMs > endMs + 1);
    return w ? w.endMs : endMs;
  }
  for (let i = words.length - 1; i >= 0; i--) {
    if (words[i].endMs < endMs - 1) return words[i].endMs;
  }
  return endMs;
  }
