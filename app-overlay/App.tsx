import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, Platform, Pressable, ScrollView, StatusBar,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { requireNativeModule } from 'expo';
import * as ImagePicker from 'expo-image-picker';
import { File, FileMode, Paths } from 'expo-file-system';
import { initWhisper } from 'whisper.rn';
import { suggestHighlights } from './src/highlights';
import {
  looksLikeWordLevel, makeCaptionChunks, stepEnd, stepStart,
  tokensToWords, wordsInRange, wordsToSentences,
} from './src/highlights/words';
import type { Word } from './src/highlights/words';
import { classifyLink, notAVideoMessage, sniffVideo } from './src/highlights/link';
import { makeSampleTranscript } from './src/sample/sampleTranscript';

const MODEL_URL =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin';

const AudioExtract: any = (() => {
  try { return requireNativeModule('AudioExtract'); } catch (e) { return null; }
})();

const ClipExport: any = (() => {
  try { return requireNativeModule('ClipExport'); } catch (e) { return null; }
})();

function fmt(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function fmtT(ms: number): string {
  const t = Math.max(0, ms) / 1000;
  const m = Math.floor(t / 60);
  const sec = t - m * 60;
  return `${m}:${sec < 10 ? '0' : ''}${sec.toFixed(1)}`;
}

const MIN_CLIP_MS = 3000;
const MAX_CLIP_MS = 180000;

type Picked = { name: string; durationMs: number | null; uri: string };
type AudioInfo = {
  path: string; durationMs: number; bytes: number;
  inputSampleRate: number; inputChannels: number; outputSampleRate: number;
};
type Clip = ReturnType<typeof suggestHighlights>[number];
type Tr = {
  text: string; loadSecs: number; runSecs: number; speed: number;
  segCount: number; unit: string; lastEndMs: number; clips: Clip[];
  words: Word[]; wordMode: boolean;
};

export default function App() {
  const sampleClips = useMemo(() => suggestHighlights(makeSampleTranscript()), []);
  const [video, setVideo] = useState<Picked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audio, setAudio] = useState<AudioInfo | null>(null);
  const [secs, setSecs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [tr, setTr] = useState<Tr | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exported, setExported] = useState<Record<string, string>>({});
  const [captionsOn, setCaptionsOn] = useState(true);
  const [linkText, setLinkText] = useState('');
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  const [importedUri, setImportedUri] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { startMs: number; endMs: number }>>({});

  // Remove a video that was downloaded from a link earlier (never touches picked videos).
  function removeImported() {
    if (!importedUri) return;
    try {
      const f = new File(importedUri);
      if (f.exists) f.delete();
    } catch (e) { /* ignore */ }
    setImportedUri(null);
  }

  async function importFromLink() {
    setError(null); setLinkMsg(null);
    const c = classifyLink(linkText);
    if (!c.downloadUrl) { setLinkMsg(c.message ?? 'This link cannot be imported.'); return; }
    removeImported();
    setAudio(null); setTr(null); setEdits({}); setExported({}); setVideo(null);
    setBusy(true);
    setStatus(`Downloading from ${c.source}...`);
    const dest = new File(Paths.cache, `import-${Date.now()}.mp4`);
    try {
      await File.downloadFileAsync(c.downloadUrl, dest, {
        onProgress: (p: { bytesWritten: number; totalBytes: number }) => {
          const mb = (p.bytesWritten / 1048576).toFixed(1);
          setStatus(p.totalBytes > 0
            ? `Downloading from ${c.source}: ${mb} of ${(p.totalBytes / 1048576).toFixed(1)} MB`
            : `Downloading from ${c.source}: ${mb} MB`);
        },
      });
      // Check the first bytes: a web page or a non-video file is not accepted.
      let kind: 'mp4' | 'webm' | 'html' | 'unknown' | 'skipped' = 'skipped';
      try {
        const h = dest.open(FileMode.ReadOnly);
        const head = await h.readBytes(16);
        h.close();
        kind = sniffVideo(head);
      } catch (e) { kind = 'skipped'; }
      if (kind === 'html' || kind === 'unknown') {
        try { dest.delete(); } catch (e) { /* ignore */ }
        setLinkMsg(notAVideoMessage(c.kind));
        return;
      }
      const seg = decodeURIComponent((c.downloadUrl.split('?')[0].split('/').pop() ?? '')).trim();
      const name = seg !== '' && seg !== 'uc' ? seg : `video from ${c.source}`;
      setImportedUri(dest.uri);
      setVideo({ name, durationMs: null, uri: dest.uri });
      setLinkMsg(`Imported (${((dest.size ?? 0) / 1048576).toFixed(1)} MB). Next: Extract audio.`);
    } catch (e) {
      try { if (dest.exists) dest.delete(); } catch (e2) { /* ignore */ }
      setLinkMsg(
        `Could not download this link (${String(e)}). Check the link and your internet, ` +
        'or download the file yourself and tap "Pick a video".'
      );
    } finally { setBusy(false); setStatus(''); }
  }

  async function pickVideo() {
    setError(null); setLinkMsg(null); setAudio(null); setTr(null); setEdits({}); setExported({});
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
      if (!r.canceled && r.assets && r.assets.length > 0) {
        const a = r.assets[0];
        removeImported();
        setVideo({ name: a.fileName ?? 'video', durationMs: a.duration ?? null, uri: a.uri });
      }
    } catch (e) { setError(String(e)); }
  }

  async function extractAudio() {
    if (!video) return;
    setError(null); setAudio(null); setTr(null); setEdits({}); setExported({}); setBusy(true);
    setStatus('Extracting audio...');
    const t0 = Date.now();
    try {
      if (!AudioExtract) throw new Error('Audio module is not in this build');
      const r = await AudioExtract.extractAudio(video.uri);
      setAudio(r as AudioInfo);
      setSecs((Date.now() - t0) / 1000);
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); setStatus(''); }
  }

  async function transcribe() {
    if (!audio) return;
    setError(null); setTr(null); setEdits({}); setExported({}); setBusy(true);
    try {
      const modelFile = new File(Paths.document, 'ggml-tiny.en.bin');
      if (modelFile.exists && (modelFile.size ?? 0) < 70000000) {
        modelFile.delete();
      }
      if (!modelFile.exists) {
        setStatus('Downloading model (about 78 MB, one time)...');
        await File.downloadFileAsync(MODEL_URL, modelFile);
      }
      setStatus('Loading model...');
      const t0 = Date.now();
      const ctx = await initWhisper({ filePath: modelFile.uri });
      const loadSecs = (Date.now() - t0) / 1000;
      setStatus('Transcribing...');
      const t1 = Date.now();
      const { promise } = ctx.transcribe(audio.path, {
        language: 'en', tokenTimestamps: true, maxLen: 1,
      });
      const res = await promise;
      const runSecs = (Date.now() - t1) / 1000;
      await ctx.release();

      // Work out the time unit of the segment times from the audio length.
      const segs = res.segments ?? [];
      const audioSec = audio.durationMs / 1000;
      const lastT1 = segs.reduce((m: number, s: any) => Math.max(m, s.t1), 0);
      let mult = 1000;
      let unit = 'seconds';
      if (lastT1 > audioSec * 500) { mult = 1; unit = 'milliseconds'; }
      else if (lastT1 > audioSec * 50) { mult = 10; unit = 'hundredths of a second'; }

      setStatus('Finding highlights...');
      const rawSegs = segs.map((s: any) => ({
        startMs: Math.round(s.t0 * mult),
        endMs: Math.round(s.t1 * mult),
        text: String(s.text),
      }));
      const wordMode = looksLikeWordLevel(rawSegs);
      const words: Word[] = wordMode ? tokensToWords(rawSegs) : [];
      const transcript = wordMode
        ? wordsToSentences(words)
        : rawSegs.map((s: any) => ({ ...s, text: s.text.trim() }));
      const clips = suggestHighlights(transcript);

      setTr({
        text: res.result,
        loadSecs,
        runSecs,
        speed: audio.durationMs / 1000 / runSecs,
        segCount: segs.length,
        unit,
        lastEndMs: Math.round(lastT1 * mult),
        clips,
        words,
        wordMode,
      });
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); setStatus(''); }
  }

  async function exportClip(c: Clip) {
    if (!video || !audio) return;
    if (!ClipExport) { setError('Export module is missing from this build.'); return; }
    const key = `${c.startMs}-${c.endMs}`;
    const cur = edits[key] ?? { startMs: c.startMs, endMs: c.endMs };
    setError(null); setExporting(key);
    try {
      const t = Date.now();
      // whisper pads the last segment, so never go past the real audio length
      const endMs = Math.min(cur.endMs, audio.durationMs);
      let captionsJson = '';
      if (captionsOn && tr && tr.wordMode) {
        const chunks = makeCaptionChunks(tr.words, cur.startMs, endMs);
        captionsJson = JSON.stringify(chunks.map((ch) => ({
          s: Math.round(ch.startMs), e: Math.round(ch.endMs),
          w: ch.words.map((w) => ({ t: w.text, s: Math.round(w.startMs), e: Math.round(w.endMs) })),
        })));
      }
      const r = await ClipExport.exportClip(video.uri, cur.startMs, endMs, String(Date.now()), captionsJson);
      const took = ((Date.now() - t) / 1000).toFixed(1);
      const mb = (r.bytes / 1048576).toFixed(1);
      const where = r.savedToGallery
        ? 'Saved to Movies/AI Clip Studio (open it in Gallery)'
        : 'Saved in app cache only (Android 9 or older)';
      const cap = captionsJson === ''
        ? 'captions off'
        : r.captionError
          ? `caption error: ${r.captionError}`
          : `captions ${r.captionStates} states`;
      setExported((p) => ({ ...p, [key]: `${where} | ${mb} MB | ${took} s | ${cap}` }));
    } catch (e) { setError(String(e)); }
    finally { setExporting(null); }
  }

  function setTrim(c: Clip, startMs: number, endMs: number) {
    if (!audio) return;
    const s2 = Math.round(startMs);
    const e2 = Math.round(endMs);
    if (s2 < 0 || e2 > audio.durationMs) return;
    if (e2 - s2 < MIN_CLIP_MS || e2 - s2 > MAX_CLIP_MS) return;
    const key = `${c.startMs}-${c.endMs}`;
    setEdits((p) => ({ ...p, [key]: { startMs: s2, endMs: e2 } }));
    setExported((p) => { const n = { ...p }; delete n[key]; return n; });
  }

  const topPad = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 28) : 44;

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>AI Clip Studio</Text>
        <Text style={styles.sub}>Prototype v9 (link import)</Text>
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Pick a video, extract audio, then transcribe. The app then runs the
            highlight engine on your video's transcript. Scores are experimental
            heuristics, not predictions of how a clip will perform. Export trims
            the clip and crops the centre of the picture to 9:16.
          </Text>
        </View>
        <Pressable style={styles.button} onPress={pickVideo}>
          <Text style={styles.buttonText}>Pick a video</Text>
        </Pressable>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Or import from a link</Text>
          <Text style={styles.meta}>
            Works with Google Drive (shared as "Anyone with the link"), Dropbox, and direct
            video file links (https). YouTube and social apps are not downloaded: use your own
            file with "Pick a video".
          </Text>
          <TextInput
            style={styles.input}
            value={linkText}
            onChangeText={setLinkText}
            placeholder="Paste a video link (https://...)"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!busy}
          />
          <Pressable style={[styles.button, busy && styles.disabled]} onPress={importFromLink} disabled={busy}>
            <Text style={styles.buttonText}>Import from link</Text>
          </Pressable>
          {linkMsg && <Text style={styles.reason}>{linkMsg}</Text>}
        </View>
        {video && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Selected video</Text>
            <Text style={styles.meta}>File: {video.name}</Text>
            <Text style={styles.meta}>
              Length: {video.durationMs !== null ? fmt(video.durationMs) : 'unknown'}
            </Text>
          </View>
        )}
        {video && (
          <Pressable style={[styles.button, busy && styles.disabled]} onPress={extractAudio} disabled={busy}>
            <Text style={styles.buttonText}>Extract audio (16 kHz mono)</Text>
          </Pressable>
        )}
        {audio && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Audio extracted</Text>
            <Text style={styles.meta}>Audio length: {fmt(audio.durationMs)} ({audio.durationMs} ms)</Text>
            {secs !== null && <Text style={styles.meta}>Took {secs.toFixed(1)} s</Text>}
          </View>
        )}
        {audio && (
          <Pressable style={[styles.button, busy && styles.disabled]} onPress={transcribe} disabled={busy}>
            <Text style={styles.buttonText}>Transcribe and find clips</Text>
          </Pressable>
        )}
        {busy && <ActivityIndicator />}
        {busy && status !== '' && <Text style={styles.meta}>{status}</Text>}
        {tr && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Transcript</Text>
            <Text style={styles.meta}>
              Load {tr.loadSecs.toFixed(1)} s | transcribe {tr.runSecs.toFixed(1)} s | {tr.speed.toFixed(1)}x real time
            </Text>
            <Text style={styles.meta}>
              {tr.segCount} segments | time unit detected: {tr.unit} | last segment ends at {fmt(tr.lastEndMs)}
            </Text>
            <Text style={styles.meta}>
              {tr.wordMode
                ? `Word timing: ON (${tr.words.length} words)`
                : 'Word timing: not available (captions and word trim are off)'}
            </Text>
            {tr.wordMode && (
              <Pressable style={styles.button} onPress={() => setCaptionsOn((v) => !v)}>
                <Text style={styles.buttonText}>{captionsOn ? 'Captions: ON' : 'Captions: OFF'}</Text>
              </Pressable>
            )}
            <Text style={styles.reason}>{tr.text.slice(0, 300)}...</Text>
          </View>
        )}
        {error && <Text style={styles.error}>Error: {error}</Text>}

        {tr ? (
          <>
            <Text style={styles.cardTitle}>Suggested clips from your video</Text>
            {tr.clips.map((c, i) => {
              const key = `${c.startMs}-${c.endMs}`;
              const cur = edits[key] ?? { startMs: c.startMs, endMs: c.endMs };
              const inClip = wordsInRange(tr.words, cur.startMs, cur.endMs);
              const firstText = inClip.slice(0, 6).map((w) => w.text).join(' ');
              const lastText = inClip.slice(-6).map((w) => w.text).join(' ');
              const chunks = makeCaptionChunks(tr.words, cur.startMs, cur.endMs);
              const off = busy || exporting !== null;
              const W = tr.wordMode;
              return (
                <View key={key} style={styles.card}>
                  <Text style={styles.cardTitle}>{`${i + 1}. ${c.title}`}</Text>
                  <Text style={styles.meta}>{`Suggested ${fmt(c.startMs)} to ${fmt(c.endMs)}  |  experimental score ${c.score}`}</Text>
                  <Text style={styles.reason}>{c.reason}</Text>

                  <Text style={styles.cardTitle}>
                    {`Clip ${fmtT(cur.startMs)} to ${fmtT(cur.endMs)} (${((cur.endMs - cur.startMs) / 1000).toFixed(1)} s)`}
                  </Text>
                  <Text style={styles.meta}>Start</Text>
                  <View style={styles.row}>
                    {W && <Pressable style={[styles.small, off && styles.disabled]} disabled={off}
                      onPress={() => setTrim(c, stepStart(tr.words, cur.startMs, -1), cur.endMs)}>
                      <Text style={styles.smallText}>- word</Text></Pressable>}
                    <Pressable style={[styles.small, off && styles.disabled]} disabled={off}
                      onPress={() => setTrim(c, cur.startMs - 1000, cur.endMs)}>
                      <Text style={styles.smallText}>-1 s</Text></Pressable>
                    <Pressable style={[styles.small, off && styles.disabled]} disabled={off}
                      onPress={() => setTrim(c, cur.startMs + 1000, cur.endMs)}>
                      <Text style={styles.smallText}>+1 s</Text></Pressable>
                    {W && <Pressable style={[styles.small, off && styles.disabled]} disabled={off}
                      onPress={() => setTrim(c, stepStart(tr.words, cur.startMs, 1), cur.endMs)}>
                      <Text style={styles.smallText}>+ word</Text></Pressable>}
                  </View>
                  <Text style={styles.meta}>End</Text>
                  <View style={styles.row}>
                    {W && <Pressable style={[styles.small, off && styles.disabled]} disabled={off}
                      onPress={() => setTrim(c, cur.startMs, stepEnd(tr.words, cur.endMs, -1))}>
                      <Text style={styles.smallText}>- word</Text></Pressable>}
                    <Pressable style={[styles.small, off && styles.disabled]} disabled={off}
                      onPress={() => setTrim(c, cur.startMs, cur.endMs - 1000)}>
                      <Text style={styles.smallText}>-1 s</Text></Pressable>
                    <Pressable style={[styles.small, off && styles.disabled]} disabled={off}
                      onPress={() => setTrim(c, cur.startMs, cur.endMs + 1000)}>
                      <Text style={styles.smallText}>+1 s</Text></Pressable>
                    {W && <Pressable style={[styles.small, off && styles.disabled]} disabled={off}
                      onPress={() => setTrim(c, cur.startMs, stepEnd(tr.words, cur.endMs, 1))}>
                      <Text style={styles.smallText}>+ word</Text></Pressable>}
                  </View>
                  {W && (
                    <>
                      <Text style={styles.meta}>{`Starts: "${firstText}"`}</Text>
                      <Text style={styles.meta}>{`Ends: "...${lastText}"`}</Text>
                      <Text style={styles.meta}>
                        {`Caption preview (${chunks.length} captions, first 4, time from clip start):`}
                      </Text>
                      {chunks.slice(0, 4).map((ch, k) => (
                        <Text key={k} style={styles.meta}>
                          {`${fmtT(ch.startMs)}  ${ch.words.map((w) => w.text).join(' ').toUpperCase()}`}
                        </Text>
                      ))}
                    </>
                  )}
                  <Pressable
                    style={[styles.button, off && styles.disabled]}
                    disabled={off}
                    onPress={() => exportClip(c)}
                  >
                    <Text style={styles.buttonText}>
                      {exporting === key ? 'Exporting...' : 'Export 9:16 clip'}
                    </Text>
                  </Pressable>
                  {exported[key] && <Text style={styles.meta}>{exported[key]}</Text>}
                </View>
              );
            })}
            {tr.clips.length ==            {tr.clips.length === 0 && (
              <Text style={styles.meta}>The engine found no clips of 15 to 60 seconds in this transcript.</Text>
            )}
          </>
        ) : (
          <>
            <Text style={styles.cardTitle}>Sample highlights (built-in SAMPLE, not your video)</Text>
            {sampleClips.map((c, i) => (
              <View key={`${c.startMs}-${c.endMs}`} style={styles.card}>
                <Text style={styles.cardTitle}>{`${i + 1}. ${c.title}`}</Text>
                <Text style={styles.meta}>{`${fmt(c.startMs)} to ${fmt(c.endMs)}  |  experimental score ${c.score}`}</Text>
                <Text style={styles.reason}>{c.reason}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  body: { padding: 20, paddingBottom: 80, gap: 12 },
  title: { fontSize: 26, fontWeight: '700', color: '#111' },
  sub: { fontSize: 14, color: '#555' },
  notice: { backgroundColor: '#fff4d6', borderRadius: 8, padding: 12 },
  noticeText: { color: '#5a4300', fontSize: 13 },
  button: { backgroundColor: '#111', borderRadius: 10, padding: 14, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  error: { color: '#b00020', fontSize: 13 },
  card: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111' },
  meta: { fontSize: 12, color: '#555' },
  reason: { fontSize: 13, color: '#222' },
  row: { flexDirection: 'row', gap: 8 },
  input: { borderWidth: 1, borderColor: '#bbb', borderRadius: 8, padding: 10, fontSize: 14, color: '#111' },
  small: { flex: 1, backgroundColor: '#eee', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  smallText: { color: '#111', fontSize: 13, fontWeight: '600' },
});
