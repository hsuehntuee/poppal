<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useCitizenReportStore } from '@/stores/citizenReport';
import FixedTitleSection from '@/components/molecules/FixedTitleSection.vue';
import BaseInput from '@/components/atoms/BaseInput.vue';

const store = useCitizenReportStore();

// 直接開啟 /citizen-report/search 或重新整理時，父頁尚未塞資料 → 自行載入
store.ensureLoaded();

const { concatData, citizenResult } = storeToRefs(store);

const isFirstSearch = ref(false);

const searchText = ref('');

const searchTarget = ref<{ id: string; name: string }[]>();

/** 最近案件：搜尋框為空時顯示，資料與案件查詢詳情頁相同（citizen_result mock） */
const recentCaseList = computed(() => citizenResult.value?.citizen ?? []);

/** 搜尋框為空（尚未搜尋、或清空後）時顯示最近案件 */
const isShowRecentCase = computed(() => !searchText.value);

const onSearchClick = () => {
  if (!isFirstSearch.value) {
    isFirstSearch.value = true;
  }

  if (!searchText.value) {
    return;
  }

  searchTarget.value = concatData.value.filter((item) => item.name.includes(searchText.value));
};
</script>

<template>
  <div class="pt-12 px-4">
    <FixedTitleSection title="有話要說" />
    <div class="flex mt-2">
      <BaseInput v-model="searchText" placeholder="您遇到哪些問題?" class="flex-grow" />
      <button class="search-button" @click="onSearchClick">
        <img src="@/assets/images/search-icon.svg" alt="搜尋" />
      </button>
    </div>
    <!-- 搜尋框為空：顯示最近案件，避免頁面看起來是空的 -->
    <section v-if="isShowRecentCase" class="mt-5">
      <div class="flex justify-between items-center mb-3">
        <p class="text-grey-700 font-semibold">最近案件</p>
        <span class="text-sm text-grey-500">共{{ recentCaseList.length }}筆</span>
      </div>
      <ul v-if="recentCaseList.length" class="flex flex-col gap-y-3">
        <li v-for="item in recentCaseList" :key="item.id">
          <RouterLink
            :to="{ name: 'citizen-report-search-detail', params: { id: item.id } }"
            class="flex items-center justify-between rounded-lg border border-grey-200 bg-white px-4 py-3"
          >
            <div class="flex flex-col gap-y-1">
              <span class="text-grey-700 font-semibold">{{ item.title }}</span>
              <span class="text-sm text-grey-500">{{ item.id }}</span>
              <p class="text-sm text-grey-500">
                <span>通報日期：</span>
                <span>{{ item.date }}</span>
              </p>
            </div>
            <div class="flex flex-col items-center justify-center">
              <img
                v-if="item.status === '處理完成'"
                src="@/assets/images/icon-status-checked.svg"
                class="size-6"
                width="24"
                height="24"
              />
              <img v-else src="@/assets/images/rule-icon.svg" class="size-6" width="24" height="24" />
              <span
                class="text-sm font-semibold"
                :class="{ 'text-primary-500': item.status === '處理完成' }"
              >
                {{ item.status }}
              </span>
            </div>
          </RouterLink>
        </li>
      </ul>
      <div v-else class="flex flex-col justify-center items-center pt-20">
        <img src="@/assets/images/img-info.svg" class="w-36" />
        <p class="text-primary-500 font-semibold text-2xl">無紀錄</p>
      </div>
    </section>
    <!-- 有輸入關鍵字：維持原本的通報項目搜尋 -->
    <template v-else>
      <div
        v-if="isFirstSearch && !searchTarget?.length"
        class="flex flex-col justify-center items-center pt-40"
      >
        <img src="@/assets/images/img-info.svg" class="w-36" />
        <p class="text-primary-500 font-semibold text-2xl">無符合搜尋結果</p>
        <p class="text-gray-400 text-sm mt-2 font-semibold">請試試其他關鍵字或篩選分類</p>
      </div>
      <ul v-else class="mt-5 flex flex-col gap-y-3">
        <li v-for="item in searchTarget" :key="item.id">
          <RouterLink :to="{ name: 'citizen-report-form', params: { id: item.id } }">
            {{ item.name }}
          </RouterLink>
        </li>
      </ul>
    </template>
  </div>
</template>
