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
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.Presentation
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

@UnstableApi
class __CLASS__ : Module() {
  override fun definition() = ModuleDefinition {
    Name("ClipExport")
    AsyncFunction("exportClip") { uri: String, startMs: Double, endMs: Double, name: String, promise: Promise ->
      exportClip(uri, startMs.toLong(), endMs.toLong(), name, promise)
    }
  }

  private fun exportClip(uriStr: String, startMs: Long, endMs: Long, name: String, promise: Promise) {
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
        val effects = Effects(
          listOf<AudioProcessor>(),
          listOf<Effect>(
            Presentation.createForAspectRatio(9f / 16f, Presentation.LAYOUT_SCALE_TO_FIT_WITH_CROP)
          )
        )
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
                    "savedToGallery" to (saved != null)
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
