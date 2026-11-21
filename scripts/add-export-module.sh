#!/usr/bin/env bash
set -euo pipefail
# Runs inside build-app. Adds a local Expo module that trims a clip, crops it
# to 9:16 and saves it to Movies/AI Clip Studio, using Android Media3 Transformer.
CI=1 npx --yes create-expo-module@latest --local \
  --name ClipExport --description "Clip export" \
  --package expo.modules.clipexport clip-export

MODDIR="modules/clip-export"
KT=$(find "$MODDIR/android" -name '*Module.kt' | head -1)
PKG=$(grep -m1 '^package ' "$KT" | sed 's/package //')
CLS=$(grep -m1 -o 'class [A-Za-z0-9_]*' "$KT" | sed 's/class //')
echo "Export module dir: $MODDIR  file: $KT  package: $PKG  class: $CLS"

cat > "$KT" <<'KOTLIN_EOF'
package __PACKAGE__

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.media.MediaMetadataRetriever
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.OverlaySettings
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.BitmapOverlay
import androidx.media3.effect.OverlayEffect
import androidx.media3.effect.Presentation
import androidx.media3.effect.StaticOverlaySettings
import androidx.media3.effect.TextureOverlay
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import org.json.JSONArray

@UnstableApi
class __CLASS__ : Module() {
  override fun definition() = ModuleDefinition {
    Name("ClipExport")
    AsyncFunction("exportClip") { uri: String, startMs: Double, endMs: Double, name: String, captionsJson: String, promise: Promise ->
      exportClip(uri, startMs.toLong(), endMs.toLong(), name, captionsJson, promise)
    }
  }

  private fun exportClip(uriStr: String, startMs: Long, endMs: Long, name: String, captionsJson: String, promise: Promise) {
    val context = appContext.reactContext
    if (context == null) {
      promise.reject("E_CTX", "No Android context", null)
      return
    }
    val out = File(context.cacheDir, "clip-$name.mp4")
    if (out.exists()) out.delete()
    // Transformer must be created and started on a thread that has a Looper.
    Handler(Looper.getMainLooper()).post {
      try {
        val clipping = MediaItem.ClippingConfiguration.Builder()
          .setStartPositionMs(startMs)
          .setEndPositionMs(endMs)
          .build()
        val item = MediaItem.Builder()
          .setUri(uriStr)
          .setClippingConfiguration(clipping)
          .build()
        val videoEffects = mutableListOf<Effect>(
          Presentation.createForAspectRatio(9f / 16f, Presentation.LAYOUT_SCALE_TO_FIT_WITH_CROP)
        )
        var overlay: CaptionOverlay? = null
        var captionError = ""
        try {
          val chunks = parseChunks(captionsJson)
          if (chunks.isNotEmpty()) {
            val ov = CaptionOverlay(chunks, estimateFrameWidth(context, uriStr))
            overlay = ov
            // Added AFTER Presentation, so it is drawn on the final 9:16 frame.
            videoEffects.add(OverlayEffect(listOf<TextureOverlay>(ov)))
          }
        } catch (e: Throwable) {
          captionError = e.message ?: e.javaClass.simpleName
          overlay = null
        }
        val effects = Effects(listOf<AudioProcessor>(), videoEffects)
        val usedOverlay = overlay
        val usedError = captionError
        val edited = EditedMediaItem.Builder(item).setEffects(effects).build()
        val transformer = Transformer.Builder(context)
          .addListener(object : Transformer.Listener {
            override fun onCompleted(composition: Composition, exportResult: ExportResult) {
              Thread {
                try {
                  val saved = saveToGallery(context, out, name)
                  promise.resolve(mapOf(
                    "path" to out.absolutePath,
                    "bytes" to out.length().toDouble(),
                    "savedToGallery" to (saved != null),
                    "captionStates" to (usedOverlay?.stateCount() ?: 0),
                    "captionError" to usedError
                  ))
                } catch (e: Exception) {
                  promise.reject("E_SAVE", e.message ?: "Could not save clip", e)
                }
              }.start()
            }

            override fun onError(
              composition: Composition,
              exportResult: ExportResult,
              exportException: ExportException
            ) {
              promise.reject("E_EXPORT", exportException.message ?: "Export failed", exportException)
            }
          })
          .build()
        transformer.start(edited, out.absolutePath)
      } catch (e: Exception) {
        promise.reject("E_EXPORT", e.message ?: "Export failed", e)
      }
    }
  }

  private class CapWord(val text: String, val s: Long, val e: Long)
  private class CapChunk(val s: Long, val e: Long, val words: List<CapWord>)

  private fun parseChunks(json: String): List<CapChunk> {
    if (json.isBlank()) return emptyList()
    val arr = JSONArray(json)
    val out = ArrayList<CapChunk>()
    for (i in 0 until arr.length()) {
      val c = arr.getJSONObject(i)
      val wa = c.getJSONArray("w")
      val ws = ArrayList<CapWord>()
      for (j in 0 until wa.length()) {
        val w = wa.getJSONObject(j)
        ws.add(CapWord(w.getString("t"), w.getLong("s"), w.getLong("e")))
      }
      if (ws.isNotEmpty()) out.add(CapChunk(c.getLong("s"), c.getLong("e"), ws))
    }
    return out
  }

