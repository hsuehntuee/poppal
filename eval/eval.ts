/**
 * 評測 CLI：對任何一個引擎跑測試集，輸出 JSON 和 markdown 列。
 *
 *   pnpm eval --engine llm --url http://127.0.0.1:8080 --name Qwen3-0.6B --where laptop-cpu
 *   pnpm eval --engine embed
 *   pnpm eval --engine tiny
 *   選項：--testset <path>（預設 testset.json；千句版用 assistant/public/data/testset_1k.json）--llm-lowercase（LLM 引擎也接受小寫代號 a-m；出貨版 tokenToCode 只收 A-Z）--foreign（含外語 20 句）--fuse（加上 registry 查表融合）--alpha 4 --go 0.75 --ask2 0.75 --ask3 0.75 --api openai --out results/x.json
 *
 * 結果放在 eval/results/<name>.json，之後 pnpm matrix 會彙整成測試矩陣。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Catalog, Decider } from '../assistant/src/core/types';
import { setCatalog, serviceOptions } from '../assistant/src/core/catalog';
import { LlmDecider } from '../assistant/src/engines/llm';
import { EmbedDecider } from '../assistant/src/engines/embed';
import { TinyDecider, type TinyModel } from '../assistant/src/engines/tiny';
import { ClsDecider } from '../assistant/src/engines/cls';
import { LlmDeciderCS } from './llm_cs';
import { runEval, markdownRow, MARKDOWN_HEADER, type TestItem } from '../assistant/src/eval/runner';
import type { Registry } from '../assistant/src/core/registry';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = parseArgs(process.argv.slice(2));

const engine = String(args.engine ?? 'embed');
const url = String(args.url ?? 'http://127.0.0.1:8080');
const name = String(args.name ?? engine);
const where = String(args.where ?? 'laptop');
const th = { go: num(args.go, 0.75), ask2: num(args.ask2, 0.75), ask3: num(args.ask3, 0.75) };

const catalog = JSON.parse(fs.readFileSync(path.join(root, 'assistant/public/data/catalog.json'), 'utf8')) as Catalog;
setCatalog(catalog);
const testsetFile = args.testset ? path.resolve(String(args.testset)) : path.join(root, 'assistant/public/data/testset.json');
let items = (JSON.parse(fs.readFileSync(testsetFile, 'utf8')).items as TestItem[]);
if (!args.foreign) items = items.filter((i) => i.tag !== 'foreign');
if (args.limit) items = items.slice(0, Number(args.limit));

const decider = await makeDecider(engine);
const sets = [{ options: serviceOptions(catalog), instruction: catalog.instruction, noneCode: catalog.none_code, setId: 'services' }];
const t0 = Date.now();
await decider.ready({ sets });
console.error(`[${engine}] ready in ${Date.now() - t0} ms`, decider.info());

const registry = args.fuse ? (JSON.parse(fs.readFileSync(path.join(root, 'assistant/public/data/registry.json'), 'utf8')) as Registry) : null;
const summary = await runEval(decider, catalog, items, {
  thresholds: th,
  registry,
  alpha: num(args.alpha, 4),
  onProgress: (i, r) => {
    const mark = r.firstHit ? '✓' : r.twoRoundHit ? '~' : '✗';
    process.stderr.write(`${String(i + 1).padStart(3)} ${mark} ${r.text.slice(0, 24).padEnd(24)} → ${r.expect} ${r.first.kind}${r.first.kind === 'GO' ? ' ' + r.first.code : r.first.kind === 'ASK' ? ' ' + r.first.codes.join('/') : ''}  ${r.top3.map(([c, p]) => c + ':' + p).join(' ')}  ${Math.round(r.ms)}ms\n`);
  }
});

const outFile = String(args.out ?? path.join(here, 'results', `${safe(name)}-${safe(where)}.json`));
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ name, where, ...summary }, null, 2));
console.log(MARKDOWN_HEADER);
console.log(markdownRow(name, where, summary));
console.error('wrote', outFile);

async function makeDecider(kind: string): Promise<Decider> {
  switch (kind) {
    case 'llm':
      return new (args['llm-lowercase'] ? LlmDeciderCS : LlmDecider)(url, { api: args.api === 'openai' ? 'openai' : 'native', topN: num(args.topn, 40) });
    case 'embed':
      return new EmbedDecider({
        localModelPath: path.join(root, 'assistant/public/models'),
        precomputed: readJson(path.join(root, 'assistant/public/models/embeddings.json')) ?? {},
        temperature: num(args.temp, 0.005),
        zSim: num(args.zsim, 0.8)
      });
    case 'cls':
      return new ClsDecider({ modelBase: path.join(root, 'assistant/public/models') + path.sep, temperature: num(args.temp, 0.7) });
    case 'tiny': {
      const models: Record<string, TinyModel> = {};
      for (const s of ['services', 'commands']) {
        const m = readJson(path.join(root, `assistant/public/models/tinycls.${s}.json`));
        if (m) models[s] = m;
      }
      if (!models.services) throw new Error('tinycls.services.json 不存在，先跑 tools/tinycls/train.py');
      return new TinyDecider({ models, temperature: args.temp ? num(args.temp, 1) : undefined });
    }
    default:
      throw new Error('unknown engine ' + kind);
  }
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    const v = argv[i + 1];
    if (v && !v.startsWith('--')) {
      out[k] = v;
      i++;
    } else out[k] = true;
  }
  return out;
}
function num(v: unknown, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== true ? n : d;
}
function safe(s: string) {
  return s.replace(/[^\w.-]+/g, '_');
}
function readJson(p: string): any {
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}
