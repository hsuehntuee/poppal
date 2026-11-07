#!/bin/bash
# usage: run_1k.sh <suffix>   (suffix e.g. before / after) ; runs from assistant/
SUF=${1:-before}; T=../assistant/public/data/testset_1k.json; O=../eval/results_1k
for f in "" "--fuse"; do
  n=$([ -z "$f" ] && echo nofuse || echo fuse)
  for e in cls tiny embed; do
    npx tsx ../eval/eval.ts --engine $e --testset $T --foreign $f --name "$e-$n-$SUF" --where laptop --out $O/$e-$n-$SUF.json > $O/$e-$n-$SUF.log 2>&1
  done
  npx tsx ../eval/eval.ts --engine llm --url http://127.0.0.1:8080 --testset $T --foreign $f --name "llm-$n-$SUF" --where laptop-gpu --out $O/llm-$n-$SUF.json > $O/llm-$n-$SUF.log 2>&1
done
echo done
