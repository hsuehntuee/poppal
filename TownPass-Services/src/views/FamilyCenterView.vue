<script setup lang="ts">
import { storeToRefs } from 'pinia';
import FixedTitleSection from '@/components/molecules/FixedTitleSection.vue';
import { useFamilyCenterStore } from '@/stores/familyCenter';

const store = useFamilyCenterStore();
const { centerList } = storeToRefs(store);
</script>

<template>
  <div class="family-center">
    <FixedTitleSection title="親子館" />
    <div class="px-5 py-5 bg-grey-50 min-h-screen">
      <h5 class="font-bold mb-3">親子館據點</h5>
      <div class="w-full flex flex-col">
        <RouterLink
          v-for="center in centerList"
          :key="center.id"
          :to="{ name: 'family-center-detail', params: { id: center.id } }"
          class="link-wrapper"
        >
          <div class="flex-1">
            <div class="flex items-center mb-1">
              <span class="tag">{{ center.district }}</span>
              <span class="font-bold">{{ center.name }}</span>
            </div>
            <p class="text-sm text-grey-500">{{ center.address }}</p>
            <p class="text-sm text-primary-500">活動 {{ center.activities.length }} 場</p>
          </div>
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<style lang="postcss" scoped>
.family-center {
  @apply pt-12;
}

.link-wrapper {
  @apply relative p-5 pr-9 mb-3 bg-white rounded-md shadow-md;
  @apply flex items-center;
  @apply after:content-[''] after:w-6 after:h-6;
  @apply after:bg-[url('@/assets/images/down-icon.svg')] after:bg-cover after:bg-no-repeat after:-rotate-90;
  @apply after:block after:absolute after:top-1/2 after:-translate-y-1/2 after:right-2;
}

.tag {
  @apply text-xs text-primary-500 bg-primary-50 rounded-full px-2 py-0.5 mr-2;
}
</style>
