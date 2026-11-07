<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import FixedTitleSection from '@/components/molecules/FixedTitleSection.vue';
import { useZooStore } from '@/stores/zoo';

const route = useRoute();
const store = useZooStore();
const { animalList, eventList } = storeToRefs(store);

const animal = computed(() => animalList.value.find((item) => item.id === route.params.id));

/** 該館區的今日活動 */
const relatedEvents = computed(() =>
  eventList.value.filter((event) => event.location === animal.value?.area)
);
</script>

<template>
  <div class="zoo-animal-detail">
    <FixedTitleSection :title="animal?.name ?? '動物介紹'" />
    <template v-if="animal">
      <section class="px-5 py-5 border-b-8 border-grey-50">
        <div class="bg-primary-50 rounded-xl h-40 flex items-center justify-center mb-4">
          <span class="text-4xl font-bold text-primary-500">{{ animal.name }}</span>
        </div>
        <ul class="bg-grey-50 rounded-xl px-4 py-2">
          <li class="flex justify-between py-2 border-b border-grey-100">
            <span class="text-grey-500">館區</span>
            <span class="font-bold">{{ animal.area }}</span>
          </li>
          <li class="flex justify-between py-2 border-b border-grey-100">
            <span class="text-grey-500">原產地</span>
            <span class="font-bold">{{ animal.origin }}</span>
          </li>
          <li class="flex justify-between py-2">
            <span class="text-grey-500">食性</span>
            <span class="font-bold">{{ animal.diet }}</span>
          </li>
        </ul>
      </section>
      <section class="px-5 py-5 border-b-8 border-grey-50">
        <h5 class="font-bold mb-2">介紹</h5>
        <p class="text-grey-700 leading-relaxed">{{ animal.description }}</p>
        <p class="text-sm text-primary-500 mt-2">觀察小提示：{{ animal.tips }}</p>
      </section>
      <section class="px-5 py-5" v-if="relatedEvents.length">
        <h5 class="font-bold mb-3">本館今日活動</h5>
        <ul>
          <li
            v-for="event in relatedEvents"
            :key="event.id"
            class="flex items-center py-3 border-b border-grey-50"
          >
            <span class="w-16 font-bold text-primary-500 shrink-0">{{ event.time }}</span>
            <span>{{ event.title }}</span>
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
      <p>找不到此動物</p>
    </div>
  </div>
</template>

<style lang="postcss" scoped>
.zoo-animal-detail {
  @apply pt-12 pb-4;
}
</style>
