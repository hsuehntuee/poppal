/**
 * eval/results_1k/*.json -> eval/MATRIX_1K.md
 *   pnpm tsx ../eval/report_1k.ts            (from assistant/)
 * Sections: main table, per-style first-round hit, worst tools + top confusions for the main engines,
 * registry entity / parameter extraction accuracy.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { markdownRow, MARKDOWN_HEADER } from '../assistant/src/eval/runner';
import { lookup, extractParams, toolByCode, type Registry } from '../assistant/src/core/registry';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dir = path.join(here, 'results_1k');
const ts = JSON.parse(fs.readFileSync(path.join(root, 'assistant/public/data/testset_1k.json'), 'utf8')).items as any[];
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'assistant/public/data/catalog.json'), 'utf8'));
const registry = JSON.parse(fs.readFileSync(path.join(root, 'assistant/public/data/registry.json'), 'utf8')) as Registry;
const meta = new Map<string, any>(ts.map((i) => [i.text, i]));
const title: Record<string, string> = { Z: 'NONE' };
for (const s of catalog.services) title[s.code] = `${s.code} ${s.id}`;
const p = (v: number) => (v * 100).toFixed(1) + '%';

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const runs = files.map((f) => ({ f, s: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));
const phase = (n: string) => (n.match(/-(before|after|r\d+)$/)?.[1] ?? 'x');

let md = `# MATRIX_1K: testset_1k.json (${ts.length} items)\n\nGenerated ${new Date().toISOString()}\n\n`;
const counts = (k: (i: any) => string) => {
  const c: Record<string, number> = {};
  for (const i of ts) c[k(i)] = (c[k(i)] ?? 0) + 1;
  return Object.entries(c).sort().map(([a, b]) => `${a}=${b}`).join(', ');
};
md += `Composition: tag ${counts((i) => i.tag)}; lang ${counts((i) => i.lang ?? 'zh')}; style ${counts((i) => i.style)}\n\n`;
md += `In-scope hit rates are over non-NONE items (including foreign); "oos" is the NONE detection rate. \`fuse\` = registry lookup fusion.\n\n`;
md += `## Main table\n\n${MARKDOWN_HEADER}\n`;
for (const { s } of runs) md += markdownRow(s.name, s.where, s) + '\n';

md += `\n## First-round hit by style\n\n`;
const styles = [...new Set(ts.map((i) => i.style))].filter((x) => x !== 'oos');
md += `| run | ${styles.join(' | ')} | NONE items |\n|---|${styles.map(() => '---').join('|')}|---|\n`;
for (const { s } of runs) {
  const cell = (st: string) => {
    const a = s.items.filter((r: any) => meta.get(r.text)?.style === st && r.expect !== 'Z');
    return a.length ? p(a.filter((r: any) => r.firstHit).length / a.length) : '-';
  };
  const z = s.items.filter((r: any) => r.expect === 'Z');
  md += `| ${s.name} | ${styles.map(cell).join(' | ')} | ${p(z.filter((r: any) => r.firstHit).length / Math.max(1, z.length))} |\n`;
}

md += `\n## Worst tools and top confusions (first round)\n`;
for (const { s } of runs) {
  if (!/^(cls|llm)-fuse/.test(s.name) && !/^(cls|llm)-nofuse/.test(s.name)) continue;
  const per: Record<string, { n: number; ok: number }> = {};
  const conf: Record<string, number> = {};
  for (const r of s.items) {
    const e = (per[r.expect] ??= { n: 0, ok: 0 });
    e.n++;
    if (r.firstHit) e.ok++;
    else {
      const got = r.first.kind === 'GO' ? r.first.code : r.first.kind === 'ASK' ? 'ASK(' + r.first.codes.join('') + ')' : 'NONE';
      const k = `${r.expect} -> ${got}`;
      conf[k] = (conf[k] ?? 0) + 1;
    }
  }
  const worst = Object.entries(per).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n).slice(0, 10);
  md += `\n### ${s.name}\n\nWorst 10 tools: ` + worst.map(([c, v]) => `${title[c]} ${p(v.ok / v.n)} (${v.ok}/${v.n})`).join('; ') + '\n\n';
  md += 'Most common confusions: ' + Object.entries(conf).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k} x${n}`).join('; ') + '\n';
}

// registry entity / param extraction (engine independent)
const withP = ts.filter((i) => (i.entity || i.params) && i.expect !== 'Z');
let ent = 0, entOk = 0, pr = 0, prOk = 0;
const bad: string[] = [];
for (const i of withP) {
  const t = toolByCode(registry, i.expect);
  if (!t) continue;
  const ex = extractParams(t, i.text, lookup(registry, i.text));
  if (i.entity) { ent++; if (ex.entity === i.entity) entOk++; else bad.push(`${i.text} (want entity ${i.entity}, got ${ex.entity ?? '-'})`); }
  if (i.params) for (const [k, v] of Object.entries(i.params)) { pr++; if (ex[k] === v) prOk++; else bad.push(`${i.text} (want ${k}=${v}, got ${ex[k] ?? '-'})`); }
}
md += `\n## Registry entity / parameter extraction (engine independent)\n\nentity ${entOk}/${ent} (${p(entOk / Math.max(1, ent))}); parameters ${prOk}/${pr} (${p(prOk / Math.max(1, pr))}).\n\nMisses:\n` + bad.map((b) => '- ' + b).join('\n') + '\n';

fs.writeFileSync(path.join(here, 'MATRIX_1K.md'), md);
console.log(md.slice(0, 3000));
