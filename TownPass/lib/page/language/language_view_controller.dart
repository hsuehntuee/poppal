import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:town_pass/service/shared_preferences_service.dart';

enum Language {
  traditionalChinese,
  english,
  ;
}

extension LanguageLocaleExt on Language {
  /// 寫入 SharedPreferences 的語言代碼
  String get localeString {
    return switch (this) {
      Language.traditionalChinese => 'zh_TW',
      Language.english => 'en_US',
    };
  }

  static Language fromLocaleString(String? value) {
    return Language.values.firstWhere(
      (language) => language.localeString == value,
      orElse: () => Language.traditionalChinese,
    );
  }
}

class LanguageViewController extends GetxController {
  late SharedPreferences sharedPreferences;

  List<Language> get languageList => [
        Language.traditionalChinese,
        Language.english,
      ];

  /// 進入頁面時已選取的語言索引（預設繁體中文）
  int initialIndex = 0;

  @override
  void onInit() {
    super.onInit();
    sharedPreferences = SharedPreferencesService().instance;
    final Language saved = LanguageLocaleExt.fromLocaleString(
      sharedPreferences.getString(SharedPreferencesService.keyLocale),
    );
    initialIndex = languageList.indexOf(saved);
  }

  // 儲存語言偏好；App 目前沒有 translations，所以不呼叫 Get.updateLocale。
  // 選取狀態由 selectionList 自行更新，稍等一下讓使用者看到勾選後再返回。
  Future<void> onIndexChange(int index) async {
    final Language language = languageList[index];
    await sharedPreferences.setString(SharedPreferencesService.keyLocale, language.localeString);
    await Future.delayed(const Duration(milliseconds: 250));
    Get.back();
  }
}
