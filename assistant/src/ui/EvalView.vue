<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { Catalog, Decider } from '../core/types';
import { loadCatalog, serviceOptions, ASSISTANT_BASE } from '../core/catalog';
import { settings, type EngineKind } from '../core/settings';
import { createDecider } from '../engines';
import { runEval, markdownRow, MARKDOWN_HEADER, type TestItem, type EvalSummary, type ItemResult } from '../eval/runner';
import { loadRegistry } from '../core/registry';

const engineKind = ref<EngineKind>(settings.engine === 'auto' ? 'embed' : settings.engine);
const llmUrl = ref(settings.llmUrl);
const go = ref(0.75);
const ask2 = ref(0.75);
const ask3 = ref(0.75);
const includeForeign = ref(false);
const useFuse = ref(true);
const status = ref('');
const running = ref(false);
const progress = ref(0);
const total = ref(0);
const summary = ref<EvalSummary | null>(null);
const items = ref<ItemResult[]>([]);
const onlyFail = ref(true);
let catalog: Catalog | null = null;
let testset: TestItem[] = [];

onMounted(async () => {
  catalog = await loadCatalog();
  const res = await fetch(`${ASSISTANT_BASE}data/testset.json`);
  testset = (await res.json()).items;
  total.value = testset.length;
});

async function run() {
  if (!catalog) return;
  running.value = true;
  summary.value = null;
  items.value = [];
  progress.value = 0;
  let decider: Decider;
  try {
    decider = await createDecider({
      kind: engineKind.value,
      llmUrl: llmUrl.value,
      sets: [{ options: serviceOptions(catalog), instruction: catalog.instruction, noneCode: catalog.none_code, setId: 'services' }],
      onStatus: (m) => (status.value = m)
    });
  } catch (e) {
    status.value = '引擎載入失敗：' + (e as Error).message;
    running.value = false;
    return;
  }
  const set = includeForeign.value ? testset : testset.filter((i) => i.tag !== 'foreign');
  total.value = set.length;
  summary.value = await runEval(decider, catalog, set, {
    thresholds: { go: go.value, ask2: ask2.value, ask3: ask3.value },
    registry: useFuse.value ? await loadRegistry() : null,
    onProgress: (i, r) => {
      progress.value = i + 1;
      items.value.push(r);
    }
  });
  running.value = false;
  status.value = '';
}

function download() {
  if (!summary.value) return;
  const blob = new Blob([JSON.stringify(summary.value, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `eval-${summary.value.engine}-${Date.now()}.json`;
  a.click();
}

const pct = (v: number) => (v * 100).toFixed(1) + '%';
</script>

<template>
  <div style="padding: 1em" class="col">
    <h2>評測 /eval <a href="#/" style="font-size: 0.6em">← 回小幫手</a></h2>
    <div class="card col">
      <label>引擎
        <select v-model="engineKind">
          <option value="llm">llm</option>
          <option value="cls">cls</option>
          <option value="tiny">tiny</option>
          <option value="embed">embed</option>
        </select>
      </label>
      <label>LLM URL <input v-model="llmUrl" style="width: 100%" /></label>
      <div class="row">
        <label>GO ≥ <input v-model.number="go" type="number" step="0.05" min="0" max="1" style="width: 5em" /></label>
        <label>ASK2 ≥ <input v-model.number="ask2" type="number" step="0.05" min="0" max="1" style="width: 5em" /></label>
        <label>ASK3 ≥ <input v-model.number="ask3" type="number" step="0.05" min="0" max="1" style="width: 5em" /></label>
        <label><input v-model="includeForeign" type="checkbox" /> 含外語 20 句</label>
        <label><input v-model="useFuse" type="checkbox" /> registry 查表融合</label>
      </div>
      <button class="btn" :disabled="running" @click="run">{{ running ? `跑測試集… ${progress}/${total}` : `跑測試集（${total} 句）` }}</button>
      <div class="muted">{{ status }}</div>
    </div>

    <div v-if="summary" class="card col">
      <table style="border-collapse: collapse; width: 100%; font-size: 0.9em">
        <tr><td>引擎</td><td>{{ summary.engine }} <span class="muted">{{ JSON.stringify(summary.info) }}</span></td></tr>
        <tr><td>首輪命中率</td><td>{{ pct(summary.first_hit) }}</td></tr>
        <tr><td>2 輪內命中率</td><td>{{ pct(summary.two_round_hit) }}</td></tr>
        <tr><td>不在範圍內的辨識率</td><td>{{ pct(summary.oos_detect) }}</td></tr>
        <tr><td>平均追問次數</td><td>{{ summary.avg_asks.toFixed(2) }}</td></tr>
        <tr><td>延遲 p50 / p95</td><td>{{ Math.round(summary.p50_ms) }} / {{ Math.round(summary.p95_ms) }} ms</td></tr>
        <tr v-for="(v, k) in summary.by_tag" :key="k"><td>{{ k }}</td><td>n={{ v.n }} 首輪 {{ pct(v.first_hit) }} 兩輪 {{ pct(v.two_round_hit) }}</td></tr>
      </table>
      <pre style="white-space: pre-wrap; font-size: 0.75em">{{ MARKDOWN_HEADER + '\n' + markdownRow(summary.engine, 'browser', summary) }}</pre>
      <button class="btn secondary" @click="download">下載 JSON</button>
    </div>

    <div v-if="items.length" class="card">
      <label><input v-model="onlyFail" type="checkbox" /> 只看沒命中的</label>
      <div v-for="r in items.filter((x) => !onlyFail || !x.twoRoundHit)" :key="r.text" style="border-top: 1px solid #eee; padding: 0.4em 0; font-size: 0.85em">
        <span :style="{ color: r.firstHit ? 'green' : r.twoRoundHit ? 'orange' : 'red' }">●</span>
        {{ r.text }} <span class="muted">→ 期望 {{ r.expect }}，得到 {{ r.first.kind }} {{ r.first.kind === 'GO' ? r.first.code : r.first.kind === 'ASK' ? r.first.codes.join('/') : '' }}
        · {{ r.top3.map(([c, p]) => `${c}:${p}`).join(' ') }} · {{ Math.round(r.ms) }}ms</span>
      </div>
    </div>
  </div>
</template>
