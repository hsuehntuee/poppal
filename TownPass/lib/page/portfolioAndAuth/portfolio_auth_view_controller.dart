import 'package:get/get.dart';

enum ToggleTab {
  portfolio,
  auth,
  ;
}

/// 使用紀錄（示範資料）
class PortfolioRecord {
  final String date;
  final String serviceName;
  final String action;

  const PortfolioRecord({
    required this.date,
    required this.serviceName,
    required this.action,
  });
}

/// 授權管理（示範資料）
class AuthRecord {
  final String serviceName;
  final String scope;
  final String date;

  const AuthRecord({
    required this.serviceName,
    required this.scope,
    required this.date,
  });
}

class PortfolioAuthViewController extends GetxController {
  List<ToggleTab> get toggles => [
        ToggleTab.portfolio,
        ToggleTab.auth,
      ];

  int _selectIndex = 0;

  int get selectIndex => _selectIndex;

  set selectIndex(int index) {
    _selectIndex = index;
    update();
  }

  // 示範用的使用紀錄
  final List<PortfolioRecord> portfolioList = const [
    PortfolioRecord(date: '2026-11-05', serviceName: '繳水費', action: '已繳費 NT\$486'),
    PortfolioRecord(date: '2026-11-03', serviceName: '有話要說', action: '已受理'),
    PortfolioRecord(date: '2026-11-01', serviceName: '停車費', action: '已繳費 NT\$120'),
    PortfolioRecord(date: '2026-10-28', serviceName: '圖書借閱', action: '續借 2 本'),
    PortfolioRecord(date: '2026-10-25', serviceName: '疫苗預約', action: '預約成功'),
    PortfolioRecord(date: '2026-10-20', serviceName: '臨櫃叫號', action: '已取號 A128'),
    PortfolioRecord(date: '2026-10-15', serviceName: '聯醫掛號', action: '已完成看診'),
    PortfolioRecord(date: '2026-10-10', serviceName: '網路投票', action: '已投票'),
  ];

  // 示範用的授權列表；按下取消授權即移除
  final RxList<AuthRecord> authList = RxList<AuthRecord>([
    const AuthRecord(serviceName: '臺北市立圖書館', scope: '姓名、身分證字號', date: '2026-09-12'),
    const AuthRecord(serviceName: '臺北自來水事業處', scope: '姓名、用戶編號', date: '2026-08-30'),
    const AuthRecord(serviceName: '臺北市停車管理處', scope: '姓名、車牌號碼', date: '2026-08-02'),
    const AuthRecord(serviceName: '臺北市立聯合醫院', scope: '姓名、健保卡號', date: '2026-07-18'),
    const AuthRecord(serviceName: '臺北市民政局', scope: '姓名、戶籍地址', date: '2026-06-05'),
  ]);

  void revokeAuth(AuthRecord record) {
    authList.remove(record);
  }
}
