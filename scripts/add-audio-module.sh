#!/usr/bin/env bash
set -euo pipefail
# Runs inside build-app. Adds a local Expo module that extracts 16 kHz mono WAV.
CI=1 npx --yes create-expo-module@latest --local \
  --name AudioExtract --description "Audio extraction" \
  --package expo.modules.audioextract audio-extract

MODCFG=$(find modules -name expo-module.config.json | head -1)
MODDIR=$(dirname "$MODCFG")
KT=$(find "$MODDIR/android" -name '*Module.kt' | head -1)
PKG=$(grep -m1 '^package ' "$KT" | sed 's/package //')
CLS=$(grep -m1 -o 'class [A-Za-z0-9_]*' "$KT" | sed 's/class //')
echo "Module dir: $MODDIR  file: $KT  package: $PKG  class: $CLS"

cat > "$KT" <<'KOTLIN_EOF'
package __PACKAGE__

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

class __CLASS__ : Module() {
  override fun definition() = ModuleDefinition {
    Name("AudioExtract")
    AsyncFunction("extractAudio") { uri: String -> extract(uri) }
  }

  private fun extract(uriStr: String): Map<String, Any> {
    val context = appContext.reactContext ?: throw Exception("No Android context")
    val extractor = MediaExtractor()
    var codec: MediaCodec? = null
    val outFile = File(context.cacheDir, "audio-16k.wav")
    val os = BufferedOutputStream(FileOutputStream(outFile))
    var samplesOut = 0L
    var origRate = 0
    var origCh = 0
    try {
      val uri = Uri.parse(uriStr)
      if (uri.scheme == "file" || uri.scheme == null) {
        extractor.setDataSource(uri.path ?: uriStr)
      } else {
        extractor.setDataSource(context, uri, null)
      }
      var track = -1
      var format: MediaFormat? = null
      for (i in 0 until extractor.trackCount) {
        val f = extractor.getTrackFormat(i)
        val m = f.getString(MediaFormat.KEY_MIME) ?: ""
        if (m.startsWith("audio/")) { track = i; format = f; break }
      }
      if (track < 0 || format == null) throw Exception("No audio track found in this video")
      extractor.selectTrack(track)
      val mime = format.getString(MediaFormat.KEY_MIME)!!
      var inRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      origRate = inRate
      origCh = channels

      val dec = MediaCodec.createDecoderByType(mime)
      codec = dec
      dec.configure(format, null, null, 0)
      dec.start()

      os.write(ByteArray(44)) // WAV header placeholder, patched at the end

      var step = inRate / 16000.0
      var nextOut = 0.0
      var idx = 0L
      var prev = 0f
      fun emit(v: Float) {
        var s = Math.round(v)
        if (s > 32767) s = 32767
        if (s < -32768) s = -32768
        os.write(s and 0xff)
        os.write((s shr 8) and 0xff)
        samplesOut++
      }
      fun feed(s: Float) {
        while (nextOut <= idx) {
          val frac = (nextOut - (idx - 1)).toFloat()
          val v = if (idx == 0L) s else prev + (s - prev) * frac
          emit(v)
          nextOut += step
        }
        prev = s
        idx++
      }

      val info = MediaCodec.BufferInfo()
      var inputDone = false
      var outputDone = false
      while (!outputDone) {
        if (!inputDone) {
          val i = dec.dequeueInputBuffer(10000)
          if (i >= 0) {
            val buf = dec.getInputBuffer(i)!!
            val n = extractor.readSampleData(buf, 0)
            if (n < 0) {
              dec.queueInputBuffer(i, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              dec.queueInputBuffer(i, 0, n, extractor.sampleTime, 0)
              extractor.advance()
            }
          }
        }
        val o = dec.dequeueOutputBuffer(info, 10000)
        if (o >= 0) {
          val ob = dec.getOutputBuffer(o)!!
          ob.order(ByteOrder.LITTLE_ENDIAN)
          ob.position(info.offset)
          ob.limit(info.offset + info.size)
          val sb = ob.asShortBuffer()
          val frames = sb.remaining() / channels
          for (f in 0 until frames) {
            var sum = 0f
            for (c in 0 until channels) sum += sb.get().toFloat()
            feed(sum / channels)
          }
          dec.releaseOutputBuffer(o, false)
          if ((info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outputDone = true
        } else if (o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
          val nf = dec.outputFormat
          inRate = nf.getInteger(MediaFormat.KEY_SAMPLE_RATE)
          channels = nf.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
          step = inRate / 16000.0
        }
      }
      os.flush()
    } finally {
      try { codec?.stop() } catch (e: Exception) {}
      try { codec?.release() } catch (e: Exception) {}
      extractor.release()
      os.close()
    }

    val dataBytes = samplesOut * 2
    RandomAccessFile(outFile, "rw").use { raf ->
      val h = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
      h.put("RIFF".toByteArray()); h.putInt((36 + dataBytes).toInt())
      h.put("WAVE".toByteArray()); h.put("fmt ".toByteArray())
      h.putInt(16); h.putShort(1); h.putShort(1)
      h.putInt(16000); h.putInt(32000); h.putShort(2); h.putShort(16)
      h.put("data".toByteArray()); h.putInt(dataBytes.toInt())
      raf.seek(0)
      raf.write(h.array())
    }
    return mapOf(
      "path" to "file://" + outFile.absolutePath,
      "durationMs" to (samplesOut * 1000 / 16000).toInt(),
      "bytes" to outFile.length().toInt(),
      "inputSampleRate" to origRate,
      "inputChannels" to origCh,
      "outputSampleRate" to 16000
    )
  }
}
KOTLIN_EOF

sed -i "s/__PACKAGE__/$PKG/; s/__CLASS__/$CLS/" "$KT"
echo "Audio module installed."
