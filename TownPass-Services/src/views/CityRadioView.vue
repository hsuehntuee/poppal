<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import FixedTitleSection from '@/components/molecules/FixedTitleSection.vue';
import programsJson from '../../public/mock/city-radio/programs.json';

const nowPlaying = ref(programsJson.now_playing);
const frequency = ref(programsJson.frequency);
const streamUrl = ref(programsJson.stream_url);
const programList = ref<{ id: string; time: string; title: string; host: string }[]>(
  programsJson.data
);

const audioRef = ref<HTMLAudioElement | null>(null);
const isPlaying = ref(false);

const onToggleClick = () => {
  const audio = audioRef.value;
  if (isPlaying.value) {
    audio?.pause();
    isPlaying.value = false;
    return;
  }
  isPlaying.value = true;
  // 串流來源為示範位址，無法播放時維持 UI 狀態
  audio?.play().catch(() => {});
};

onBeforeUnmount(() => {
  audioRef.value?.pause();
});
</script>

<template>
  <div class="city-radio">
    <FixedTitleSection title="台北電台" />
    <audio ref="audioRef" :src="streamUrl" preload="none" />

    <!-- 正在播放 -->
    <section class="px-5 py-5">
      <div class="now-playing">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs bg-white/20 rounded-full px-2 py-0.5">{{ frequency }}</span>
          <span class="flex items-center text-xs">
            <span
              class="w-2 h-2 rounded-full mr-1"
              :class="isPlaying ? 'bg-warn-100 animate-pulse' : 'bg-white/60'"
            />
            {{ isPlaying ? '播放中' : '正在播出' }}
          </span>
        </div>
        <h5 class="text-2xl font-bold mb-1">{{ nowPlaying.title }}</h5>
        <p class="text-sm opacity-90">主持人 {{ nowPlaying.host }}・{{ nowPlaying.time }}</p>
        <p class="text-sm opacity-80 mb-4">{{ nowPlaying.description }}</p>
        <button class="play-button" @click="onToggleClick">
          {{ isPlaying ? '暫停' : '播放' }}
        </button>
      </div>
    </section>

    <!-- 節目表 -->
    <section class="px-5 pb-5">
      <h5 class="font-bold mb-3">節目表</h5>
      <ul>
        <li
          v-for="program in programList"
          :key="program.id"
          class="flex items-center py-3 border-b border-grey-50"
          :class="{ 'text-primary-500': program.title === nowPlaying.title }"
        >
          <span class="w-28 text-sm text-grey-500 shrink-0">{{ program.time }}</span>
          <div class="flex-1">
            <p class="font-bold">{{ program.title }}</p>
            <p class="text-sm text-grey-500">{{ program.host }}</p>
          </div>
          <span
            v-if="program.title === nowPlaying.title"
            class="text-xs text-primary-500 bg-primary-50 rounded-full px-2 py-0.5"
          >
            LIVE
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style lang="postcss" scoped>
.city-radio {
  @apply pt-12 pb-4;
}

.now-playing {
  @apply rounded-2xl p-5 text-white;
  @apply bg-gradient-to-br from-primary-500 to-primary-700;
}

.play-button {
  @apply w-full rounded-full py-3 font-bold;
  @apply bg-white text-primary-500;
}
</style>
