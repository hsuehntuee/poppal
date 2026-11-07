import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:town_pass/service/shared_preferences_service.dart';
import 'package:town_pass/util/tp_switch.dart';

class SettingViewController extends GetxController {
  late SharedPreferences sharedPreferences;

  // 兩個開關各自綁一個 TPSwitchController；切換時立即寫入 SharedPreferences
  late final TPSwitchController notificationSwitch;
  late final TPSwitchController quickLoginSwitch;

  bool get isNotificationOn => notificationSwitch.value.value;

  bool get isQuickLoginOn => quickLoginSwitch.value.value;

  @override
  void onInit() {
    super.onInit();
    sharedPreferences = SharedPreferencesService().instance;

    // 訊息通知提醒預設開啟；快速登入預設關閉
    notificationSwitch = TPSwitchController(
      sharedPreferences.getBool(SharedPreferencesService.keyNotifyEnabled) ?? true,
      onChanged: (value) => sharedPreferences.setBool(SharedPreferencesService.keyNotifyEnabled, value),
    );
    quickLoginSwitch = TPSwitchController(
      sharedPreferences.getBool(SharedPreferencesService.keyQuickLogin) ?? false,
      onChanged: (value) => sharedPreferences.setBool(SharedPreferencesService.keyQuickLogin, value),
    );
  }

  DateTime get lastLoginDateTime => DateTime.now();
}
