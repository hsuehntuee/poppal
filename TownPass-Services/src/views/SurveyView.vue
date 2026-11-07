<script setup lang="ts">
import { storeToRefs } from 'pinia';
import FixedTitleSection from '@/components/molecules/FixedTitleSection.vue';
import { useSurveyStore } from '@/stores/survey';

const store = useSurveyStore();
const { surveyList, finishedIds } = storeToRefs(store);
</script>

<template>
  <div class="survey">
    <FixedTitleSection title="意見調查" />
    <div class="px-5 py-5 bg-grey-50 min-h-screen">
      <h5 class="font-bold mb-3">進行中的問卷</h5>
      <div class="w-full flex flex-col">
        <RouterLink
          v-for="survey in surveyList"
          :key="survey.id"
          :to="{ name: 'survey-detail', params: { id: survey.id } }"
          class="link-wrapper"
        >
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="tag">{{ survey.questions.length }} 題・{{ survey.duration }}</span>
              <span v-if="finishedIds.includes(survey.id)" class="tag tag--done">已填寫</span>
            </div>
            <p class="font-bold">{{ survey.title }}</p>
            <p class="text-sm text-grey-500">截止 {{ survey.end_date }}</p>
          </div>
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<style lang="postcss" scoped>
.survey {
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
  @apply text-xs text-primary-500 bg-primary-50 rounded-full px-2 py-0.5;

  &--done {
    @apply text-secondary-700 bg-secondary-100;
  }
}
</style>
