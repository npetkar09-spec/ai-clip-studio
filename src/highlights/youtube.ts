// YouTube link helpers for "Clip a YouTube video". Pure TypeScript: no network, no React Native.
// It recognises a YouTube link, finds the video ID, and builds official URLs (oEmbed for public
// details, YouTube Studio for the owner's own Download). It never fetches or extracts YouTube
// video or audio, and it never tries to get around YouTube's restrictions.

export type YouTubeKind = 'watch' | 'shorts' | 'live' | 'embed' | 'short-link';

export type YouTubeOk = {
  ok: true;
  videoId: string;
  kind: YouTubeKind;
  /** Start time from a "?t=" or "&start=" part of the link, if any. */
  startSeconds: number | null;
  /** Plain watch link for this video. */
  watchUrl: string;
  /** Human-readable name for the link type. */
  label: string;
};

export type YouTubeFailReason =
  | 'empty' | 'not-youtube' | 'playlist' | 'channel' | 'no-video-id' | 'bad-id';

export type YouTubeFail = {
  ok: false;
  reason: YouTubeFailReason;
  message: string;
};

export type YouTubeParse = YouTubeOk | YouTubeFail;

const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const HOST_RE = /^[a-z0-9.-]+$/;

function hostIs(host: string, base: string): boolean {
  return host === base || host.endsWith('.' + base);
}

function fail(reason: YouTubeFailReason, message: string): YouTubeFail {
  return { ok: false, reason, message };
}

function kindLabel(kind: YouTubeKind): string {
  if (kind === 'shorts') return 'YouTube Short';
  if (kind === 'live') return 'YouTube live stream';
  return 'YouTube video';
}

/** "90", "90s", "1m30s", "1h2m3s" -> seconds. Returns null if it is not a valid time. */
export function parseTimeParam(value: string): number | null {
  const v = (value || '').trim().toLowerCase();
  if (v === '') return null;
  if (/^\d+$/.test(v)) return Number(v);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(v);
  if (!m || (m[1] === undefined && m[2] === undefined && m[3] === undefined)) return null;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

function parseQuery(qs: string | undefined): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (!qs) return out;
  for (const part of qs.split('&')) {
    if (part === '') continue;
    const i = part.indexOf('=');
    const k = i < 0 ? part : part.slice(0, i);
    let val = i < 0 ? '' : part.slice(i + 1);
    try { val = decodeURIComponent(val.replace(/\+/g, ' ')); } catch (e) { /* keep raw */ }
    out.push([k, val]);
  }
  return out;
}

function getQ(q: Array<[string, string]>, key: string): string | null {
  for (const [k, v] of q) if (k === key) return v;
  return null;
}

function startFrom(q: Array<[string, string]>, fragment: string | undefined): number | null {
  const t = getQ(q, 't') ?? getQ(q, 'start');
  if (t !== null) return parseTimeParam(t);
  if (fragment) {
    const f = getQ(parseQuery(fragment), 't');
    if (f !== null) return parseTimeParam(f);
  }
  return null;
}

function okResult(id: string, kind: YouTubeKind, start: number | null): YouTubeOk {
  return {
    ok: true,
    videoId: id,
    kind,
    startSeconds: start,
    watchUrl: 'https://www.youtube.com/watch?v=' + id,
    label: kindLabel(kind),
  };
}

