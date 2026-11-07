import 'package:flutter/material.dart';
import 'package:town_pass/page/city_service/model/my_service_model.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:get/get.dart';
import 'package:town_pass/service/assistant_service.dart';
import 'package:town_pass/gen/assets.gen.dart';
import 'package:town_pass/util/tp_app_bar.dart';
import 'package:town_pass/util/tp_route.dart';
import 'package:town_pass/util/tp_web_view.dart';

class PerkView extends StatelessWidget {
  const PerkView({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: TPAppBar(
        showLogo: true,
        title: '優惠',
        leading: IconButton(
          icon: Semantics(
            label: '帳戶',
            child: Assets.svg.iconPerson.svg(),
          ),
          onPressed: () => Get.toNamed(TPRoute.account),
        ),
        actions: [
          IconButton(
            icon: Semantics(
              label: '票夾',
              child: Assets.svg.iconCouponTicket.svg(),
            ),
            onPressed: () async => await TPRoute.openUri(
              uri: '${kDevServiceUrl}ticket-wallet',
            ),
          ),
        ],
      ),
      body: TPInAppWebView(
        // 優惠分頁也要有小幫手泡泡與陪伴層
        initialUserScripts: Get.isRegistered<AssistantService>() ? Get.find<AssistantService>().userScripts : null,
        onWebViewCreated: (controller) {
          controller.loadUrl(
            urlRequest: URLRequest(url: WebUri('${kDevServiceUrl}coupon/')),
          );
        },
      ),
    );
  }
}
