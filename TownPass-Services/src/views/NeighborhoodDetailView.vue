<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import FixedTitleSection from '@/components/molecules/FixedTitleSection.vue';
import BaseButton from '@/components/atoms/BaseButton.vue';
import { useConnectionMessage } from '@/composables/useConnectionMessage';
import { useNeighborhoodStore } from '@/stores/neighborhood';

const route = useRoute();
const store = useNeighborhoodStore();
const { villageList } = storeToRefs(store);

const village = computed(() => villageList.value.find((item) => item.id === route.params.id));

const onPhoneCallClick = () => {
  if (village.value) {
    useConnectionMessage('phone_call', village.value.tel);
  }
};
</script>

<template>
  <div class="neighborhood-detail">
    <FixedTitleSection :title="village ? `${village.district}${village.name}` : '里辦服務'" />
    <template v-if="village">
      <!-- 里辦公處資訊 -->
      <section class="px-5 py-5 border-b-8 border-grey-50">
        <h5 class="font-bold text-lg mb-3">{{ village.name }}辦公處</h5>
        <ul class="bg-grey-50 rounded-xl px-4 py-2 mb-4">
          <li class="flex justify-between py-2 border-b border-grey-100">
            <span class="text-grey-500">里長</span>
            <span class="font-bold">{{ village.chief }}</span>
          </li>
          <li class="flex justify-between py-2 border-b border-grey-100">
            <span class="text-grey-500">電話</span>
            <span class="font-bold">{{ village.tel }}</span>
          </li>
          <li class="flex justify-between py-2 border-b border-grey-100">
            <span class="text-grey-500 shrink-0">辦公處地址</span>
            <span class="font-bold text-right">{{ village.address }}</span>
          </li>
          <li class="flex justify-between py-2">
            <span class="text-grey-500">服務時間</span>
            <span class="font-bold">{{ village.office_hours }}</span>
          </li>
        </ul>
        <BaseButton @click="onPhoneCallClick" class="w-full">撥打電話</BaseButton>
      </section>

      <!-- 公告 -->
      <section class="px-5 py-5 border-b-8 border-grey-50">
        <h5 class="font-bold mb-3">公告</h5>
        <ul>
          <li
            v-for="item in village.announcements"
            :key="item.id"
            class="flex items-start py-3 border-b border-grey-50"
          >
            <img src="@/assets/images/info-icon-primary.svg" class="w-5 mr-2 mt-0.5" alt="" />
            <div>
              <p>{{ item.title }}</p>
              <p class="text-sm text-grey-500">{{ item.date }}</p>
            </div>
          </li>
        </ul>
      </section>

      <!-- 活動 -->
      <section class="px-5 py-5">
        <h5 class="font-bold mb-3">活動</h5>
        <ul>
          <li
            v-for="item in village.events"
            :key="item.id"
            class="bg-grey-50 rounded-xl px-4 py-3 mb-3"
          >
            <p class="font-bold">{{ item.title }}</p>
            <p class="text-sm text-grey-500">{{ item.date }} {{ item.time }}</p>
          </li>
        </ul>
      </section>
    </template>
    <div v-else class="px-5 py-16 text-center text-grey-400">
      <img
        src="@/assets/images/illustrations_no_data.svg"
        class="mx-auto mb-2"
        alt="illustrations_no_data"
      />
      <p>找不到此里</p>
    </div>
  </div>
</template>

<style lang="postcss" scoped>
.neighborhood-detail {
  @apply pt-12 pb-4;
}
</style>
