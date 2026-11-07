<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import FixedTitleSection from '@/components/molecules/FixedTitleSection.vue';
import BaseSelect from '@/components/atoms/BaseSelect.vue';
import { useNeighborhoodStore } from '@/stores/neighborhood';

const store = useNeighborhoodStore();
const { districtOptions, villageList, selectedDistrict } = storeToRefs(store);

const filteredVillageList = computed(() =>
  villageList.value.filter((item) => item.district === selectedDistrict.value)
);
</script>

<template>
  <div class="neighborhood">
    <FixedTitleSection title="里辦服務" />
    <div class="px-5 py-5 bg-grey-50">
      <label for="district" class="block font-bold mb-3">選擇行政區</label>
      <BaseSelect
        v-model="selectedDistrict"
        select-id="district"
        :options="districtOptions"
        :custom-class="'bg-white border border-grey-600'"
        default-selected="選擇行政區"
        class="w-full"
      />
    </div>
    <div class="px-5 py-5" v-if="selectedDistrict">
      <h5 class="font-bold mb-3">{{ selectedDistrict }}各里</h5>
      <div class="w-full flex flex-col">
        <RouterLink
          v-for="village in filteredVillageList"
          :key="village.id"
          :to="{ name: 'neighborhood-detail', params: { id: village.id } }"
          class="link-wrapper"
        >
          <div class="flex-1">
            <p class="font-bold">{{ village.name }}</p>
            <p class="text-sm text-grey-500">里長 {{ village.chief }}・{{ village.tel }}</p>
          </div>
        </RouterLink>
      </div>
    </div>
    <div class="px-5 py-16" v-else>
      <div class="flex items-center justify-center">
        <div class="text-center text-grey-400">
          <img
            src="@/assets/images/illustrations_no_data.svg"
            class="mx-auto mb-2"
            alt="illustrations_no_data"
          />
          <p>選擇行政區後顯示各里</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="postcss" scoped>
.neighborhood {
  @apply pt-12;
}

.link-wrapper {
  @apply relative py-4 pr-7 border-b border-grey-50;
  @apply flex items-center;
  @apply after:content-[''] after:w-6 after:h-6;
  @apply after:bg-[url('@/assets/images/down-icon.svg')] after:bg-cover after:bg-no-repeat after:-rotate-90;
  @apply after:block after:absolute after:top-1/2 after:-translate-y-1/2 after:right-0;
}
</style>
