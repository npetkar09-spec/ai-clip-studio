// Link classification for "Import from link". Pure TypeScript, no network, no React Native.
// It only decides what kind of link something is and which plain file URL (if any) may be
// fetched. It never tries to get around a platform's download restrictions.

export type LinkKind = 'direct' | 'drive' | 'dropbox' | 'youtube' | 'restricted' | 'invalid';

export type LinkResult = {
  kind: LinkKind;
  /** Plain file URL to download. Only set for direct, drive and dropbox. */
  downloadUrl?: string;
  /** Human-readable source name for the status line. */
  source: string;
  /** Explanation to show when the link cannot be imported. */
  message?: string;
};

export type Sniff = 'mp4' | 'webm' | 'html' | 'unknown';

const MANUAL =
  'Download the file in your browser or from the app that has it, then tap "Pick a video".';

const YOUTUBE_HOSTS = ['youtube.com', 'youtu.be', 'youtube-nocookie.com'];
const RESTRICTED_HOSTS: Record<string, string> = {
  'instagram.com': 'Instagram',
  'tiktok.com': 'TikTok',
  'facebook.com': 'Facebook',
  'fb.watch': 'Facebook',
  'twitter.com': 'X (Twitter)',
  'x.com': 'X (Twitter)',
  'vimeo.com': 'Vimeo',
  'twitch.tv': 'Twitch',
  'reddit.com': 'Reddit',
};

type Parsed = { host: string; path: string; query: Array<[string, string]>; raw: string };

function parseHttps(input: string): Parsed | null {
  const m = /^https:\/\/([^\/?#:@]+)(?::\d+)?([^?#]*)(?:\?([^#]*))?(?:#.*)?$/i.exec(input);
  if (!m) return null;
  const query: Array<[string, string]> = [];
  if (m[3]) {
    for (const part of m[3].split('&')) {
      if (part === '') continue;
      const i = part.indexOf('=');
      query.push(i < 0 ? [part, ''] : [part.slice(0, i), part.slice(i + 1)]);
    }
  }
  return { host: m[1].toLowerCase(), path: m[2] || '/', query, raw: input };
}

function hostIs(host: string, base: string): boolean {
  return host === base || host.endsWith('.' + base);
}

function q(p: Parsed, key: string): string | null {
  for (const [k, v] of p.query) if (k === key) return v;
  return null;
}

export function classifyLink(input: string): LinkResult {
  const text = (input || '').trim();
  if (text === '') {
    return { kind: 'invalid', source: '', message: 'Paste a link first.' };
  }
  if (/^http:\/\//i.test(text)) {
    return {
      kind: 'invalid', source: '',
      message: 'Only secure https links are supported. This link starts with http.',
    };
  }
  const p = parseHttps(text);
  if (!p) {
    return {
      kind: 'invalid', source: '',
      message: 'This does not look like a valid https link. Check it and try again.',
    };
  }

  for (const h of YOUTUBE_HOSTS) {
    if (hostIs(p.host, h)) {
      return {
        kind: 'youtube', source: 'YouTube',
        message:
          'YouTube does not allow its videos to be downloaded by other apps, so this app ' +
          'does not fetch YouTube links. If this is your own video: open YouTube Studio, ' +
          'go to Content, tap the three dots next to the video and choose Download (or use ' +
          'the original file from your PC or camera). Then tap "Pick a video" and choose ' +
          'that file.',
      };
    }
  }
  for (const h of Object.keys(RESTRICTED_HOSTS)) {
    if (hostIs(p.host, h)) {
      const name = RESTRICTED_HOSTS[h];
      return {
        kind: 'restricted', source: name,
        message:
          name + ' does not offer a plain download link for videos, so this app cannot ' +
          'import from it. If it is your own video, save it with ' + name + "'s own " +
          'download or export option (or use your original file), then tap "Pick a video".',
      };
    }
  }

  if (p.host === 'drive.google.com') {
    let id: string | null = null;
    const fm = /^\/file\/d\/([A-Za-z0-9_-]+)/.exec(p.path);
    if (fm) id = fm[1];
    if (!id && (p.path === '/open' || p.path === '/uc')) id = q(p, 'id');
    if (id && /^[A-Za-z0-9_-]+$/.test(id)) {
      return {
        kind: 'drive', source: 'Google Drive',
        downloadUrl: 'https://drive.google.com/uc?export=download&id=' + id,
      };
    }
    return {
      kind: 'invalid', source: 'Google Drive',
      message:
        'This Google Drive link is not a single file link (folders are not supported). ' +
        'Share the video file as "Anyone with the link" and paste that file link. ' + MANUAL,
    };
  }

  if (hostIs(p.host, 'dropbox.com')) {
    const base = 'https://' + p.host + p.path;
    const kept = p.query.filter(([k]) => k !== 'dl' && k !== 'raw');
    const qs = kept.concat([['dl', '1']]).map(([k, v]) => (v === '' ? k : k + '=' + v)).join('&');
    return { kind: 'dropbox', source: 'Dropbox', downloadUrl: base + '?' + qs };
  }

  const isDropboxUserContent = hostIs(p.host, 'dropboxusercontent.com');
  return {
    kind: 'direct',
    source: isDropboxUserContent ? 'Dropbox' : p.host,
    downloadUrl: p.raw,
  };
}

/** Looks at the first bytes of a downloaded file. */
export function sniffVideo(bytes: ArrayLike<number>): Sniff {
  const n = bytes.length;
  if (n >= 8 &&
      bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return 'mp4'; // "ftyp": MP4, MOV, M4V, 3GP
  }
  if (n >= 4 &&
      bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return 'webm'; // EBML: WebM or MKV
  }
  let i = 0;
  while (i < n && (bytes[i] === 0x20 || bytes[i] === 0x0a || bytes[i] === 0x0d || bytes[i] === 0x09 ||
         (i === 0 && bytes[0] === 0xef && n > 2 && bytes[1] === 0xbb && bytes[2] === 0xbf))) {
    i += (i === 0 && bytes[0] === 0xef) ? 3 : 1;
  }
  if (i < n && bytes[i] === 0x3c) return 'html'; // "<"
  return 'unknown';
}

/** Message for when a link returned a web page instead of a video file. */
export function notAVideoMessage(kind: LinkKind): string {
  if (kind === 'drive') {
    return (
      'Google Drive returned a web page instead of the video. This usually means the file ' +
      'is not shared as "Anyone with the link", or it is too large for Drive to give a ' +
      'direct download. ' + MANUAL
    );
  }
  if (kind === 'dropbox') {
    return (
      'Dropbox returned a web page instead of the video. Check that the link is a file ' +
      'link that anyone with the link can open. ' + MANUAL
    );
  }
  return (
    'This link gave a web page or an unsupported file, not a video file. Only links that ' +
    'point straight to a video file (like .mp4) work. ' + MANUAL
  );
}
