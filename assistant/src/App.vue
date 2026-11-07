<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AssistantHome from './ui/AssistantHome.vue';
import EvalView from './ui/EvalView.vue';
import DebugView from './ui/DebugView.vue';
import { hookConsole } from './core/log';
hookConsole('app');

// 沒有 router：用 hash 切換 #/ 與 #/eval
const view = ref<'home' | 'eval' | 'debug'>('home');
const sync = () => { view.value = location.hash.startsWith('#/eval') ? 'eval' : location.hash.startsWith('#/debug') ? 'debug' : 'home'; };
onMounted(() => { sync(); window.addEventListener('hashchange', sync); });
</script>

<template>
  <EvalView v-if="view === 'eval'" />
  <DebugView v-else-if="view === 'debug'" />
  <AssistantHome v-else />
</template>
