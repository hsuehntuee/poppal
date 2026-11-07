<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import FixedTitleSection from '@/components/molecules/FixedTitleSection.vue';
import BaseRadio from '@/components/atoms/BaseRadio.vue';
import BaseButton from '@/components/atoms/BaseButton.vue';
import { useSurveyStore } from '@/stores/survey';

const route = useRoute();
const router = useRouter();
const store = useSurveyStore();
const { surveyList } = storeToRefs(store);

const survey = computed(() => surveyList.value.find((item) => item.id === route.params.id));

/** 作答內容 questionId -> optionId */
const answers = reactive<Record<string, string>>({});

const triggerValidate = ref(false);
const isSubmitted = ref(false);

const unansweredCount = computed(
  () => survey.value?.questions.filter((question) => !answers[question.id]).length ?? 0
);

const onSubmitClick = () => {
  triggerValidate.value = true;
  if (survey.value && unansweredCount.value === 0) {
    store.finish(survey.value.id);
    isSubmitted.value = true;
  }
};

const onBackClick = () => {
  router.push({ name: 'survey' });
};
</script>

<template>
  <div class="survey-detail">
    <FixedTitleSection title="意見調查" />
    <template v-if="survey">
      <section class="px-5 py-5 border-b-8 border-grey-50">
        <h5 class="font-bold text-lg mb-1">{{ survey.title }}</h5>
        <p class="text-sm text-grey-500">
          共 {{ survey.questions.length }} 題・{{ survey.duration }}・截止 {{ survey.end_date }}
        </p>
      </section>

      <form v-if="!isSubmitted" class="px-5 py-5" @submit.prevent>
        <div
          v-for="(question, index) in survey.questions"
          :key="question.id"
          class="mb-6 pb-6 border-b border-grey-50 last:border-b-0"
        >
          <p class="font-semibold text-grey-700 mb-3">
            {{ index + 1 }}. {{ question.text }}
            <span
              v-if="triggerValidate && !answers[question.id]"
              class="text-warn-200 text-sm font-normal ml-1"
            >
              未作答
            </span>
          </p>
          <div class="flex flex-col gap-3 pl-1">
            <BaseRadio
              v-for="option in question.options"
              :key="option.id"
              v-model="answers[question.id]"
              :radio-name="question.id"
              :radio-id="option.id"
              :radio-text="option.name"
              :required="true"
              :trigger-validate="triggerValidate"
            />
          </div>
        </div>
        <p v-if="triggerValidate && unansweredCount" class="text-right text-warn-200 text-sm mb-2">
          尚有 {{ unansweredCount }} 題未作答
        </p>
        <BaseButton @click="onSubmitClick" class="w-full">送出</BaseButton>
      </form>

      <!-- 感謝 -->
      <div v-else class="px-5 py-5">
        <div class="bg-primary-50 rounded-xl p-5 text-center mb-5">
          <img src="@/assets/images/check-icon.svg" class="w-20 mx-auto mb-2" alt="" />
          <h5 class="text-xl font-bold text-primary-500 mb-1">感謝填寫</h5>
          <p class="text-sm text-grey-500">意見已送出，將作為市政改善參考</p>
        </div>
        <BaseButton :outline="true" @click="onBackClick" class="w-full">返回問卷列表</BaseButton>
      </div>
    </template>
    <div v-else class="px-5 py-16 text-center text-grey-400">
      <img
        src="@/assets/images/illustrations_no_data.svg"
        class="mx-auto mb-2"
        alt="illustrations_no_data"
      />
      <p>找不到此問卷</p>
    </div>
  </div>
</template>

<style lang="postcss" scoped>
.survey-detail {
  @apply pt-12 pb-4;
}
</style>
