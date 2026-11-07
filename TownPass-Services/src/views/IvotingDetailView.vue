<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import FixedTitleSection from '@/components/molecules/FixedTitleSection.vue';
import BaseRadio from '@/components/atoms/BaseRadio.vue';
import BaseButton from '@/components/atoms/BaseButton.vue';
import { useIvotingStore } from '@/stores/ivoting';

const route = useRoute();
const store = useIvotingStore();
const { pollList, votedMap } = storeToRefs(store);

const poll = computed(() => pollList.value.find((item) => item.id === route.params.id));

/** 已投的選項（已結束的議題直接顯示結果） */
const votedOption = computed(() => (poll.value ? votedMap.value[poll.value.id] : undefined));
const isShowResult = computed(() => !!votedOption.value || poll.value?.status === '已結束');

const selected = ref('');
const triggerValidate = ref(false);

const onVoteClick = () => {
  triggerValidate.value = true;
  if (poll.value && selected.value) {
    store.vote(poll.value.id, selected.value);
  }
};
</script>

<template>
  <div class="ivoting-detail">
    <FixedTitleSection title="網路投票" />
    <template v-if="poll">
      <section class="px-5 py-5 border-b-8 border-grey-50">
        <span class="tag" :class="poll.status === '投票中' ? 'tag--open' : 'tag--closed'">
          {{ poll.status }}
        </span>
        <h5 class="font-bold text-lg mt-2 mb-1">{{ poll.title }}</h5>
        <p class="text-sm text-grey-500">截止 {{ poll.end_date }}・{{ poll.votes }} 人參與</p>
      </section>

      <!-- 投票 -->
      <section class="px-5 py-5" v-if="!isShowResult">
        <p class="font-semibold text-grey-700 mb-3">{{ poll.question }}</p>
        <div class="flex flex-col gap-4 pl-1 mb-6">
          <BaseRadio
            v-for="option in poll.options"
            :key="option.id"
            v-model="selected"
            radio-name="vote"
            :radio-id="option.id"
            :radio-text="option.name"
            :required="true"
            :trigger-validate="triggerValidate"
          />
        </div>
        <p v-if="triggerValidate && !selected" class="text-right text-warn-200 text-sm mb-2">
          選擇一個選項
        </p>
        <BaseButton @click="onVoteClick" class="w-full">投票</BaseButton>
      </section>

      <!-- 結果 -->
      <section class="px-5 py-5" v-else>
        <div class="flex justify-between items-center mb-3">
          <p class="font-semibold text-grey-700">{{ poll.question }}</p>
          <span class="text-sm text-primary-500 font-bold">投票結果</span>
        </div>
        <ul>
          <li v-for="option in poll.options" :key="option.id" class="mb-4">
            <div class="flex justify-between text-sm mb-1">
              <span :class="{ 'font-bold text-primary-500': option.id === votedOption }">
                {{ option.name }}
                <span v-if="option.id === votedOption">（你的選擇）</span>
              </span>
              <span class="font-bold">{{ option.percent }}%</span>
            </div>
            <div class="w-full h-3 bg-grey-100 rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-500"
                :class="option.id === votedOption ? 'bg-primary-500' : 'bg-primary-200'"
                :style="{ width: `${option.percent}%` }"
              />
            </div>
          </li>
        </ul>
        <p v-if="votedOption" class="text-sm text-grey-500 text-center mt-4">已完成投票，感謝參與</p>
      </section>
    </template>
    <div v-else class="px-5 py-16 text-center text-grey-400">
      <img
        src="@/assets/images/illustrations_no_data.svg"
        class="mx-auto mb-2"
        alt="illustrations_no_data"
      />
      <p>找不到此議題</p>
    </div>
  </div>
</template>

<style lang="postcss" scoped>
.ivoting-detail {
  @apply pt-12 pb-4;
}

.tag {
  @apply text-xs rounded-full px-2 py-0.5;

  &--open {
    @apply text-primary-500 bg-primary-50;
  }

  &--closed {
    @apply text-grey-500 bg-grey-100;
  }
}
</style>
