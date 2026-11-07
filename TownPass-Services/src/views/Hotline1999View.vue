<script setup lang="ts">
import { computed, ref } from 'vue';
import FixedTitleSection from '@/components/molecules/FixedTitleSection.vue';
import BaseButton from '@/components/atoms/BaseButton.vue';
import { useConnectionMessage } from '@/composables/useConnectionMessage';
import faqJson from '../../public/mock/hotline-1999/faq.json';

const serviceList = ref<{ id: string; name: string; description: string }[]>(faqJson.services);
const faqList = ref<{ id: string; question: string; answer: string }[]>(faqJson.data);

const expandList = ref<string[]>([]);
const expandListSet = computed(() => new Set(expandList.value.map((id) => id)));

const onPanelExpandClick = (id: string) => {
  if (expandListSet.value.has(id)) {
    const index = expandList.value.findIndex((el) => el === id);
    expandList.value.splice(index, 1);
  } else {
    expandList.value.push(id);
  }
};

const onPhoneCallClick = () => {
  useConnectionMessage('phone_call', '1999');
};
</script>

<template>
  <div class="hotline-1999">
    <FixedTitleSection title="1999" />

    <!-- 撥打 -->
    <section class="px-5 py-6 text-center">
      <p class="text-grey-500 text-sm mb-1">臺北市民當家熱線</p>
      <h5 class="text-5xl font-bold text-primary-500 mb-2">1999</h5>
      <p class="text-sm text-grey-500 mb-5">全年無休・24 小時服務</p>
      <button class="call-button" @click="onPhoneCallClick">
        <img src="@/assets/images/icon_tel.svg" class="w-6 h-6 mr-2 brightness-0 invert" alt="" />
        撥打 1999
      </button>
      <p class="text-xs text-grey-500 mt-2">外縣市改撥 02-2720-8889</p>
    </section>

    <!-- 1999 能做什麼 -->
    <section class="px-5 py-5 border-t-8 border-grey-50">
      <h5 class="font-bold mb-3">1999 能做什麼</h5>
      <ul class="grid grid-cols-2 gap-3">
        <li
          v-for="service in serviceList"
          :key="service.id"
          class="bg-grey-50 rounded-xl px-4 py-3"
        >
          <p class="font-bold text-primary-500 mb-1">{{ service.name }}</p>
          <p class="text-sm text-grey-700">{{ service.description }}</p>
        </li>
      </ul>
    </section>

    <!-- 常見問題 -->
    <section class="px-5 py-5 border-t-8 border-grey-50">
      <h5 class="font-bold mb-3">常見問題</h5>
      <ul>
        <li
          v-for="item in faqList"
          :key="item.id"
          class="border-b border-grey-100"
          :class="{ 'bg-grey-50': expandListSet.has(item.id) }"
        >
          <button
            class="w-full flex justify-between items-start text-left py-4 px-2 font-bold text-grey-700"
            @click="onPanelExpandClick(item.id)"
          >
            <img src="@/assets/images/icon-faq.svg" class="mr-2" alt="" />
            <span class="flex-1 text-primary-500">{{ item.question }}</span>
            <img
              src="@/assets/images/down-icon.svg"
              class="transition-transform ml-2"
              :class="{ 'rotate-180': expandListSet.has(item.id) }"
              alt=""
            />
          </button>
          <div
            class="grid grid-rows-[0fr] transition-all"
            :class="{ 'grid-rows-[1fr]': expandListSet.has(item.id) }"
          >
            <div class="overflow-hidden">
              <p class="text-grey-700 px-10 pb-4">{{ item.answer }}</p>
            </div>
          </div>
        </li>
      </ul>
    </section>

    <!-- 線上陳情 -->
    <section class="px-5 py-5 border-t-8 border-grey-50">
      <p class="text-sm text-grey-500 mb-3">不方便通話？用文字反映問題，案件進度同步查詢。</p>
      <BaseButton :link="true" :route-info="{ path: '/citizen-report' }" :outline="true" class="block w-full">
        線上陳情
      </BaseButton>
    </section>
  </div>
</template>

<style lang="postcss" scoped>
.hotline-1999 {
  @apply pt-12 pb-4;
}

.call-button {
  @apply w-full rounded-full py-4 text-xl font-bold;
  @apply bg-primary-500 text-white;
  @apply flex items-center justify-center;
  @apply shadow-card;
}
</style>
