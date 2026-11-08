import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:google_mlkit_language_id/google_mlkit_language_id.dart';
import 'package:google_mlkit_translation/google_mlkit_translation.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;
import 'package:town_pass/util/web_message_handler/tp_web_message_handler.dart';
import 'package:town_pass/util/web_message_handler/tp_web_message_reply.dart';

/// 小幫手用的四個 bridge（SPEC 第 4 節）。網頁只收發純文字，模型只做決策。
///
/// | name        | data                          | 回傳                      |
/// | `stt`       | `{ lang, offline? }`          | `{ text, lang, error? }`  |
/// | `lang_id`   | `{ text }`                    | `{ lang, conf }`          |
/// | `translate` | `{ text, from, to }`          | `{ text, error? }`        |
/// | `translate_prepare` | `{ langs: [...] }`    | `{ ok, downloaded: [...] }` |
/// | `tts`       | `{ text, lang }`              | `true`                    |

Map<String, dynamic> _asMap(Object? message) => message is Map ? Map<String, dynamic>.from(message) : const {};

/// 語音轉文字：Android 內建 SpeechRecognizer（speech_to_text）。
/// 離線語言包要先在手機「設定 → 語音 → 離線語音辨識」下載，再搭配 `offline: true`。
class SttMessageHandler extends TPWebMessageHandler {
  static final stt.SpeechToText _speech = stt.SpeechToText();
  static bool _initialized = false;
  static Completer<String>? _current;
  static String _last = '';
  /// 這一輪辨識收到的錯誤（error_language_unavailable 之類）
  static String _lastError = '';

  @override
  String get name => 'stt';

  @override
  Future<void> handle({
    required Object? message,
    required WebUri? sourceOrigin,
    required bool isMainFrame,
    required Function(WebMessage replyWebMessage)? onReply,
  }) async {
    final Map<String, dynamic> data = _asMap(message);
    final String lang = (data['lang'] as String?) ?? 'zh-TW';
    final bool offline = data['offline'] == true;

    try {
      if (!_initialized) {
        _initialized = await _speech.initialize(
          onStatus: (status) {
            // 'done' / 'notListening'：辨識結束但沒有 finalResult 時，用最後的部分結果
            if ((status == 'done' || status == 'notListening') && _current != null && !_current!.isCompleted) {
              _current!.complete(_last);
            }
          },
          onError: (e) {
            _lastError = e.errorMsg;
            if (_current != null && !_current!.isCompleted) _current!.complete(_last);
          },
          debugLogging: kDebugMode,
        );
      }
      if (!_initialized) {
        onReply?.call(replyWebMessage(data: {'text': '', 'lang': lang, 'error': 'stt_unavailable'}));
        return;
      }
      if (_speech.isListening) await _speech.stop();

      // 離線時先要求裝置端辨識；系統的裝置端模型沒有這個語言（中文常見）→ 改成一般辨識，
      // 沒網路時 Google 語音服務會自己用下載好的離線語言包
      final Stopwatch sw = Stopwatch()..start();
      // 裝置端（Google 離線語言包）認的是 cmn-Hant-TW，送 zh-TW 會被拒
      final String deviceLang = offline && RegExp(r'^zh[-_]?(TW|Hant)?$', caseSensitive: false).hasMatch(lang) ? 'cmn-Hant-TW' : lang;
      String text = await _listenOnce(deviceLang, offline, onReply);
      if (offline && text.isEmpty) {
        // 錯誤回呼可能比結束狀態晚幾十毫秒到；裝置端一下就結束（< 1.5 秒）也當作被拒
        await Future<void>.delayed(const Duration(milliseconds: 300));
        if (_lastError.contains('language') || sw.elapsedMilliseconds < 1500) {
          // 一般辨識器沒網路時會用 Google 的離線語言包，中文一樣要用 cmn-Hant-TW 才找得到包
          text = await _listenOnce(deviceLang, false, onReply);
        }
      }
      onReply?.call(replyWebMessage(data: {'text': text, 'lang': lang, if (_lastError.isNotEmpty && text.isEmpty) 'error': _lastError}));
    } catch (e) {
      onReply?.call(replyWebMessage(data: {'text': _last, 'lang': lang, 'error': e.toString()}));
    } finally {
      _current = null;
    }
  }

  /// 聽一次：回傳辨識到的字（空字串＝沒聽到或出錯，錯誤在 _lastError）
  static Future<String> _listenOnce(String lang, bool onDevice, Function(WebMessage replyWebMessage)? onReply) async {
      final completer = Completer<String>();
      _current = completer;
      _last = '';
      _lastError = '';
      // 回應速度：部分結果 0.9 秒沒變就當作講完，不等系統的靜音判定
      DateTime lastChange = DateTime.now();
      final Timer stableTimer = Timer.periodic(const Duration(milliseconds: 300), (t) {
        if (completer.isCompleted) {
          t.cancel();
          return;
        }
        if (_last.isNotEmpty && DateTime.now().difference(lastChange).inMilliseconds >= 1400) {
          t.cancel();
          completer.complete(_last);
        }
      });
      await _speech.listen(
        listenOptions: stt.SpeechListenOptions(
          localeId: lang == 'auto' ? null : lang.replaceAll('-', '_'),
          listenFor: const Duration(seconds: 15),
          pauseFor: const Duration(milliseconds: 3000), // 按下去到開口之間給 3 秒；講完的提前結束靠上面的穩定判定
          partialResults: true,
          onDevice: onDevice,
          listenMode: stt.ListenMode.dictation,
          cancelOnError: true,
        ),
        onResult: (r) {
          if (r.recognizedWords != _last) {
            _last = r.recognizedWords;
            lastChange = DateTime.now();
            // 即時字幕：網頁可以監聽 name == 'stt_partial'
            onReply?.call(TPWebStringMessageReply(name: 'stt_partial', data: {'text': _last}).message);
          }
          if (r.finalResult && !completer.isCompleted) completer.complete(_last);
        },
      );
      final String text = await completer.future.timeout(const Duration(seconds: 15), onTimeout: () => _last);
      stableTimer.cancel();
      if (_speech.isListening) await _speech.stop();
      return text;
  }
}