/** Returns null when the token is not a YouTube link at all. */
function parseToken(token: string): YouTubeParse | null {
  const m = /^(?:https?:\/\/)?([^\/?#]*)([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/i.exec(token);
  if (!m) return null;
  const host = m[1].toLowerCase();
  if (!HOST_RE.test(host)) return null; // also rejects user@host and host:port tricks
  const path = m[2] || '';
  const q = parseQuery(m[3]);
  const fragment = m[4];

  const isShortLink = host === 'youtu.be' || host === 'www.youtu.be';
  const isYouTube = hostIs(host, 'youtube.com') || hostIs(host, 'youtube-nocookie.com');
  if (!isShortLink && !isYouTube) return null;

  const segs = path.split('/').filter((s) => s !== '');
  let id: string | null = null;
  let kind: YouTubeKind = 'watch';

  if (isShortLink) {
    kind = 'short-link';
    id = segs.length > 0 ? segs[0] : null;
    if (id === null) {
      return fail('no-video-id', 'This youtu.be link has no video ID. Copy the full link from the YouTube Share button.');
    }
  } else {
    const first = segs.length > 0 ? segs[0] : '';
    if (first === 'watch') {
      id = getQ(q, 'v');
      if (id === null || id === '') {
        if (getQ(q, 'list') !== null) {
          return fail('playlist', 'This is a playlist link. Open one video from the playlist and paste that video\'s link.');
        }
        return fail('no-video-id', 'This YouTube link has no video ID. Copy the full link from the YouTube Share button.');
      }
    } else if (first === 'shorts' || first === 'live' || first === 'embed' || first === 'v') {
      kind = first === 'v' ? 'watch' : (first as YouTubeKind);
      id = segs.length > 1 ? segs[1] : null;
      if (id === null) {
        return fail('no-video-id', 'This YouTube link has no video ID. Copy the full link from the YouTube Share button.');
      }
    } else if (first === 'playlist') {
      return fail('playlist', 'This is a playlist link. Open one video from the playlist and paste that video\'s link.');
    } else if (first.charAt(0) === '@' || first === 'channel' || first === 'c' || first === 'user') {
      return fail('channel', 'This is a channel link, not a video. Open the video and paste that video\'s link.');
    } else if (first === '') {
      return fail('no-video-id', 'This is the YouTube home page, not a video. Open the video and paste its link.');
    } else {
      return fail('no-video-id', 'This YouTube link does not point to a single video. Open the video and paste its link.');
    }
  }

  if (!ID_RE.test(id)) {
    return fail('bad-id', 'The video ID in this link does not look right (it should be 11 letters, digits, - or _). Copy the link again.');
  }
  return okResult(id, kind, startFrom(q, fragment));
}

/**
 * Finds a YouTube video link in pasted text. Accepts a bare link, a link without https://,
 * m.youtube.com, music.youtube.com, youtu.be, /shorts/, /live/, /embed/, and text around the
 * link (like the text the YouTube app puts in Share).
 */
export function parseYouTubeLink(input: string): YouTubeParse {
  const text = (input || '').trim();
  if (text === '') return fail('empty', 'Paste a YouTube link first.');
  let firstFail: YouTubeFail | null = null;
  for (const raw of text.split(/\s+/)) {
    const token = raw.replace(/^[<(\[{"'\u201c\u2018]+/, '').replace(/[>)\]}"'\u201d\u2019.,;:!?]+$/, '');
    if (token === '') continue;
    const r = parseToken(token);
    if (r === null) continue;
    if (r.ok) return r;
    if (firstFail === null) firstFail = r;
  }
  return firstFail ?? fail(
    'not-youtube',
    'This does not look like a YouTube link. For Google Drive, Dropbox or direct video links, use "Import from a link" below.',
  );
}

/** YouTube Studio page of this video (the owner can use Content > menu > Download there). */
export function studioEditUrl(videoId: string): string {
  return 'https://studio.youtube.com/video/' + videoId + '/edit';
}

export const STUDIO_HOME_URL = 'https://studio.youtube.com';

/** Official public oEmbed endpoint: gives title, channel and thumbnail. No sign-in, no video. */
export function oEmbedUrl(videoId: string): string {
  const watch = 'https://www.youtube.com/watch?v=' + videoId;
  return 'https://www.youtube.com/oembed?url=' + encodeURIComponent(watch) + '&format=json';
}

export type VideoDetails = { title: string; channel: string; thumbnailUrl: string | null };

/** Reads an oEmbed answer. Returns null if it does not have a usable title. */
export function parseOEmbed(json: unknown): VideoDetails | null {
  if (typeof json !== 'object' || json === null) return null;
  const o = json as Record<string, unknown>;
  const title = typeof o.title === 'string' ? o.title.trim().slice(0, 200) : '';
  if (title === '') return null;
  const channel = typeof o.author_name === 'string' ? o.author_name.trim().slice(0, 100) : '';
  const thumb = typeof o.thumbnail_url === 'string' && /^https:\/\//i.test(o.thumbnail_url)
    ? o.thumbnail_url : null;
  return { title, channel, thumbnailUrl: thumb };
}

/** Message for when oEmbed did not return details. Never blocks the rest of the flow. */
export function oEmbedFailureMessage(status: number | null): string {
  if (status === 401 || status === 403) {
    return 'YouTube did not share details for this video (it may be private or have embedding turned off). You can still continue if you have the video file.';
  }
  if (status === 404) {
    return 'YouTube could not find this video. Check the link, or continue if you have the video file.';
  }
  return 'Could not get the video details (check your internet). You can still continue if you have the video file.';
}

// ---------------------------------------------------------------------------
// Ownership declaration. This is only the user's own record on their phone. It does not give the
// user or this app any permission from YouTube or from a copyright owner.
// ---------------------------------------------------------------------------

export const DECLARATION_VERSION = 1;

export const DECLARATION_TEXT =
  'I own this video, or its copyright owner has given me permission to edit it into short clips. ' +
  'I understand this is only my own record on this phone. It does not give me or this app any ' +
  'permission from YouTube, and this app does not download anything from YouTube.';

export type Declaration = { videoId: string; confirmedAt: string; version: number };

export function makeDeclaration(videoId: string, now: Date): Declaration {
  return { videoId, confirmedAt: now.toISOString(), version: DECLARATION_VERSION };
}

/** Reads the saved list. Never throws; ignores damaged entries. */
export function parseDeclarations(json: string | null | undefined): Declaration[] {
  if (!json) return [];
  let data: unknown;
  try { data = JSON.parse(json); } catch (e) { return []; }
  if (!Array.isArray(data)) return [];
  const out: Declaration[] = [];
  for (const d of data) {
    if (typeof d !== 'object' || d === null) continue;
    const o = d as Record<string, unknown>;
    if (typeof o.videoId !== 'string' || !ID_RE.test(o.videoId)) continue;
    if (typeof o.confirmedAt !== 'string' || typeof o.version !== 'number') continue;
    out.push({ videoId: o.videoId, confirmedAt: o.confirmedAt, version: o.version });
  }
  return out;
}

/** Adds (or replaces) the record for a video. Keeps the newest 200. */
export function addDeclaration(list: Declaration[], d: Declaration): Declaration[] {
  const rest = list.filter((x) => x.videoId !== d.videoId);
  rest.push(d);
  return rest.slice(-200);
}

/** A confirmation only counts if it was made for the current declaration text. */
export function findDeclaration(list: Declaration[], videoId: string): Declaration | null {
  for (const d of list) {
    if (d.videoId === videoId && d.version === DECLARATION_VERSION) return d;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Which step of the guided flow the screen is on.
// ---------------------------------------------------------------------------

export type GuidedStage = 'paste' | 'confirm' | 'get-file' | 'ready';

export function guidedStage(parsed: YouTubeParse | null, confirmed: boolean, fileChosen: boolean): GuidedStage {
  if (!parsed || !parsed.ok) return 'paste';
  if (!confirmed) return 'confirm';
  return fileChosen ? 'ready' : 'get-file';
}