  // Width of the final 9:16 frame, estimated from the source (after rotation).
  private fun estimateFrameWidth(context: Context, uriStr: String): Float {
    val r = MediaMetadataRetriever()
    try {
      r.setDataSource(context, android.net.Uri.parse(uriStr))
      var w = (r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH) ?: "0").toInt()
      var h = (r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT) ?: "0").toInt()
      val rot = (r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION) ?: "0").toInt()
      if (rot == 90 || rot == 270) { val t = w; w = h; h = t }
      if (w <= 0 || h <= 0) return 720f
      return if (w.toFloat() / h > 9f / 16f) h * 9f / 16f else w.toFloat()
    } catch (e: Exception) {
      return 720f
    } finally {
      try { r.release() } catch (e: Exception) { }
    }
  }

  // Draws one caption chunk as a bitmap; the spoken word is yellow. Bitmaps are cached per state.
  @UnstableApi
  private class CaptionOverlay(
    private val chunks: List<CapChunk>,
    private val frameWidth: Float
  ) : BitmapOverlay() {
    private val cache = HashMap<Int, Bitmap>()
    private val empty: Bitmap = Bitmap.createBitmap(2, 2, Bitmap.Config.ARGB_8888)
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      textSize = TEXT_PX
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      textSize = TEXT_PX
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      style = Paint.Style.STROKE
      strokeWidth = 14f
      strokeJoin = Paint.Join.ROUND
      color = Color.BLACK
    }

    fun stateCount(): Int = cache.size

    private fun stateFor(ms: Long): Pair<Int, Int> {
      for (i in chunks.indices) {
        val c = chunks[i]
        if (ms >= c.s && ms < c.e) {
          var active = 0
          for (j in c.words.indices) if (c.words[j].s <= ms) active = j
          return Pair(i, active)
        }
      }
      return Pair(-1, -1)
    }

    private fun bitmapFor(presentationTimeUs: Long): Pair<Bitmap, Boolean> {
      val st = stateFor(presentationTimeUs / 1000)
      if (st.first < 0) return Pair(empty, false)
      val key = st.first * 1000 + st.second
      val hit = cache[key]
      if (hit != null) return Pair(hit, true)
      val bmp = render(chunks[st.first], st.second)
      cache[key] = bmp
      return Pair(bmp, true)
    }

    private fun render(c: CapChunk, active: Int): Bitmap {
      val words = c.words.map { it.text.uppercase() }
      val space = fill.measureText(" ")
      var total = 0f
      for (w in words) total += fill.measureText(w)
      total += space * (words.size - 1)
      val pad = 14f
      val fm = fill.fontMetrics
      val bw = Math.ceil((total + pad * 2).toDouble()).toInt().coerceAtLeast(2)
      val bh = Math.ceil((fm.descent - fm.ascent + pad * 2).toDouble()).toInt().coerceAtLeast(2)
      val bmp = Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(bmp)
      var x = pad
      val y = pad - fm.ascent
      for (i in words.indices) {
        canvas.drawText(words[i], x, y, stroke)
        fill.color = if (i == active) Color.rgb(255, 221, 0) else Color.WHITE
        canvas.drawText(words[i], x, y, fill)
        x += fill.measureText(words[i]) + space
      }
      return bmp
    }

    override fun getBitmap(presentationTimeUs: Long): Bitmap = bitmapFor(presentationTimeUs).first

    override fun getOverlaySettings(presentationTimeUs: Long): OverlaySettings {
      val b = bitmapFor(presentationTimeUs)
      if (!b.second) {
        return StaticOverlaySettings.Builder().setScale(0.001f, 0.001f).build()
      }
      val bmp = b.first
      val byHeight = 0.085f * frameWidth / TEXT_PX
      val byWidth = 0.92f * frameWidth / bmp.width.toFloat()
      val scale = Math.min(byHeight, byWidth)
      return StaticOverlaySettings.Builder()
        .setScale(scale, scale)
        .setBackgroundFrameAnchor(0f, -0.35f)
        .build()
    }

    companion object {
      const val TEXT_PX = 100f
    }
  }

  // Android 10+ lets an app add to Movies/ with no storage permission.
  private fun saveToGallery(context: Context, file: File, name: String): String? {
    if (Build.VERSION.SDK_INT < 29) return null
    val values = ContentValues().apply {
      put(MediaStore.Video.Media.DISPLAY_NAME, "AI-Clip-$name.mp4")
      put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
      put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/AI Clip Studio")
      put(MediaStore.Video.Media.IS_PENDING, 1)
    }
    val resolver = context.contentResolver
    val dest = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values) ?: return null
    resolver.openOutputStream(dest)?.use { o -> file.inputStream().use { it.copyTo(o) } }
    values.clear()
    values.put(MediaStore.Video.Media.IS_PENDING, 0)
    resolver.update(dest, values, null, null)
    return dest.toString()
  }
}
KOTLIN_EOF

sed -i "s/__PACKAGE__/$PKG/g; s/__CLASS__/$CLS/g" "$KT"

# Media3 version from developer.android.com (editing-app guide), checked 2026-11-21.
cat >> "$MODDIR/android/build.gradle" <<'GRADLE_EOF'

dependencies {
  implementation "androidx.media3:media3-transformer:1.11.1"
  implementation "androidx.media3:media3-effect:1.11.1"
  implementation "androidx.media3:media3-common:1.11.1"
}
GRADLE_EOF
echo "Export module ready"
