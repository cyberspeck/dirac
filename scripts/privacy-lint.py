#!/usr/bin/env python3
"""Refuse identifying or project-private text in this fork's commits before they are pushed.

Scans every commit message and every *added* line in <base>..<head> for the terms in
`.git/info/private-terms` (one case-insensitive regex per line, `#` comments, blank lines ignored).
The list lives outside the tracked tree because the list itself is identifying. Also refuses
`Co-Authored-By` trailers and any change under `tools/` other than `tools/count_text/`.

    python3 scripts/privacy-lint.py [base] [head]     # defaults: v0.5.15 HEAD

Exit 0 clean, 1 with one line per hit, 2 when the terms file is missing. Run before every push.
"""
import re
import subprocess
import sys
from pathlib import Path


TRAILER = re.compile(r"^co-authored-by:", re.I | re.M)


def git(*args: str) -> str:
    return subprocess.run(["git", *args], capture_output=True, text=True, errors="replace", check=True).stdout


def main() -> int:
    base = sys.argv[1] if len(sys.argv) > 1 else "v0.5.15"
    head = sys.argv[2] if len(sys.argv) > 2 else "HEAD"
    terms = Path(git("rev-parse", "--path-format=absolute", "--git-path", "info/private-terms").strip())
    if not terms.is_file():
        print(f"privacy-lint: no terms file at {terms} — create it (one regex per line) before pushing", file=sys.stderr)
        return 2
    patterns = [
        re.compile(line.strip(), re.I)
        for line in terms.read_text().splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]

    hits = []
    for sha in git("rev-list", "--reverse", f"{base}..{head}").split():
        short = sha[:8]
        for n, line in enumerate(git("log", "-1", "--format=%B", sha).splitlines(), 1):
            hits += [f"{short} message:{n}: [{p.pattern}] {line.strip()[:140]}" for p in patterns if p.search(line)]
        if TRAILER.search(git("log", "-1", "--format=%B", sha)):
            hits.append(f"{short} message: Co-Authored-By trailer (fork convention: none)")
        hits += [
            f"{short} {p}: only tools/count_text/ is published here"
            for p in git("show", "--format=", "--name-only", sha).splitlines()
            if p.startswith("tools/") and not p.startswith("tools/count_text/")
        ]
        path = "?"
        for line in git("show", "--format=", "--unified=0", "--no-color", sha).splitlines():
            if line.startswith("+++ "):
                path = line[6:] if line.startswith("+++ b/") else line[4:]
            elif line.startswith("+") and not line.startswith("+++"):
                hits += [f"{short} {path}: [{p.pattern}] {line[1:].strip()[:140]}" for p in patterns if p.search(line)]

    print("\n".join(hits) if hits else f"clean: {base}..{head} ({len(patterns)} terms)")
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main())
