import 'package:flutter/material.dart';
import 'package:fluttertoast/fluttertoast.dart';
import 'package:get/get.dart';
import 'package:town_pass/util/tp_colors.dart';
import 'package:town_pass/util/tp_dialog.dart';

enum FeedbackType {
  register,
  login,
  cardUsage,
  perk,
  other,
  ;
}

class FeedbackViewController extends GetxController {
  final LayerLink dropdownMenuLayerLink = LayerLink();
  final OverlayPortalController overlayPortalController = OverlayPortalController();

  final String contactPhoneNumber = '02-27208889';

  List<FeedbackType> get feedbackTypeList => [
        FeedbackType.register,
        FeedbackType.login,
        FeedbackType.cardUsage,
        FeedbackType.perk,
        FeedbackType.other,
      ];

  final RxBool isDropdownOpened = RxBool(false);

  final Rxn<FeedbackType> feedbackType = Rxn<FeedbackType>(null);

  TextEditingController controller = TextEditingController();

  bool _isSending = false;

  /// 送出意見：內容不可為空；模擬 1 秒送出，再顯示完成對話框並離開頁面
  Future<void> sendFeedback() async {
    if (_isSending) {
      return;
    }
    if (controller.text.trim().isEmpty) {
      Fluttertoast.showToast(msg: '請輸入意見內容');
      return;
    }
    FocusManager.instance.primaryFocus?.unfocus();

    _isSending = true;
    // 模擬送出中的載入畫面
    Get.dialog(
      const Center(
        child: CircularProgressIndicator(color: TPColors.primary500),
      ),
      barrierDismissible: false,
    );
    await Future.delayed(const Duration(seconds: 1));
    Get.back(); // 關閉載入畫面
    _isSending = false;

    // 按下確定：關閉對話框，接著離開意見回饋頁
    await TPDialog.showMessage(
      title: '已收到你的意見，謝謝！',
      buttonText: '確定',
    );
    Get.back();
  }

  void toggleDropdownMenu() {
    overlayPortalController.toggle();
    isDropdownOpened.value = !isDropdownOpened.value;
  }
}
