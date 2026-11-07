<script setup lang="ts">
import { storeToRefs } from 'pinia';
import FixedTitleSection from '@/components/molecules/FixedTitleSection.vue';
import { useIvotingStore } from '@/stores/ivoting';

const store = useIvotingStore();
const { pollList, votedMap } = storeToRefs(store);
</script>

<template>
  <div class="ivoting">
    <FixedTitleSection title="網路投票" />
    <div class="px-5 py-5 bg-grey-50 min-h-screen">
      <h5 class="font-bold mb-3">投票議題</h5>
      <div class="w-full flex flex-col">
        <RouterLink
          v-for="poll in pollList"
          :key="poll.id"
          :to="{ name: 'ivoting-detail', params: { id: poll.id } }"
          class="link-wrapper"
        >
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span
                class="tag"
                :class="poll.status === '投票中' ? 'tag--open' : 'tag--closed'"
              >
                {{ poll.status }}
              </span>
              <span v-if="votedMap[poll.id]" class="tag tag--voted">已投票</span>
            </div>
            <p class="font-bold">{{ poll.title }}</p>
            <p class="text-sm text-grey-500">截止 {{ poll.end_date }}・{{ poll.votes }} 人參與</p>
          </div>
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<style lang="postcss" scoped>
.ivoting {
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
  @apply text-xs rounded-full px-2 py-0.5;

  &--open {
    @apply text-primary-500 bg-primary-50;
  }

  &--closed {
    @apply text-grey-500 bg-grey-100;
  }

  &--voted {
    @apply text-secondary-700 bg-secondary-100;
  }
}
</style>
