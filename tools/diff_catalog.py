"""Compare a new forte2 dump with the curated catalog.

After a forte2 release, dump the new version and diff it against the catalog
you are updating:

    python tools/dump_forte2.py > catalog/forte2-NEW.dump.json
    python tools/diff_catalog.py catalog/forte2-OLD.yaml catalog/forte2-NEW.dump.json

The report lists classes and options that forte2 added or removed, changed
defaults, and curated entries that no longer exist. Needs PyYAML.
"""

import json
import sys

import yaml


def load(path):
    with open(path) as f:
        return yaml.safe_load(f) if path.endswith((".yaml", ".yml")) else json.load(f)


def resolve(nodes, name, seen=()):
    """Merge a curated node with the nodes it extends, as the site does."""
    node = nodes[name]
    base_name = node.get("extends")
    if not base_name or base_name in seen:
        return node
    base = resolve(nodes, base_name, seen + (name,))
    merged = {**base, **node}
    for key in ("options", "slots"):
        merged[key] = {**base.get(key, {}), **node.get(key, {})}
    merged["hide"] = base.get("hide", []) + node.get("hide", [])
    return merged


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    catalog = load(sys.argv[1])
    dump = load(sys.argv[2])
    old_dump_path = sys.argv[1].rsplit(".", 1)[0] + ".dump.json"
    try:
        old_dump = load(old_dump_path)["classes"]
    except FileNotFoundError:
        old_dump = {}
    new = dump["classes"]
    nodes = catalog["nodes"]
    lines = []

    curated = {}
    for name, node in nodes.items():
        if node.get("abstract"):
            continue
        curated[node.get("dump", name)] = resolve(nodes, name)

    for cls in sorted(set(curated) - set(new)):
        lines.append(f"REMOVED CLASS  {cls} is curated but no longer in forte2")
    for cls in sorted(set(new) - set(curated) - {"ModelSystem", "MOSpace"}):
        lines.append(f"NEW CLASS      {cls} is in forte2 but not in the catalog")

    for cls, node in sorted(curated.items()):
        if cls not in new:
            continue
        fields = {o["name"]: o for o in new[cls]["options"]}
        old_fields = {o["name"]: o for o in old_dump.get(cls, {}).get("options", [])}
        listed = set(node.get("options", {})) | set(node.get("slots", {}))
        for opt in sorted(listed - set(fields)):
            lines.append(
                f"STALE OPTION   {cls}.{opt} is curated but no longer an argument"
            )
        for opt in sorted(set(fields) - set(old_fields)) if old_fields else []:
            where = "curated" if opt in listed else "shown under Advanced"
            lines.append(f"NEW OPTION     {cls}.{opt} ({fields[opt]['type']}), {where}")
        for opt in sorted(set(old_fields) - set(fields)):
            lines.append(f"GONE OPTION    {cls}.{opt}")
        for opt in sorted(set(fields) & set(old_fields)):
            a, b = old_fields[opt], fields[opt]
            if a.get("default") != b.get("default"):
                lines.append(
                    f"DEFAULT        {cls}.{opt}: {a.get('default')} -> {b.get('default')}"
                )
            if a["type"] != b["type"]:
                lines.append(f"TYPE           {cls}.{opt}: {a['type']} -> {b['type']}")

    old_version = catalog.get("forte2_version")
    print(f"catalog forte2 {old_version} vs dump forte2 {dump['forte2_version']}")
    print("\n".join(lines) if lines else "No differences.")


if __name__ == "__main__":
    main()
