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

const ClipExport: any = (() => {
  try { return requireNativeModule('ClipExport'); } catch (e) { return null; }
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
type Clip = ReturnType<typeof suggestHighlights>[number];
type Tr = {
  text: string; loadSecs: number; runSecs: number; speed: number;
  segCount: number; unit: string; lastEndMs: number; clips: Clip[];
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

      // Work out the time unit of the segment times from the audio length.
      const segs = res.segments ?? [];
