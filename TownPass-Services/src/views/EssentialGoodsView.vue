<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import FixedTitleSection from '@/components/molecules/FixedTitleSection.vue';
import BaseSelect from '@/components/atoms/BaseSelect.vue';
import pricesJson from '../../public/mock/essential-goods/prices.json';

interface GoodsItem {
  id: string;
  category: string;
  name: string;
  unit: string;
  today: number;
  yesterday: number;
  trend: number[];
}

const categoryOptions = pricesJson.categories.map((item) => ({
  label: item.name,
  value: item.id
}));

const updateDate = ref(pricesJson.update_date);
const goodsList = ref<GoodsItem[]>(pricesJson.data);

const category = ref('vegetable');
/** 趨勢圖顯示的品項 */
const activeItemId = ref('');

const filteredList = computed(() =>
  goodsList.value.filter((item) => item.category === category.value)
);

const activeItem = computed(
  () => filteredList.value.find((item) => item.id === activeItemId.value) ?? filteredList.value[0]
);

watch(category, () => {
  activeItemId.value = '';
});

const diff = (item: GoodsItem) => item.today - item.yesterday;

const diffText = (item: GoodsItem) => {
  const value = diff(item);
  if (value === 0) return '持平';
  return `${value > 0 ? '▲' : '▼'} ${Math.abs(value)}`;
};

const diffClass = (item: GoodsItem) => {
  const value = diff(item);
  if (value > 0) return 'text-warn-200';
  if (value < 0) return 'text-success';
  return 'text-grey-500';
};

/** 近7日趨勢長條高度（%） */
const barHeight = (value: number, trend: number[]) => {
  const max = Math.max(...trend);
  const min = Math.min(...trend);
  if (max === min) return 60;
  return 30 + ((value - min) / (max - min)) * 70;
};

const trendLabels = ['6日前', '5日前', '4日前', '3日前', '前日', '昨日', '今日'];
</script>

<template>
  <div class="essential-goods">
    <FixedTitleSection title="民生物資" />
    <div class="px-5 py-5 bg-grey-50">
      <label for="category" class="block font-bold mb-3">分類</label>
      <BaseSelect
        v-model="category"
        select-id="category"
        :options="categoryOptions"
        :custom-class="'bg-white border border-grey-600'"
        default-selected="選擇分類"
        class="w-full"
      />
      <p class="text-xs text-grey-500 mt-2">資料日期 {{ updateDate }}・臺北市批發市場均價</p>
    </div>

    <!-- 價格表 -->
    <section class="px-5 py-5">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-grey-500 border-b border-grey-200">
            <th class="text-left font-normal py-2">品名</th>
            <th class="text-right font-normal py-2">今日均價</th>
            <th class="text-right font-normal py-2">昨日</th>
            <th class="text-right font-normal py-2">漲跌</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in filteredList"
            :key="item.id"
            class="border-b border-grey-50 cursor-pointer"
            :class="{ 'bg-primary-50': activeItem?.id === item.id }"
            @click="activeItemId = item.id"
          >
            <td class="py-3">
              <p class="font-bold">{{ item.name }}</p>
              <p class="text-xs text-grey-500">{{ item.unit }}</p>
            </td>
            <td class="py-3 text-right font-bold">{{ item.today }}</td>
            <td class="py-3 text-right text-grey-500">{{ item.yesterday }}</td>
            <td class="py-3 text-right font-bold" :class="diffClass(item)">
              {{ diffText(item) }}
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 近7日趨勢 -->
    <section class="px-5 pb-5" v-if="activeItem">
      <div class="bg-grey-50 rounded-xl px-4 py-4">
        <div class="flex justify-between items-center mb-4">
          <h5 class="font-bold">近7日趨勢</h5>
          <span class="text-sm text-primary-500 font-bold">{{ activeItem.name }}</span>
        </div>
        <div class="flex items-end justify-between gap-2 h-32">
          <div
            v-for="(value, index) in activeItem.trend"
            :key="index"
            class="flex-1 flex flex-col items-center justify-end h-full"
          >
            <span class="text-xs text-grey-700 mb-1">{{ value }}</span>
            <div
              class="w-full rounded-t-md transition-all duration-500"
              :class="index === activeItem.trend.length - 1 ? 'bg-primary-500' : 'bg-primary-200'"
              :style="{ height: `${barHeight(value, activeItem.trend)}%` }"
            />
          </div>
        </div>
        <div class="flex justify-between gap-2 mt-2">
          <span
            v-for="label in trendLabels"
            :key="label"
            class="flex-1 text-center text-[10px] text-grey-500"
          >
            {{ label }}
          </span>
        </div>
      </div>
    </section>
  </div>
</template>

<style lang="postcss" scoped>
.essential-goods {
  @apply pt-12 pb-4;
}
</style>
