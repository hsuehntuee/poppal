import 'package:flutter/material.dart';
import 'package:town_pass/gen/assets.gen.dart';
import 'package:town_pass/service/assistant_service.dart';

// 先於 MyServiceItemId enum 加入新服務；
// 再在 MyServiceIdExt 擴充中加入該服務的 MyServiceItem 物件。
//
// First, add new service within the MyServiceItemId enum;
// Then add MyServiceItem within MyServiceIdExt extension.

enum MyServiceItemId {
  dedicatedLine,
  districtOffice,
  reportIssue,
  reservation,
  iVoting,
  dashboard,
  survey,
  police,
  neighborhood,
  disasterReport,
  vaccineAppointment,
  medicalAppointment,
  cityRadio,
  familyCenter,
  greenMap,
  petFriendlyMap,
  waterMeter,
  essentialGoods,
  library,
  locationSearch,
  zoo,
  devService,
  assistant,
  ;
}

// 本機開發中的微服務網址。用 --dart-define=DEV_SERVICE_URL=... 覆寫。
// 搭配 `adb reverse tcp:5173 tcp:5173`，手機上的 localhost 會連到電腦的 dev server。
const String kDevServiceUrl = String.fromEnvironment(
  'DEV_SERVICE_URL',
  // 離線版：APK 內建網頁（see OfflineWebService）；開發時用 --dart-define=DEV_SERVICE_URL=http://<筆電IP>:5180/
  defaultValue: 'http://townpass.local/',
);

