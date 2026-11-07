import 'dart:io';
import 'dart:collection';
import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:get/get.dart';
import 'package:town_pass/service/offline_web_service.dart';
import 'package:town_pass/page/city_service/model/my_service_model.dart';

/// 小幫手入口頁網址。用 --dart-define=ASSISTANT_URL=... 覆寫；預設跟著 DEV_SERVICE_URL。
const String kAssistantUrl = String.fromEnvironment('ASSISTANT_URL', defaultValue: '');

/// 離線模式：OFFLINE_WEB=1 時所有服務與小幫手都從 APK 內建網頁（http://townpass.local/）載入，不需要筆電。
const bool kOfflineWeb = bool.fromEnvironment('OFFLINE_WEB', defaultValue: false);

/// 手機本地 llama-server 的網址（路線 B）。空字串 = 用小幫手同源的 /llm 轉發。
const String kLlmUrl = String.fromEnvironment('LLM_URL', defaultValue: '');

/// 把 guide-overlay.js 注入到**每一個**服務頁的 WebView（SPEC 6.0：疊在原本的服務上面，不改寫服務）。
/// 腳本來源：assets/js/guide-overlay.js（由 assistant 專案 `pnpm build` 後複製過來）。
class AssistantService extends GetxService {
  String _overlaySource = '';

  String get assistantUrl => kAssistantUrl.isNotEmpty ? kAssistantUrl : '${kDevServiceUrl}assistant/';

  Future<AssistantService> init() async {
    // 開發用覆蓋資料夾（見 OfflineWebService.overrideDir）：讀不到就回 APK 內建的
    try {
      final String? o = await OfflineWebService.overrideDir();
      final File? f = o == null ? null : File('$o/assets/js/guide-overlay.js');
      if (f != null && f.existsSync()) _overlaySource = await f.readAsString();
    } catch (e) {
      print('[assistant] override overlay failed: $e');
    }
    if (_overlaySource.isEmpty) {
      try {
        _overlaySource = await rootBundle.loadString('assets/js/guide-overlay.js');
      } catch (e) {
        print('[assistant] bundled overlay failed: $e');
        _overlaySource = '';
      }
    }
    print('[assistant] overlay source ${_overlaySource.length} chars, url=$assistantUrl');
    return this;
  }

  bool get hasOverlay => _overlaySource.trim().isNotEmpty;

  /// 給 TPInAppWebView 的 initialUserScripts。
  /// 只注入一小段「載入器」，每次從小幫手伺服器抓最新的 guide-overlay.js，
  /// 這樣改網頁不用重編 APK；伺服器連不到時才退回 APK 內建的副本。
  UnmodifiableListView<UserScript> get userScripts {
    final String base = assistantUrl.endsWith('/') ? assistantUrl : '$assistantUrl/';
    final String config = 'window.__TP_ASSISTANT_BASE__=${_js(base)};'
        '${kLlmUrl.isNotEmpty ? 'window.__TP_LLM_URL__=${_js(kLlmUrl)};' : ''}';
    final String fallback = hasOverlay ? 'var f=document.createElement("script");f.text=${_js(_overlaySource)};document.head.appendChild(f);' : '';
    final String loader = '(function(){'
        'if(location.pathname.indexOf("/assistant")===0)return;'
        'if(window.__tpGuideLoaderDone)return;window.__tpGuideLoaderDone=true;'
        '$config'
        'var s=document.createElement("script");s.src=${_js(base)}+"guide-overlay.js?v="+Date.now();s.defer=true;'
        's.onerror=function(){$fallback};'
        'document.head.appendChild(s);'
        '})();';
    return UnmodifiableListView<UserScript>([
      UserScript(
        source: loader,
        injectionTime: UserScriptInjectionTime.AT_DOCUMENT_END,
        forMainFrameOnly: true,
      ),
    ]);
  }

  /// 變成合法的 JS 字串常值：換行、U+2028/2029 都要跳脫（內建 overlay 有多行，之前整段 user script 會 SyntaxError）
  static String _js(String s) => jsonEncode(s).replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
}
