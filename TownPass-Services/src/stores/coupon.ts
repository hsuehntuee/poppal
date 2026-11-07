import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import type { Ticket, Coupon, HotSpot } from '@/views/CouponView.vue';
import type { Wallet } from '@/views/TicketWallet.vue';
import couponDataJson from '../../public/mock/coupon_data.json';
import ticketWalletJson from '../../public/mock/ticket_wallet.json';

export const useCouponStore = defineStore('coupon', () => {
  const ticketList = ref<Ticket[] | []>();
  const couponList = ref<Coupon[] | []>();
  const hotSpotList = ref<HotSpot[] | []>();
  const walletData = ref<Wallet>();

  const ticketListMap = computed(() => new Map(ticketList.value?.map((item) => [item.id, item])));
  const couponListMap = computed(() => new Map(couponList.value?.map((item) => [item.id, item])));
  const hotSpotListMap = computed(() => new Map(hotSpotList.value?.map((item) => [item.id, item])));

  /**
   * 確保資料已載入（子頁面直接開啟、重新整理時使用）
   * 父頁 CouponView / TicketWallet 已塞資料時不會重複載入
   */
  const ensureLoaded = async () => {
    if (!ticketList.value) {
      ticketList.value = couponDataJson.data.ticket_list;
    }
    if (!couponList.value) {
      couponList.value = couponDataJson.data.coupon_list;
    }
    if (!hotSpotList.value) {
      hotSpotList.value = couponDataJson.data.hot_spot_list;
    }
    if (!walletData.value) {
      walletData.value = ticketWalletJson.data;
    }
  };

  return {
    ticketList,
    couponList,
    hotSpotList,
    walletData,
    ticketListMap,
    couponListMap,
    hotSpotListMap,
    ensureLoaded
  };
});
