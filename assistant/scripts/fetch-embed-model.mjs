#!/usr/bin/env node
/**
 * 把 multilingual-e5-small（transformers.js 用的 ONNX q8 版）下載到 public/models/，
 * 這樣手機在飛航模式也能載入向量保底引擎（spec 路線 A）。
 * 來源：https://huggingface.co/Xenova/multilingual-e5-small
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL = process.env.EMBED_MODEL ?? 'Xenova/multilingual-e5-small';
const FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'sentencepiece.bpe.model', 'onnx/model_quantized.onnx'];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dest = path.join(root, 'public', 'models', MODEL);

for (const f of FILES) {
  const url = `https://huggingface.co/${MODEL}/resolve/main/${f}`;
  const out = path.join(dest, f);
  if (fs.existsSync(out)) {
    console.log('skip', f);
    continue;
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  process.stdout.write(`get  ${f} … `);
  const res = await fetch(url);
  if (!res.ok) {
    console.log(res.status, '(optional, skipped)');
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(out, buf);
  console.log((buf.length / 1e6).toFixed(1) + ' MB');
}
console.log('done →', dest);
