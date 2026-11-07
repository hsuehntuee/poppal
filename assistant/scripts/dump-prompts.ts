/**
 * 把 LLM 引擎用的固定前綴倒成 JSON，給 tools/llm/finetune_gemma.py 用，
 * 保證訓練和推論的 prompt 一字不差。
 *   pnpm -s tsx scripts/dump-prompts.ts  → tools/llm/prompts.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Catalog } from '../src/core/types';
import { setCatalog, serviceOptions, commandOptions } from '../src/core/catalog';
import { buildPrefix, buildQuery } from '../src/core/prompt';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'assistant/public/data/catalog.json'), 'utf8')) as Catalog;
setCatalog(catalog);

const out = {
  services: {
    prefix: buildPrefix(serviceOptions(catalog), catalog.instruction, catalog.none_code),
    none: catalog.none_code,
    labels: [...catalog.services.map((s) => s.code), catalog.none_code],
    query_example: buildQuery({ text: '我要繳水費', options: [], instruction: '', noneCode: 'Z' })
  },
  commands: {
    prefix: buildPrefix(commandOptions(catalog), catalog.commands.instruction, catalog.commands.none_code),
    none: catalog.commands.none_code,
    labels: catalog.commands.options.map((o) => o.code),
    query_example: buildQuery({ text: '下一步', options: [], instruction: '', noneCode: 'G', context: '輸入水號' })
  },
  query_format: '使用者：{text}{context}\n答案：',
  context_format: '（目前步驟：{context}）'
};
const dest = path.join(root, 'tools/llm/prompts.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.log('wrote', dest);
