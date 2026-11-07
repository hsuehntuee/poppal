import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:town_pass/page/portfolioAndAuth/portfolio_auth_view_controller.dart';
import 'package:town_pass/util/tp_app_bar.dart';
import 'package:town_pass/util/tp_button.dart';
import 'package:town_pass/util/tp_colors.dart';
import 'package:town_pass/util/tp_dialog.dart';
import 'package:town_pass/util/tp_line.dart';
import 'package:town_pass/util/tp_text.dart';

extension on ToggleTab {
  String get label {
    return switch (this) {
      ToggleTab.portfolio => '使用紀錄',
      ToggleTab.auth => '授權管理',
    };
  }

  Widget get contentWidget {
    return switch (this) {
      ToggleTab.portfolio => const _PortfolioListView(),
      ToggleTab.auth => const _AuthListView(),
    };
  }
}

class PortfolioAndAuthView extends StatelessWidget {
  const PortfolioAndAuthView({super.key});

  @override
  Widget build(BuildContext context) {
    final double toggleButtonWidth = (Get.width - 32) / 2;
    return GetBuilder(
        init: Get.put<PortfolioAuthViewController>(PortfolioAuthViewController()),
        builder: (controller) {
          return Scaffold(
            appBar: TPAppBar(
              title: '歷程與授權管理',
              bottom: PreferredSize(
                preferredSize: const Size.fromHeight(kToolbarHeight),
                child: ToggleButtons(
                  color: Colors.cyan,
                  borderColor: Colors.cyan,
                  fillColor: Colors.cyan,
                  selectedColor: TPColors.white,
                  isSelected: ToggleTab.values.map((tab) => tab.index == controller.selectIndex).toList(),
                  borderRadius: const BorderRadius.all(Radius.circular(8)),
                  constraints: BoxConstraints(minWidth: toggleButtonWidth, minHeight: kToolbarHeight / 1.5),
                  onPressed: (index) {
                    if (index != controller.selectIndex) {
                      controller.selectIndex = index;
                    }
                  },
                  children: ToggleTab.values.map<Widget>((tab) => TPText(tab.label)).toList(),
                ),
              ),
            ),
            body: IndexedStack(
              index: controller.selectIndex,
              children: ToggleTab.values.map<Widget>((tab) => tab.contentWidget).toList(),
            ),
          );
        });
  }
}

/// 使用紀錄列表：日期、服務名稱、動作
class _PortfolioListView extends GetView<PortfolioAuthViewController> {
  const _PortfolioListView();

  @override
  Widget build(BuildContext context) {
    final List<PortfolioRecord> records = controller.portfolioList;
    return ColoredBox(
      color: TPColors.white,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: records.length,
        separatorBuilder: (_, _) => const TPLine.horizontal(margin: EdgeInsets.symmetric(horizontal: 16)),
        itemBuilder: (_, index) {
          final PortfolioRecord record = records[index];
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      TPText(
                        record.serviceName,
                        style: TPTextStyles.h3SemiBold,
                        color: TPColors.grayscale800,
                      ),
                      const SizedBox(height: 4),
                      TPText(
                        record.date,
                        style: TPTextStyles.bodyRegular,
                        color: TPColors.grayscale500,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                TPText(
                  record.action,
                  style: TPTextStyles.bodyRegular,
                  color: TPColors.primary500,
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// 授權管理列表：服務名稱、授權範圍、授權日期，以及取消授權按鈕
class _AuthListView extends GetView<PortfolioAuthViewController> {
  const _AuthListView();

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: TPColors.white,
      child: Obx(() {
        final List<AuthRecord> records = controller.authList;
        if (records.isEmpty) {
          return const Center(
            child: TPText(
              '目前沒有已授權的服務',
              style: TPTextStyles.h3Regular,
              color: TPColors.grayscale500,
            ),
          );
        }
        return ListView.separated(
          padding: const EdgeInsets.symmetric(vertical: 8),
          itemCount: records.length,
          separatorBuilder: (_, _) => const TPLine.horizontal(margin: EdgeInsets.symmetric(horizontal: 16)),
          itemBuilder: (_, index) {
            final AuthRecord record = records[index];
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        TPText(
                          record.serviceName,
                          style: TPTextStyles.h3SemiBold,
                          color: TPColors.grayscale800,
                        ),
                        const SizedBox(height: 4),
                        TPText(
                          '授權範圍：${record.scope}',
                          style: TPTextStyles.bodyRegular,
                          color: TPColors.grayscale700,
                        ),
                        const SizedBox(height: 2),
                        TPText(
                          '授權日期：${record.date}',
                          style: TPTextStyles.bodyRegular,
                          color: TPColors.grayscale500,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  TPButton.secondary(
                    text: '取消授權',
                    onPressed: () async {
                      final bool confirmed = await TPDialog.showConfirm(
                        title: '取消授權？',
                        content: '將取消「${record.serviceName}」的資料授權。',
                        confirmText: '取消授權',
                        confirmColor: TPColors.red500,
                      );
                      if (confirmed) {
                        controller.revokeAuth(record);
                      }
                    },
                  ),
                ],
              ),
            );
          },
        );
      }),
    );
  }
}
