/** 把 eval/results/*.json 彙整成 spec 第 7 節的測試矩陣（markdown），寫到 eval/MATRIX.md */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { markdownRow, MARKDOWN_HEADER } from '../assistant/src/eval/runner';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, 'results');
const rows: string[] = [];
if (fs.existsSync(dir)) {
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const s = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    rows.push(markdownRow(s.name ?? f, s.where ?? '', s, s.mem ?? ''));
  }
}
const md = `# 測試矩陣\n\n產生時間：${new Date().toISOString()}\n\n${MARKDOWN_HEADER}\n${rows.join('\n')}\n`;
fs.writeFileSync(path.join(here, 'MATRIX.md'), md);
console.log(md);
