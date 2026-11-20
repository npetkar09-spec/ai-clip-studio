import React, { useMemo } from 'react';
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { suggestHighlights } from './src/highlights';
import { makeSampleTranscript } from './src/sample/sampleTranscript';

function fmt(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function App() {
  const clips = useMemo(() => suggestHighlights(makeSampleTranscript()), []);
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>AI Clip Studio</Text>
        <Text style={styles.sub}>Prototype build check</Text>
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            This screen runs the real highlight engine on a built-in SAMPLE transcript, not on your video. Picking videos,
            transcription and export are not built yet.
          </Text>
        </View>
        {clips.map((c, i) => (
          <View key={`${c.startMs}-${c.endMs}`} style={styles.card}>
            <Text style={styles.cardTitle}>{`${i + 1}. ${c.title}`}</Text>
            <Text style={styles.meta}>{`${fmt(c.startMs)} to ${fmt(c.endMs)}  |  experimental score ${c.score}`}</Text>
            <Text style={styles.reason}>{c.reason}</Text>
          </View>
        ))}
        {clips.length === 0 && <Text>No highlights found in the sample.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  body: { padding: 20, gap: 12 },
  title: { fontSize: 26, fontWeight: '700', color: '#111' },
  sub: { fontSize: 14, color: '#555' },
  notice: { backgroundColor: '#fff4d6', borderRadius: 8, padding: 12 },
  noticeText: { color: '#5a4300', fontSize: 13 },
  card: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111' },
  meta: { fontSize: 12, color: '#555' },
  reason: { fontSize: 13, color: '#222' },
});
