package com.example.townpass

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity: FlutterActivity() {
    companion object {
        init {
            // 先把 llama-server 的依賴載進 App 程序（classloader namespace：看得到 vendor 的 libcdsprpc / libOpenCL）
            try { System.loadLibrary("polaris_server") } catch (e: Throwable) { android.util.Log.e("llm-server", "loadLibrary polaris_server: $e") }
        }
    }
    private external fun nativeStartServer(args: Array<String>, libDir: String): Int

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // 給 Dart 端拿 nativeLibraryDir（jniLibs 解壓的位置，llama-server 執行檔就在這裡）
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "townpass/native").setMethodCallHandler { call, result ->
            when (call.method) {
                "nativeLibraryDir" -> result.success(applicationInfo.nativeLibraryDir)
                // 在 App 程序裡啟動 llama-server（NPU 路線）
                "startServerInProcess" -> {
                    val args = (call.argument<List<String>>("args") ?: emptyList()).toTypedArray()
                    try {
                        result.success(nativeStartServer(args, applicationInfo.nativeLibraryDir))
                    } catch (e: Throwable) {
                        result.error("start_failed", e.toString(), null)
                    }
                }
                // 串流把 APK 裡的 asset 複製到檔案（模型 290MB，不能一次讀進記憶體）
                "copyAsset" -> {
                    val key = call.argument<String>("key")!!
                    val dest = call.argument<String>("dest")!!
                    // 在背景執行緒複製，不要卡住 UI（290MB 約 1～3 秒）
                    Thread {
                        try {
                            val out = java.io.File(dest)
                            out.parentFile?.mkdirs()
                            assets.open(key).use { input -> java.io.FileOutputStream(out).use { output -> input.copyTo(output, 1 shl 20) } }
                            val n = out.length()
                            runOnUiThread { result.success(n) }
                        } catch (e: Exception) {
                            runOnUiThread { result.error("copy_failed", e.toString(), null) }
                        }
                    }.start()
                }
                else -> result.notImplemented()
            }
        }
    }
}
