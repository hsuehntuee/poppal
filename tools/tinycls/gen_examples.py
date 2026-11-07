#!/usr/bin/env python3
"""
用大模型（llama-server 的 /v1/chat/completions，例如 4090 上的 Qwen3-14B）替每個服務擴增訓練句，
追加到 tools/tinycls/data/services.jsonl。賽前在 GPU 上跑一次即可；人工抽查後再訓練。

  python tools/tinycls/gen_examples.py --url http://4090:8080 --per 40
"""
import argparse, json, os, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))

PROMPT = """你在替台北市政府的「城市通」App 產生訓練句。服務：「{title}」—— {desc}。
請寫 {n} 句台灣一般市民（包含長輩）可能對語音助理說的話，想要使用這個服務。
要求：口語、多樣（有的很短、有的囉嗦、有的用錯詞、有的夾雜台語腔或英文）、不要編號、一行一句、不要解釋。"""

def chat(url, content):
    body = json.dumps({'messages': [{'role': 'user', 'content': content}], 'temperature': 0.9, 'max_tokens': 1200,
                       'chat_template_kwargs': {'enable_thinking': False}}).encode()
    req = urllib.request.Request(url.rstrip('/') + '/v1/chat/completions', data=body, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.load(r)['choices'][0]['message']['content']

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', required=True)
    ap.add_argument('--per', type=int, default=40)
    ap.add_argument('--out', default=os.path.join(HERE, 'data', 'services.generated.jsonl'))
    args = ap.parse_args()
    catalog = json.load(open(os.path.join(ROOT, 'assistant/public/data/catalog.json'), encoding='utf-8'))
    with open(args.out, 'a', encoding='utf-8') as f:
        for s in catalog['services']:
            txt = chat(args.url, PROMPT.format(title=s['title']['zh'], desc=s['desc'], n=args.per))
            lines = [l.strip(' -•\t').strip() for l in txt.splitlines()]
            lines = [l for l in lines if l and len(l) < 60]
            for l in lines:
                f.write(json.dumps({'text': l, 'label': s['code'], 'src': 'gen'}, ensure_ascii=False) + '\n')
            print(s['code'], s['title']['zh'], len(lines), file=sys.stderr)
    print('appended to', args.out, '— 人工抽查後把它併進 services.jsonl', file=sys.stderr)

if __name__ == '__main__':
    main()
