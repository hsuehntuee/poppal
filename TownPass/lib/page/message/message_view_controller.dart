import 'dart:convert';

import 'package:town_pass/bean/message.dart';
import 'package:town_pass/gen/assets.gen.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';

class MessageViewController extends GetxController {
  List<MessageType> get tabTypeList => [
        MessageType.personal,
        MessageType.tcg,
        MessageType.system,
      ];

  final Rxn<MessageList> list = Rxn();

  bool _isLoading = true;

  bool get isLoading => _isLoading;

  List<MessageItem> messageList({required MessageType type}) {
    return list.value?.data.where((message) => message.type == type).toList() ?? [];
  }

  int unreadCount({required MessageType type}) {
    return list.value?.data
            .where(
              (message) => message.type == type && !message.hasRead,
            )
            .length ??
        0;
  }

  /// 將指定分類的訊息全部標為已讀
  void markAllRead({required MessageType type}) {
    final MessageList? current = list.value;
    if (current == null) {
      return;
    }
    for (final MessageItem message in current.data) {
      if (message.type == type) {
        message.hasRead = true;
      }
    }
    // hasRead 是物件內的欄位，需手動通知 Obx 重建
    list.refresh();
  }

  /// 清除所有訊息
  void clearAll() {
    list.value = const MessageList(data: []);
  }

  @override
  void onInit() {
    super.onInit();
    fetch();
  }

  Future<void> fetch() async {
    _isLoading = true;
    update();

    final String messageList = await rootBundle.loadString(Assets.mockData.message);
    list.value = MessageList.fromJson(jsonDecode(messageList));

    _isLoading = false;
    update();
  }
}
