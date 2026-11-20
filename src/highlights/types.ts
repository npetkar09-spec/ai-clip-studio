/** A transcript piece with times in milliseconds (source-video time). */
export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface HighlightOptions {
  /** How many clips to return. Default 5. */
  count: number;
  /** Shortest and longest clip length in milliseconds. */
  minMs: number;
  maxMs: number;
  /** Preferred clip length (used only for scoring). */
  idealMs: number;
  /** Largest allowed silent gap inside a clip. */
  maxInnerGapMs: number;
  /** Candidates overlapping an already chosen clip by more than this fraction are dropped. */
  maxOverlap: number;
}

export interface HighlightFeatures {
  hook: number;
  emotion: number;
  content: number;
  standalone: number;
  completeness: number;
  durationFit: number;
}

export interface Highlight {
  startMs: number;
  endMs: number;
  title: string;
  /** 0-100. EXPERIMENTAL heuristic score. It is not a probability and does not predict virality. */
  score: number;
  /** Short plain-language explanation built from the strongest signals. */
  reason: string;
  features: HighlightFeatures;
  /** Indexes of the transcript segments used (evidence for the reason). */
  segmentRange: [number, number];
  scoringVersion: string;
}
