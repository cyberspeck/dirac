#!/bin/bash
# Full unit-suite run, comparable against test-baselines/.
#
#   scripts/run-unit.sh [checkout] [out-dir]   # defaults: this repo, <checkout>/tmp/unit-run (gitignored)
#   scripts/run-unit.sh --failing <results.json>   # print the failing list of an existing run
#
# Writes <out-dir>/{files.txt,results.json,stdout.log,stderr.log,failing.txt}. Compare with
#   diff test-baselines/<name>.failing.txt <out-dir>/failing.txt
#
# Same globs/ignores as package.json test:unit, deduplicated file list (the two globs overlap on
# __tests__/*.test.ts), run in mocha --parallel --jobs 2 so a root-hook (loggerGuard) failure aborts
# only its own file instead of the rest of the suite. Run it outside any agent sandbox (FINDINGS F-014).
set -u

# One line per failure: "<repo-relative file> :: <fullTitle>", sorted, unique, no absolute paths.
failing() {
	python3 - "$1" <<'PY'
import json, re, sys
d = json.load(open(sys.argv[1]))
out = set()
for f in d["failures"]:
    path = re.sub(r"^.*?/(?=src/)", "", f.get("file") or "?")
    title = " ".join(f["fullTitle"].split())
    out.add(f"{path} :: {title}")
print("\n".join(sorted(out)))
PY
}

case "${1:-}" in
-h | --help)
	sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
	exit 0
	;;
--failing)
	failing "${2:?usage: run-unit.sh --failing <results.json>}"
	exit $?
	;;
esac

WT=$(cd "${1:-$(dirname "$0")/..}" && pwd) || exit 2
OUT=${2:-$WT/tmp/unit-run}
mkdir -p "$OUT" && OUT=$(cd "$OUT" && pwd)
cd "$WT" || exit 2

# Honour .nvmrc when nvm is installed; otherwise use whatever node is on PATH.
if [ -f .nvmrc ] && [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
	. "${NVM_DIR:-$HOME/.nvm}/nvm.sh" && nvm use --silent >/dev/null
fi
MAJOR=$(node -p 'process.versions.node.split(".")[0]') || exit 2
if [ "$MAJOR" -ge 26 ]; then
	echo "node $MAJOR: mocha does not start on Node 26+ (FINDINGS F-010); use an LTS node" >&2
	exit 2
fi

python3 - >"$OUT/files.txt" <<'PY'
import glob
g=set(glob.glob('src/**/__tests__/*.ts',recursive=True))|set(glob.glob('src/**/*.test.ts',recursive=True))
ign=('src/hosts/vscode/hostbridge/window/getOpenTabs.test.ts','src/hosts/vscode/hostbridge/window/getVisibleTabs.test.ts','src/hosts/vscode/terminal/VscodeTerminalProcess.test.ts','src/hosts/vscode/hostbridge/workspace/saveOpenDocumentIfDirty.test.ts')
print('\n'.join(sorted(f for f in g if not f.startswith('src/test/e2e/') and f not in ign)))
PY
START=$(date +%s)
TS_NODE_PROJECT=./tsconfig.unit-test.json xargs npx mocha --node-option no-experimental-strip-types --parallel --jobs 2 \
	--reporter json --reporter-option output="$OUT/results.json" <"$OUT/files.txt" >"$OUT/stdout.log" 2>"$OUT/stderr.log"
EXIT=$?
echo "EXIT:$EXIT SECS:$(($(date +%s) - START)) FILES:$(wc -l <"$OUT/files.txt") NODE:$(node -v)" | tee -a "$OUT/stderr.log"
failing "$OUT/results.json" >"$OUT/failing.txt" && echo "failing: $(wc -l <"$OUT/failing.txt") -> $OUT/failing.txt"