extension MyServiceIdExt on MyServiceItemId {
  MyServiceItem get item {
    return switch (this) {
      MyServiceItemId.dedicatedLine => MyServiceItem(
          title: '1999',
          description: '播打網路語音通話',
          icon: Assets.svg.icon1999phoneS.svg(),
          category: MyServiceCategory.cityService,
          destinationUrl: '${kDevServiceUrl}hotline-1999',
        ),
      MyServiceItemId.districtOffice => MyServiceItem(
          title: '申辦服務',
          description: '線上申辦市政府服務個項目（市民）',
          icon: Assets.svg.iconDistrictOffice.svg(),
          category: MyServiceCategory.cityService,
          destinationUrl: '${kDevServiceUrl}',
        ),
      MyServiceItemId.reportIssue => MyServiceItem(
          title: '有話要說',
          description: '陳情系統',
          icon: Assets.svg.iconTalk.svg(),
          category: MyServiceCategory.cityService,
          destinationUrl: '${kDevServiceUrl}citizen-report/',
        ),
      MyServiceItemId.reservation => MyServiceItem(
          title: '臨櫃叫號',
          description: '臨櫃服務查看叫號、預約',
          icon: Assets.svg.iconReservation.svg(),
          category: MyServiceCategory.cityService,
          destinationUrl: '${kDevServiceUrl}counter-calling/',
        ),
      MyServiceItemId.iVoting => MyServiceItem(
          title: '網路投票',
          description: '收集民意，促進民眾參與市政服務',
          icon: Assets.svg.iconVoteBallot.svg(),
          category: MyServiceCategory.cityService,
          destinationUrl: '${kDevServiceUrl}ivoting',
        ),
      MyServiceItemId.dashboard => MyServiceItem(
          title: '市政資訊儀表板',
          description: '提供臺北市生活的重要數據',
          icon: Assets.svg.iconDashboardPerson.svg(),
          category: MyServiceCategory.cityService,
          destinationUrl: '${kDevServiceUrl}dashboard/',
          forceWebViewTitle: '市政資訊儀表板',
        ),
      MyServiceItemId.survey => MyServiceItem(
          title: '意見調查',
          description: '了解民眾與台北市互動體驗調查',
          icon: Assets.svg.iconSurveyFeedback.svg(),
          category: MyServiceCategory.cityService,
          destinationUrl: '${kDevServiceUrl}survey',
        ),
      MyServiceItemId.police => MyServiceItem(
          title: '警政服務',
          description: '提供線上、語音報案',
          icon: Assets.svg.iconPolice.svg(),
          category: MyServiceCategory.cityService,
          destinationUrl: '${kDevServiceUrl}police-report',
        ),
      MyServiceItemId.neighborhood => MyServiceItem(
          title: '里辦服務',
          description: '提供居民更即時在地區里服務',
          icon: Assets.svg.iconCommunityService.svg(),
          category: MyServiceCategory.cityService,
          destinationUrl: '${kDevServiceUrl}neighborhood',
        ),
      MyServiceItemId.disasterReport => MyServiceItem(
          title: '災情通報',
          description: '立即通報發生災情地點',
          icon: Assets.svg.iconEarthquake.svg(),
          category: MyServiceCategory.cityService,
          destinationUrl: '${kDevServiceUrl}disaster-report',
        ),
      MyServiceItemId.vaccineAppointment => MyServiceItem(
          title: '疫苗預約',
          description: '預約Covid-19、流感疫苗施打',
          icon: Assets.svg.iconVaccineAppointment.svg(),
          category: MyServiceCategory.healthCare,
          destinationUrl: '${kDevServiceUrl}vaccine',
        ),
      MyServiceItemId.medicalAppointment => MyServiceItem(
          title: '聯醫掛號',
          description: '北市聯合醫院各院區線上掛號',
          icon: Assets.svg.iconRegistration.svg(),
          category: MyServiceCategory.healthCare,
          destinationUrl: '${kDevServiceUrl}hospital-registration',
        ),
      MyServiceItemId.cityRadio => MyServiceItem(
          title: '台北電台',
          description: '線上即時收聽-臺北廣播電台',
          icon: Assets.svg.iconTaipeiRadio.svg(),
          category: MyServiceCategory.cityLife,
          destinationUrl: '${kDevServiceUrl}city-radio',
        ),
      MyServiceItemId.familyCenter => MyServiceItem(
          title: '親子館',
          description: '線上預約各區親子館活動報名',
          icon: Assets.svg.iconFamilyCenter.svg(),
          category: MyServiceCategory.cityLife,
          destinationUrl: '${kDevServiceUrl}family-center',
        ),
      MyServiceItemId.greenMap => MyServiceItem(
          title: '簡單森呼吸',
          description: '提供綠化地圖資訊',
          icon: Assets.svg.iconForest.svg(),
          category: MyServiceCategory.cityLife,
          destinationUrl: '${kDevServiceUrl}green-map',
        ),
      MyServiceItemId.petFriendlyMap => MyServiceItem(
          title: '寵物安心遛',
          description: '提供寵物友善地圖資訊',
          icon: Assets.svg.iconPet.svg(),
          category: MyServiceCategory.cityLife,
          destinationUrl: '${kDevServiceUrl}pet-map',
        ),
      MyServiceItemId.waterMeter => MyServiceItem(
          title: '用水服務',
          description: '繳交水費、查詢或自報用水度數',
          icon: Assets.svg.iconWaterMeter.svg(),
          category: MyServiceCategory.cityLife,
          destinationUrl: '${kDevServiceUrl}water-service',
        ),
      MyServiceItemId.essentialGoods => MyServiceItem(
          title: '民生物資',
          description: '提供北市民生物資交易量與金額',
          icon: Assets.svg.iconEssentialGoods.svg(),
          category: MyServiceCategory.cityLife,
          destinationUrl: '${kDevServiceUrl}essential-goods',
        ),
      MyServiceItemId.library => MyServiceItem(
          title: '圖書借閱',
          description: '市立圖書館借閱服務',
          icon: Assets.svg.iconLibraryBorrow.svg(),
          category: MyServiceCategory.cityLife,
          destinationUrl: '${kDevServiceUrl}library-service/',
        ),
      MyServiceItemId.locationSearch => MyServiceItem(
          title: '找地點',
          description: '提供各區日常服務地圖查找',
          icon: Assets.svg.iconLocationSearch24.svg(),
          category: MyServiceCategory.explore,
          destinationUrl: '${kDevServiceUrl}surrounding-service/',
        ),
      MyServiceItemId.zoo => MyServiceItem(
          title: '愛遊動物園',
          description: '動物園區資訊導覽、線上地圖',
          icon: Assets.svg.iconZoo24.svg(),
          category: MyServiceCategory.explore,
          destinationUrl: '${kDevServiceUrl}zoo',
        ),
      MyServiceItemId.assistant => MyServiceItem(
          title: '小幫手',
          description: '說出你想做的事，幫你找到服務並陪你做完',
          icon: Assets.svg.iconTalk.svg(),
          category: MyServiceCategory.cityService,
          destinationUrl: kAssistantUrl.isNotEmpty ? kAssistantUrl : '${kDevServiceUrl}assistant/',
          forceWebViewTitle: '小幫手',
        ),
      MyServiceItemId.devService => MyServiceItem(
          title: '開發中服務',
          description: '本機微服務 ($kDevServiceUrl)',
          icon: Assets.svg.iconDistrictOffice.svg(),
          category: MyServiceCategory.other,
          // 與「申辦服務」(根目錄) 區隔，改指向用水服務
          destinationUrl: '${kDevServiceUrl}water-service',
        ),
    };
  }
}

class MyServiceItem {
  final Widget icon;
  final String title;
  final String description;
  final String destinationUrl;
  final MyServiceCategory category;
  final String? forceWebViewTitle;

  const MyServiceItem({
    required this.icon,
    required this.title,
    required this.description,
    required this.destinationUrl,
    required this.category,
    this.forceWebViewTitle,
  });
}

enum MyServiceCategory {
  cityService,
  healthCare,
  cityLife,
  explore,
  other,
  ;
}

extension MyServiceCategoryExt on MyServiceCategory {
  String get title {
    return switch (this) {
      MyServiceCategory.cityService => '市政服務',
      MyServiceCategory.healthCare => '防疫醫療',
      MyServiceCategory.cityLife => '城市生活',
      MyServiceCategory.explore => '探索臺北',
      MyServiceCategory.other => '其他服務',
    };
  }
}
