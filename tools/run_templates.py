"""Run the rendered templates against an installed forte2.

Render the templates first (``npm run render-templates``), then run this with
the Python that has forte2 installed:

    python tools/run_templates.py [name-filter ...]

Each script runs in its own process. For every object the script calls
``run()`` on, the tool prints its energy ``E`` so you can compare it with the
template's listed results.
"""

import json
import re
import subprocess
import sys
import time
from pathlib import Path

RUNNER = r"""
import contextlib, io, json, runpy, sys
path, leaves = sys.argv[1], sys.argv[2:]
buf = io.StringIO()
with contextlib.redirect_stdout(buf):
    ns = runpy.run_path(path, run_name="__main__")
out = {}
for name in leaves:
    e = getattr(ns.get(name), "E", None)
    try:
        out[name] = float(e)
    except (TypeError, ValueError):
        out[name] = None if e is None else str(e)
print(json.dumps(out))
"""


def main():
    root = Path(__file__).resolve().parent.parent
    scripts = sorted((root / "build" / "templates-py").glob("*.py"))
    filters = sys.argv[1:]
    if filters:
        scripts = [s for s in scripts if any(f in s.stem for f in filters)]
    if not scripts:
        sys.exit("No rendered templates. Run `npm run render-templates` first.")

    failed = 0
    for script in scripts:
        leaves = re.findall(r"^(\w+)\.run\(\)$", script.read_text(), flags=re.M)
        start = time.monotonic()
        proc = subprocess.run(
            [sys.executable, "-c", RUNNER, str(script), *leaves],
            capture_output=True,
            text=True,
        )
        elapsed = time.monotonic() - start
        if proc.returncode == 0:
            energies = json.loads(proc.stdout.strip().splitlines()[-1])
            shown = ", ".join(
                f"{k}.E = {v:.10f}" if isinstance(v, float) else f"{k}.E = {v}"
                for k, v in energies.items()
            )
            print(f"PASS  {script.stem:32s} {elapsed:7.1f} s  {shown}")
        else:
            failed += 1
            tail = "\n".join(proc.stderr.strip().splitlines()[-8:])
            print(f"FAIL  {script.stem:32s} {elapsed:7.1f} s\n{tail}\n")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
