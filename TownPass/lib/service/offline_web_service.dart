import 'dart:typed_data';

import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

/// 離線網頁：APK 內建整個微服務網站（assets/web/，由 scripts/bundle-web.mjs 產生）。
/// WebView 對 http://townpass.local/* 的請求全部在這裡攔下來、從 assets 回檔，
/// 沒有副檔名的路徑（SPA 路由）一律回 index.html。飛航模式也能跑完整流程。
class OfflineWebService {
  static const String host = 'townpass.local';
  static const String origin = 'http://townpass.local';

  static final Map<String, String> _mime = {
    'html': 'text/html', 'js': 'text/javascript', 'mjs': 'text/javascript', 'css': 'text/css', 'json': 'application/json',
    'svg': 'image/svg+xml', 'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'webp': 'image/webp', 'gif': 'image/gif',
    'ico': 'image/x-icon', 'woff': 'font/woff', 'woff2': 'font/woff2', 'ttf': 'font/ttf', 'otf': 'font/otf',
    'wasm': 'application/wasm', 'onnx': 'application/octet-stream', 'bin': 'application/octet-stream', 'txt': 'text/plain', 'model': 'application/octet-stream',
  };

  static bool matches(WebUri? url) => url?.host == host;

  /// 給 TPInAppWebView.shouldInterceptRequest
  static Future<WebResourceResponse?> intercept(WebResourceRequest request) async {
    final WebUri url = request.url;
    if (url.host != host) return null;
    String path = url.path;
    if (path.isEmpty || path == '/') path = '/index.html';
    if (path.endsWith('/')) path += 'index.html';
    final bool isAssistant = path.startsWith('/assistant');
    String ext = path.contains('.') ? path.split('.').last.toLowerCase() : '';
    Uint8List? bytes = await _load('assets/web$path');
    if (bytes == null) {
      // SPA fallback
      final String index = isAssistant ? 'assets/web/assistant/index.html' : 'assets/web/index.html';
      bytes = await _load(index);
      ext = 'html';
      if (bytes == null) {
        return WebResourceResponse(contentType: 'text/plain', statusCode: 404, reasonPhrase: 'Not Found', data: Uint8List.fromList('not bundled: $path'.codeUnits));
      }
    }
    return WebResourceResponse(
      contentType: _mime[ext] ?? 'application/octet-stream',
      contentEncoding: ext == 'html' || ext == 'js' || ext == 'css' || ext == 'json' || ext == 'svg' || ext == 'txt' ? 'utf-8' : null,
      statusCode: 200,
      reasonPhrase: 'OK',
      headers: {'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache'},
      data: bytes,
    );
  }

  static Future<Uint8List?> _load(String asset) async {
    try {
      final ByteData d = await rootBundle.load(asset);
      return d.buffer.asUint8List(d.offsetInBytes, d.lengthInBytes);
    } catch (_) {
      return null;
    }
  }
}
