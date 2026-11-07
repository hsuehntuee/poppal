import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';
import 'package:path_provider/path_provider.dart';

/// App 自己啟動、看管手機本地的 llama-server（Snapdragon NPU）。
///
/// 之前是用 adb 在 /data/local/tmp 起的，拔線或鎖屏就會死，小幫手會悄悄降級成 WebView 裡的分類器。
/// 現在：
/// - 執行檔與 .so 都在 APK 的 jniLibs（`scripts/prepare-llama-jni.mjs`），解壓在 nativeLibraryDir，可直接執行。
/// - 模型放 App 的外部檔案夾（`/sdcard/Android/data/com.example.townpass/files/gguf/`，`scripts/phone-npu.ps1 -PushModel`），
///   找不到就試著從 assets/models 複製（若有打包）。
/// - 每 20 秒探一次 /health，沒回應就重新啟動；NPU 起不來就退回 CPU。
class LlmServerService extends GetxService {
  static const int port = 8080;
  static const String modelName = 'gemma-3-270m-decider-Q8_0.gguf';
  static const MethodChannel _ch = MethodChannel('townpass/native');

  final RxString status = 'idle'.obs;
  final RxString detail = ''.obs;
  Process? _proc;
  Timer? _watch;
  bool _starting = false;
  bool _cpuFallback = false;
  String? _nativeDir;
  String? _modelPath;

  Future<LlmServerService> init() async {
    // 不要擋住 App 啟動：背景做
    unawaited(_boot());
    return this;
  }

  void _set(String st, [String d = '']) {
    status.value = st;
    detail.value = d;
    // ignore: avoid_print
    print('[llm-server] $st ${d.isEmpty ? '' : '· $d'}');
  }

  Future<void> _boot() async {
    try {
      _nativeDir = await _ch.invokeMethod<String>('nativeLibraryDir');
      final List<String> names = Directory(_nativeDir!).listSync().map((FileSystemEntity f) => f.path.split('/').last).toList();
      _set('boot', 'nativeDir=$_nativeDir libs=${names.length} hasServer=${names.contains('libllama-server-bin.so')}');
    } catch (e) {
      _set('no-native-dir', e.toString());
      return;
    }
    await _ensureModel();
    await ensureRunning();
    _watch?.cancel();
    _watch = Timer.periodic(const Duration(seconds: 20), (_) => ensureRunning());
  }

  /// 模型：外部檔案夾 → assets（若有）
  Future<void> _ensureModel() async {
    final Directory? ext = await getExternalStorageDirectory();
    final List<String> candidates = <String>[
      if (ext != null) '${ext.path}/gguf/$modelName',
      '${(await getApplicationSupportDirectory()).path}/gguf/$modelName',
    ];
    for (final String p in candidates) {
      if (File(p).existsSync() && File(p).lengthSync() > 1000000) {
        _modelPath = p;
        _set('model', p);
        return;
      }
    }
    // APK 裡的 assets/models/<modelName> → 私有目錄（Kotlin 端串流複製，一次就好）
    final String target = candidates.last;
    try {
      _set('copying-model', target);
      final int? n = await _ch.invokeMethod<int>('copyAsset', <String, String>{'key': 'flutter_assets/assets/models/$modelName', 'dest': target});
      if (n != null && n > 1000000) {
        _modelPath = target;
        _set('model', '$target ($n bytes, copied from APK)');
        return;
      }
      _set('no-model', 'copy returned $n');
    } catch (e) {
      _set('no-model', '$e · 把模型放到 ${candidates.first}（scripts/phone-npu.ps1 -PushModel）');
    }
  }

  Future<bool> _healthy() async {
    try {
      final HttpClient c = HttpClient()..connectionTimeout = const Duration(seconds: 1);
      final HttpClientRequest req = await c.getUrl(Uri.parse('http://127.0.0.1:$port/health'));
      final HttpClientResponse res = await req.close().timeout(const Duration(seconds: 2));
      c.close(force: true);
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  Future<void> ensureRunning() async {
    if (_starting) return;
    if (await _healthy()) {
      if (!status.value.startsWith('running')) _set(_cpuFallback ? 'running-cpu' : 'running');
      return;
    }
    if (_nativeDir == null || _modelPath == null) {
      _set('not-ready', 'nativeDir=$_nativeDir model=$_modelPath');
      return;
    }
    _starting = true;
    try {
      // 先 NPU，起不來再 CPU
      final bool ok = await _start(npu: !_cpuFallback);
      if (!ok && !_cpuFallback) {
        _cpuFallback = true;
        await _start(npu: false);
      }
    } finally {
      _starting = false;
    }
  }

  Future<bool> _start({required bool npu}) async {
    final String dir = _nativeDir!;
    final String exe = '$dir/libllama-server-bin.so';
    if (!File(exe).existsSync()) {
      _set('no-binary', exe);
      return false;
    }
    try {
      _proc?.kill();
    } catch (_) {}
    final List<String> args = <String>[
      '-m', _modelPath!,
      if (npu) ...<String>['--device', 'HTP0', '-ngl', '99'],
      '--host', '127.0.0.1', '--port', '$port', '-c', '2048', '-np', '2', '--cache-reuse', '256', '-t', '6',
    ];
    _set(npu ? 'starting-npu' : 'starting-cpu', '$exe ${args.join(' ')}');
    try {
      _proc = await Process.start(exe, args, workingDirectory: dir, environment: <String, String>{
        'LD_LIBRARY_PATH': dir,
        'ADSP_LIBRARY_PATH': dir,
        'CDSP_LIBRARY_PATH': dir,
        'HOME': (await getApplicationSupportDirectory()).path,
      });
    } catch (e) {
      _set('spawn-failed', e.toString());
      return false;
    }
    final StringBuffer tail = StringBuffer();
    _proc!.stdout.transform(const SystemEncoding().decoder).listen((String s) => _log(tail, s));
    _proc!.stderr.transform(const SystemEncoding().decoder).listen((String s) => _log(tail, s));
    bool exited = false;
    unawaited(_proc!.exitCode.then((int code) {
      exited = true;
      debugPrint('[llm-server] exited $code');
    }));
    // 等它起來（模型 290MB，NPU 初始化約 2～8 秒）
    for (int i = 0; i < 40; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 500));
      if (exited) break;
      if (await _healthy()) {
        _set(npu ? 'running' : 'running-cpu');
        return true;
      }
    }
    status.value = 'failed';
    detail.value = tail.toString().split('\n').where((String l) => l.trim().isNotEmpty).toList().reversed.take(4).join(' | ');
    debugPrint('[llm-server] failed to start (${npu ? 'NPU' : 'CPU'}): ${detail.value}');
    try {
      _proc?.kill();
    } catch (_) {}
    return false;
  }

  void _log(StringBuffer tail, String s) {
    tail.write(s);
    if (tail.length > 4000) {
      final String t = tail.toString();
      tail
        ..clear()
        ..write(t.substring(t.length - 2000));
    }
    // ignore: avoid_print
    print('[llm-server] ${s.trimRight()}');
  }

  @override
  void onClose() {
    _watch?.cancel();
    super.onClose();
  }
}
