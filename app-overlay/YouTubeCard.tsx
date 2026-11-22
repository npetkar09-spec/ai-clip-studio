import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, Image, Linking, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import {
  DECLARATION_TEXT, STUDIO_HOME_URL, addDeclaration, findDeclaration, guidedStage,
  makeDeclaration, oEmbedFailureMessage, oEmbedUrl, parseDeclarations, parseOEmbed,
  parseYouTubeLink, studioEditUrl,
} from './src/highlights/youtube';
import type { Declaration, VideoDetails } from './src/highlights/youtube';

export type PickedFile = { name: string; uri: string; durationMs: number | null; copied: boolean };

type Props = {
  busy: boolean;
  /** Called when the user chooses a video file from Files. */
  onFile: (f: PickedFile) => void;
  /** Opens the gallery picker. Resolves true if a video was chosen. */
  onPickGallery: () => Promise<boolean>;
  /** Text to put in the box (used when a YouTube link was pasted in the other link box). */
  prefill: { text: string; n: number } | null;
};

type Details =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ok'; data: VideoDetails }
  | { state: 'fail'; msg: string };

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default function YouTubeCard({ busy, onFile, onPickGallery, prefill }: Props) {
  const [text, setText] = useState('');
  const [details, setDetails] = useState<Details>({ state: 'idle' });
  const [decls, setDecls] = useState<Declaration[]>([]);
  const [declsLoaded, setDeclsLoaded] = useState(false);
  const [tick, setTick] = useState(false);
  const [studioOpened, setStudioOpened] = useState(false);
  const [returned, setReturned] = useState(false);
  const [pickedName, setPickedName] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const openedRef = useRef(false);

  const declFile = useMemo(() => new File(Paths.document, 'ownership-declarations.json'), []);
  const parsed = useMemo(() => (text.trim() === '' ? null : parseYouTubeLink(text)), [text]);
  const videoId = parsed && parsed.ok ? parsed.videoId : null;
  const confirmedRec = videoId ? findDeclaration(decls, videoId) : null;
  const stage = guidedStage(parsed, confirmedRec !== null, pickedName !== null);
  const off = busy || picking;

  // Fill the box when a YouTube link was pasted in the other link box.
  useEffect(() => {
    if (prefill && prefill.text.trim() !== '') setText(prefill.text.trim());
  }, [prefill]);

  // Load the saved ownership confirmations once.
  useEffect(() => {
    (async () => {
      try {
        if (declFile.exists) setDecls(parseDeclarations(await declFile.text()));
      } catch (e) { /* start with an empty list */ }
      setDeclsLoaded(true);
    })();
  }, [declFile]);

  // Notice when the user comes back from YouTube Studio.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && openedRef.current) setReturned(true);
    });
    return () => sub.remove();
  }, []);

  // A new video: reset the steps and ask YouTube's public oEmbed page for title, channel, thumbnail.
  useEffect(() => {
    openedRef.current = false;
    setStudioOpened(false); setReturned(false); setPickedName(null); setTick(false); setMsg(null);
    if (!videoId) { setDetails({ state: 'idle' }); return; }
    let cancelled = false;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10000);
    setDetails({ state: 'loading' });
    (async () => {
      try {
        const res = await fetch(oEmbedUrl(videoId), { signal: ctl.signal });
        if (!res.ok) {
          if (!cancelled) setDetails({ state: 'fail', msg: oEmbedFailureMessage(res.status) });
          return;
        }
        const d = parseOEmbed(await res.json());
        if (!cancelled) {
          setDetails(d ? { state: 'ok', data: d } : { state: 'fail', msg: oEmbedFailureMessage(null) });
        }
      } catch (e) {
        if (!cancelled) setDetails({ state: 'fail', msg: oEmbedFailureMessage(null) });
      } finally { clearTimeout(timer); }
    })();
    return () => { cancelled = true; ctl.abort(); clearTimeout(timer); };
  }, [videoId]);

  async function pasteLink() {
    setMsg(null);
    try {
      const t = await Clipboard.getStringAsync();
      if (t.trim() === '') {
        setMsg('The clipboard is empty. In YouTube tap Share, then Copy link, and come back.');
      } else {
        setText(t.trim());
      }
    } catch (e) {
      setMsg('Could not read the clipboard. Long-press in the box and choose Paste.');
    }
  }

  async function confirm() {
    if (!videoId) return;
    setMsg(null);
    const next = addDeclaration(decls, makeDeclaration(videoId, new Date()));
    try {
      if (!declFile.exists) declFile.create();
      await declFile.write(JSON.stringify(next));
      setDecls(next);
    } catch (e) {
      setMsg(`Could not save your confirmation on this phone (${String(e)}). Try again.`);
    }
  }

  async function openStudio() {
    if (!videoId) return;
    setMsg(null); setReturned(false);
    openedRef.current = true;
    setStudioOpened(true);
    try {
      await Linking.openURL(studioEditUrl(videoId));
    } catch (e) {
      try {
        await Linking.openURL(STUDIO_HOME_URL);
      } catch (e2) {
        setMsg(
          'Could not open YouTube Studio. Open the YouTube Studio app (or studio.youtube.com) ' +
          'yourself, find the video under Content, tap the three dots and choose Download.'
        );
      }
    }
  }

  async function pickFromFiles() {
    setMsg(null); setPicking(true);
    try {
      const r = await DocumentPicker.getDocumentAsync({
        type: 'video/*', copyToCacheDirectory: true, multiple: false,
      });
      if (r.canceled || !r.assets || r.assets.length === 0) return;
      const a = r.assets[0];
      if (a.mimeType && !a.mimeType.startsWith('video/')) {
        setMsg('That file is not a video. Choose the downloaded video file (usually .mp4).');
        return;
      }
      setPickedName(a.name);
      onFile({ name: a.name, uri: a.uri, durationMs: null, copied: true });
    } catch (e) {
      setMsg(`Could not open that file: ${String(e)}`);
    } finally { setPicking(false); }
  }

  async function pickFromGallery() {
    setMsg(null); setPicking(true);
    try {
      const chosen = await onPickGallery();
      if (chosen) setPickedName('video from Gallery');
    } finally { setPicking(false); }
  }

  return (
    <View style={s.card}>
      <Text style={s.title}>Clip a YouTube video</Text>
      <Text style={s.meta}>
        Paste a YouTube link (in YouTube: Share, then Copy link). The app recognises the video and
        shows its details. It does not download anything from YouTube: you add the video file
        yourself in the steps below.
      </Text>

      <Text style={s.step}>1. Paste the link</Text>
      <TextInput
        style={s.input}
        value={text}
        onChangeText={setText}
        placeholder="https://youtu.be/... or youtube.com/shorts/..."
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        editable={!off}
      />
      <View style={s.row}>
        <Pressable style={[s.small, off && s.disabled]} disabled={off} onPress={pasteLink}>
          <Text style={s.smallText}>Paste</Text>
        </Pressable>
        <Pressable style={[s.small, off && s.disabled]} disabled={off} onPress={() => setText('')}>
          <Text style={s.smallText}>Clear</Text>
        </Pressable>
      </View>
      {parsed && parsed.ok && (
        <Text style={s.good}>
          {`Recognised: ${parsed.label} (ID ${parsed.videoId})`}
        </Text>
      )}
      {parsed && !parsed.ok && <Text style={s.bad}>{parsed.message}</Text>}

      {videoId && details.state === 'loading' && (
        <View style={s.row}><ActivityIndicator /><Text style={s.meta}>Getting video details...</Text></View>
      )}
      {videoId && details.state === 'ok' && (
        <View style={s.detail}>
          {details.data.thumbnailUrl && (
            <Image source={{ uri: details.data.thumbnailUrl }} style={s.thumb} resizeMode="cover" />
          )}
          <Text style={s.detailTitle}>{details.data.title}</Text>
          {details.data.channel !== '' && <Text style={s.meta}>{`Channel: ${details.data.channel}`}</Text>}
        </View>
      )}
      {videoId && details.state === 'fail' && <Text style={s.meta}>{details.msg}</Text>}

      {(stage === 'confirm') && (
        <>
          <Text style={s.step}>2. Confirm you may edit this video</Text>
          <View style={s.decl}><Text style={s.declText}>{DECLARATION_TEXT}</Text></View>
          <Pressable style={s.check} disabled={off} onPress={() => setTick((v) => !v)}>
            <Text style={s.checkBox}>{tick ? '[x]' : '[ ]'}</Text>
            <Text style={s.checkText}>I agree with the statement above.</Text>
          </Pressable>
          <Pressable
            style={[s.button, (!tick || off || !declsLoaded) && s.disabled]}
            disabled={!tick || off || !declsLoaded}
            onPress={confirm}
          >
            <Text style={s.buttonText}>Confirm and continue</Text>
          </Pressable>
        </>
      )}

      {(stage === 'get-file' || stage === 'ready') && confirmedRec && (
        <>
          <Text style={s.good}>{`Confirmed on ${fmtDate(confirmedRec.confirmedAt)} (saved on this phone).`}</Text>
          <Text style={s.step}>3. Get the video file</Text>
          <Text style={s.meta}>
            If you uploaded this video, YouTube Studio lets you download it: open the video, tap
            the three dots and choose Download. YouTube gives an MP4 of up to 720p. Your original
            file from your phone or computer gives better quality.
          </Text>
          <Pressable style={[s.button, off && s.disabled]} disabled={off} onPress={openStudio}>
            <Text style={s.buttonText}>Open this video in YouTube Studio</Text>
          </Pressable>
          {returned && (
            <Text style={s.good}>
              Welcome back. If the download has finished, tap "Pick from Files" and choose it
              (look in Downloads).
            </Text>
          )}
          <Text style={s.step}>4. Choose the file</Text>
          <Pressable style={[s.button, off && s.disabled]} disabled={off} onPress={pickFromFiles}>
            <Text style={s.buttonText}>Pick from Files (Downloads)</Text>
          </Pressable>
          <Pressable style={[s.altButton, off && s.disabled]} disabled={off} onPress={pickFromGallery}>
            <Text style={s.altText}>Pick from Gallery</Text>
          </Pressable>
          <Text style={s.meta}>
            Have the original file in Google Drive or Dropbox? Use "Import from a link" below.
          </Text>
          {picking && (
            <View style={s.row}><ActivityIndicator /><Text style={s.meta}>Waiting for the file or copying it...</Text></View>
          )}
        </>
      )}

      {stage === 'ready' && pickedName && (
        <Text style={s.good}>
          {`Video loaded: ${pickedName}. Next: scroll down and tap "Extract audio".`}
        </Text>
      )}
      {msg && <Text style={s.bad}>{msg}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, gap: 8 },
  title: { fontSize: 18, fontWeight: '700', color: '#111' },
  step: { fontSize: 15, fontWeight: '600', color: '#111', marginTop: 6 },
  meta: { fontSize: 12, color: '#555' },
  good: { fontSize: 13, color: '#0a6b2d' },
  bad: { fontSize: 13, color: '#b00020' },
  input: { borderWidth: 1, borderColor: '#bbb', borderRadius: 8, padding: 10, fontSize: 14, color: '#111' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  small: { flex: 1, backgroundColor: '#eee', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  smallText: { color: '#111', fontSize: 14, fontWeight: '600' },
  button: { backgroundColor: '#111', borderRadius: 10, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  altButton: { backgroundColor: '#fff', borderRadius: 10, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#111' },
  altText: { color: '#111', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  detail: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 8, gap: 4 },
  thumb: { width: '100%', height: 170, borderRadius: 6, backgroundColor: '#eee' },
  detailTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  decl: { backgroundColor: '#f4f4f4', borderRadius: 8, padding: 10 },
  declText: { fontSize: 13, color: '#222' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  checkBox: { fontSize: 18, fontWeight: '700', color: '#111' },
  checkText: { fontSize: 14, color: '#111', flex: 1 },
});
