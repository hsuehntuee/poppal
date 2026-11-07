#!/usr/bin/env node
/**
 * 預先算好 catalog 每個服務 examples 的向量 → public/models/embeddings.json
 * 手機啟動時就只需要算使用者那一句。
 * 需要先 pnpm fetch-embed-model（或讓它從 HF Hub 抓）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline, env } from '@huggingface/transformers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODEL = process.env.EMBED_MODEL ?? 'Xenova/multilingual-e5-small';
env.allowLocalModels = true;
env.localModelPath = path.join(root, 'public', 'models');
env.allowRemoteModels = true;

const catalog = JSON.parse(fs.readFileSync(path.join(root, 'public/data/catalog.json'), 'utf8'));
const extractor = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
const embed = async (texts) => (await extractor(texts.map((t) => 'query: ' + t), { pooling: 'mean', normalize: true })).tolist();

const out = {};
const sets = {
  services: [
    ...catalog.services.map((s) => ({ code: s.code, texts: [s.title.zh, ...s.examples, ...s.keywords] })),
    { code: catalog.none_code, texts: ['都不是', '今天天氣真好', '你是誰', '唱首歌給我聽', 'hello'] }
  ],
  commands: catalog.commands.options.map((o) => ({ code: o.code, texts: [o.label, ...(o.examples ?? [])] }))
};
for (const [setId, items] of Object.entries(sets)) {
  const rec = { model: MODEL, dim: 0, items: {} };
  for (const it of items) {
    rec.items[it.code] = await embed(it.texts);
    rec.dim = rec.items[it.code][0].length;
  }
  out[setId] = rec;
  console.log(setId, items.length, 'options, dim', rec.dim);
}
const dest = path.join(root, 'public/models/embeddings.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out));
console.log('wrote', dest, (fs.statSync(dest).size / 1e6).toFixed(2), 'MB');