/// 語言辨識：ML Kit，在手機本地執行。
class LangIdMessageHandler extends TPWebMessageHandler {
  static final LanguageIdentifier _identifier = LanguageIdentifier(confidenceThreshold: 0.3);

  @override
  String get name => 'lang_id';

  @override
  Future<void> handle({
    required Object? message,
    required WebUri? sourceOrigin,
    required bool isMainFrame,
    required Function(WebMessage replyWebMessage)? onReply,
  }) async {
    final String text = (_asMap(message)['text'] as String?) ?? '';
    try {
      final List<IdentifiedLanguage> langs = await _identifier.identifyPossibleLanguages(text);
      if (langs.isEmpty) {
        onReply?.call(replyWebMessage(data: {'lang': 'und', 'conf': 0}));
        return;
      }
      langs.sort((a, b) => b.confidence.compareTo(a.confidence));
      // ML Kit 回 zh / zh-Latn 等；只保留主要語言碼
      final String tag = langs.first.languageTag.split('-').first;
      onReply?.call(replyWebMessage(data: {'lang': tag, 'conf': langs.first.confidence}));
    } catch (e) {
      onReply?.call(replyWebMessage(data: {'lang': 'und', 'conf': 0, 'error': e.toString()}));
    }
  }
}

TranslateLanguage? _translateLanguage(String code) {
  final String c = code.toLowerCase().split('-').first;
  for (final TranslateLanguage l in TranslateLanguage.values) {
    if (l.bcpCode.toLowerCase() == c) return l;
  }
  return null;
}

/// 翻譯：ML Kit on-device translation。每個語言模型約 30MB，**賽前先用 translate_prepare 下載**。
/// 注意：翻成中文輸出的是簡體，但只給決策器看，不顯示給使用者。
class TranslateMessageHandler extends TPWebMessageHandler {
  static final OnDeviceTranslatorModelManager _models = OnDeviceTranslatorModelManager();

  @override
  String get name => 'translate';

  @override
  Future<void> handle({
    required Object? message,
    required WebUri? sourceOrigin,
    required bool isMainFrame,
    required Function(WebMessage replyWebMessage)? onReply,
  }) async {
    final Map<String, dynamic> data = _asMap(message);
    final String text = (data['text'] as String?) ?? '';
    final TranslateLanguage? from = _translateLanguage((data['from'] as String?) ?? '');
    final TranslateLanguage? to = _translateLanguage((data['to'] as String?) ?? 'zh');
    if (from == null || to == null) {
      onReply?.call(replyWebMessage(data: {'text': text, 'error': 'unsupported_language'}));
      return;
    }
    if (from == to) {
      onReply?.call(replyWebMessage(data: {'text': text}));
      return;
    }
    final OnDeviceTranslator translator = OnDeviceTranslator(sourceLanguage: from, targetLanguage: to);
    try {
      for (final TranslateLanguage l in [from, to]) {
        if (!await _models.isModelDownloaded(l.bcpCode)) {
          await _models.downloadModel(l.bcpCode, isWifiRequired: false);
        }
      }
      final String out = await translator.translateText(text);
      onReply?.call(replyWebMessage(data: {'text': out}));
    } catch (e) {
      onReply?.call(replyWebMessage(data: {'text': text, 'error': e.toString()}));
    } finally {
      await translator.close();
    }
  }
}

/// 賽前預先下載翻譯模型：`{ langs: ['zh','en','vi','id','th'] }`
class TranslatePrepareMessageHandler extends TPWebMessageHandler {
  static final OnDeviceTranslatorModelManager _models = OnDeviceTranslatorModelManager();

  @override
  String get name => 'translate_prepare';

  @override
  Future<void> handle({
    required Object? message,
    required WebUri? sourceOrigin,
    required bool isMainFrame,
    required Function(WebMessage replyWebMessage)? onReply,
  }) async {
    final List<String> langs = ((_asMap(message)['langs'] as List?) ?? ['zh', 'en', 'vi', 'id', 'th']).cast<String>();
    final List<String> done = [];
    for (final String code in langs) {
      final TranslateLanguage? l = _translateLanguage(code);
      if (l == null) continue;
      try {
        if (!await _models.isModelDownloaded(l.bcpCode)) await _models.downloadModel(l.bcpCode, isWifiRequired: false);
        done.add(code);
      } catch (_) {}
    }
    onReply?.call(replyWebMessage(data: {'ok': done.length == langs.length, 'downloaded': done}));
  }
}

/// 朗讀：網頁的 speechSynthesis 不能用時的備案。
class TtsMessageHandler extends TPWebMessageHandler {
  static final FlutterTts _tts = FlutterTts();

  @override
  String get name => 'tts';

  @override
  Future<void> handle({
    required Object? message,
    required WebUri? sourceOrigin,
    required bool isMainFrame,
    required Function(WebMessage replyWebMessage)? onReply,
  }) async {
    final Map<String, dynamic> data = _asMap(message);
    final String text = (data['text'] as String?) ?? '';
    final String lang = (data['lang'] as String?) ?? 'zh-TW';
    try {
      await _tts.stop();
      await _tts.setLanguage(lang);
      await _tts.setSpeechRate(0.5);
      await _tts.speak(text);
      onReply?.call(replyWebMessage(data: true));
    } catch (e) {
      onReply?.call(replyWebMessage(data: false));
    }
  }
}
