import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SharedPreferencesService extends GetxService {
  static SharedPreferences? _sharedPreferences;

  SharedPreferences get instance => _sharedPreferences!;

  static String keyHomeIndex = 'home_index';
  static String keyPhoneCallUserAgreement = 'phone_call_user_agreement';
  // 設定頁：訊息通知提醒、快速登入
  static String keyNotifyEnabled = 'notify_enabled';
  static String keyQuickLogin = 'quick_login';
  // 語言設定：'zh_TW' / 'en_US'
  static String keyLocale = 'locale';

  Future<SharedPreferencesService> init() async {
    await SharedPreferences.getInstance().then(
      (value) => _sharedPreferences = value,
    );
    return this;
  }
}
