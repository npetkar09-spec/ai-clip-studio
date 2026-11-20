import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, Platform, Pressable, ScrollView, StatusBar,
  StyleSheet, Text, View,
} from 'react-native';
import { requireNativeModule } from 'expo';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import { initWhisper } from 'whisper.rn';
import { suggestHighlights } from './src/highlights';
import { makeSampleTranscript } from './src/sample/sampleTranscript';

const MODEL_URL =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin';

const AudioExtract: any = (() => {
  try { return requireNativeModule('AudioExtract'); } catch (e) { return null; }
})();

function fmt(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

type Picked = { name: string; durationMs: number | null; uri: string };
type AudioInfo = {
  path: string; durationMs: number; bytes: number;
  inputSampleRate: number; inputChannels: number; outputSampleRate: number;
};
type Tr = { text: string; loadSecs: number; runSecs: number; speed: number };

export default function App() {
  const clips = useMemo(() => suggestHighlights(makeSampleTranscript()), []);
  const [video, setVideo] = useState<Picked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audio, setAudio] = useState<AudioInfo | null>(null);
  const [secs, setSecs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [tr, setTr] = useState<Tr | null>(null);

  async function pickVideo() {
    setError(null); setAudio(null); setTr(null);
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
      if (!r.canceled && r.assets && r.assets.length > 0) {
        const a = r.assets[0];
        setVideo({ name: a.fileName ?? 'video', durationMs: a.duration ?? null, uri: a.uri });
      }
    } catch (e) { setError(String(e)); }
  }

  async function extractAudio() {
    if (!video) return;
    setError(null); setAudio(null); setTr(null); setBusy(true);
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
    setError(null); setTr(null); setBusy(true);
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
      const { promise } = ctx.transcribe(audio.path, { language: 'en' });
      const res = await promise;
      const runSecs = (Date.now() - t1) / 1000;
      await ctx.release();
      setTr({
        text: res.result,
        loadSecs,
        runSecs,
        speed: audio.durationMs / 1000 / runSecs,
      });
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); setStatus(''); }
  }

  const topPad = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 28) : 44;

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>AI Clip Studio</Text>
        <Text style={styles.sub}>Prototype v4 (transcribe test)</Text>
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Test steps: pick a video, extract audio, then transcribe. The first
            transcribe downloads a 78 MB model. The clips further down still
            come from a built-in SAMPLE transcript, not from your video.
          </Text>
        </View>
        <Pressable style={styles.button} onPress={pickVideo}>
          <Text style={styles.buttonText}>Pick a video</Text>
        </Pressable>
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
            <Text style={styles.meta}>Output: {audio.outputSampleRate} Hz mono, {(audio.bytes / 1048576).toFixed(1)} MB</Text>
            {secs !== null && <Text style={styles.meta}>Took {secs.toFixed(1)} s</Text>}
          </View>
        )}
        {audio && (
          <Pressable style={[styles.button, busy && styles.disabled]} onPress={transcribe} disabled={busy}>
            <Text style={styles.buttonText}>Transcribe (tiny.en)</Text>
          </Pressable>
        )}
        {busy && <ActivityIndicator />}
        {busy && status !== '' && <Text style={styles.meta}>{status}</Text>}
        {tr && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Transcript</Text>
            <Text style={styles.meta}>
              Model load {tr.loadSecs.toFixed(1)} s | transcribe {tr.runSecs.toFixed(1)} s | {tr.speed.toFixed(1)}x real time
            </Text>
            <Text style={styles.meta}>Characters: {tr.text.length}</Text>
            <Text style={styles.reason}>{tr.text.slice(0, 700)}</Text>
          </View>
        )}
        {error && <Text style={styles.error}>Error: {error}</Text>}
        <Text style={styles.cardTitle}>Sample highlights</Text>
        {clips.map((c, i) => (
          <View key={`${c.startMs}-${c.endMs}`} style={styles.card}>
            <Text style={styles.cardTitle}>{`${i + 1}. ${c.title}`}</Text>
            <Text style={styles.meta}>{`${fmt(c.startMs)} to ${fmt(c.endMs)}  |  experimental score ${c.score}`}</Text>
            <Text style={styles.reason}>{c.reason}</Text>
          </View>
        ))}
        {clips.length === 0 && <Text>No highlights found in the sample.</Text>}
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
});
