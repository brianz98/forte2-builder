"""Dump the constructor options of an installed forte2 to JSON.

Run with the Python that has forte2 installed:

    python tools/dump_forte2.py > dump.json

The output lists every public dataclass reachable from ``forte2`` plus the
parameter classes, with each init field's type, default and description.
Descriptions are merged along the MRO, so options documented on a base class
(for example ``SCFBase``) are attached to every subclass. It also lists the
parameters of the post-processing functions in ``FUNCTIONS``.
"""

import contextlib
import dataclasses
import enum
import inspect
import json
import re
import sys
import typing

# forte2 prints a banner on import; keep stdout clean for the JSON.
with contextlib.redirect_stdout(sys.stderr):
    import forte2
    from forte2.base_classes import Method

EXTRA_CLASSES = [
    "forte2.base_classes.params:CIParams",
    "forte2.base_classes.params:DavidsonLiuParams",
    "forte2.base_classes.params:SelectedCIParams",
    "forte2.dsrg:DSRG_MRPT2",
    "forte2.dsrg:RelDSRG_MRPT2",
]

FUNCTIONS = [
    "forte2:get_1e_property",
    "forte2:mulliken_population",
    "forte2:write_orbital_cubes",
]


def _load(spec):
    module_name, _, attr = spec.partition(":")
    with contextlib.redirect_stdout(sys.stderr):
        module = __import__(module_name, fromlist=[attr])
    return getattr(module, attr)


def _docstring_params(doc):
    from numpydoc.docscrape import NumpyDocString

    try:
        params = NumpyDocString(inspect.cleandoc(doc))["Parameters"]
    except Exception:
        return {}
    return {
        p.name.split(":")[0].strip(): {
            "type": p.type,
            "desc": "\n".join(p.desc).strip(),
        }
        for p in params
    }


def _param_docs(cls):
    docs = {}
    for klass in reversed(cls.__mro__):
        if klass.__doc__:
            docs.update(_docstring_params(klass.__doc__))
    return docs


def _summary(cls):
    doc = inspect.getdoc(cls) or ""
    return doc.strip().split("\n\n")[0].replace("\n", " ")


def _type_str(tp):
    if isinstance(tp, str):
        return tp
    s = repr(tp)
    return s.replace("typing.", "").replace("<class '", "").replace("'>", "")


def _default(field):
    if field.default is not dataclasses.MISSING:
        value = field.default
    elif field.default_factory is not dataclasses.MISSING:
        try:
            value = field.default_factory()
        except Exception:
            return {"repr": "<factory>"}
    else:
        return None
    return _encode(value)


def _encode(value):
    if isinstance(value, enum.Enum):
        value = value.value
    try:
        json.dumps(value)
        return {"value": value}
    except TypeError:
        text = repr(value)
        # Object reprs carry a memory address; drop it so dumps diff cleanly.
        return {"repr": re.sub(r" at 0x[0-9a-fA-F]+", "", text)}


def dump_class(cls):
    try:
        hints = typing.get_type_hints(cls)
    except Exception:
        hints = {}
    docs = _param_docs(cls)
    options = []
    for f in dataclasses.fields(cls):
        if not f.init:
            continue
        entry = {
            "name": f.name,
            "type": _type_str(hints.get(f.name, f.type)),
            "required": f.default is dataclasses.MISSING
            and f.default_factory is dataclasses.MISSING,
            "doc": docs.get(f.name, {}).get("desc"),
        }
        default = _default(f)
        if default is not None:
            entry["default"] = default
        options.append(entry)
    return {
        "module": cls.__module__,
        "mro": [k.__name__ for k in cls.__mro__ if k is not object],
        "is_method": issubclass(cls, Method),
        "has_gradient": hasattr(cls, "gradient"),
        "summary": _summary(cls),
        "options": options,
    }


def dump_function(fn):
    docs = _docstring_params(fn.__doc__ or "")
    options = []
    for p in inspect.signature(fn).parameters.values():
        if p.kind in (p.VAR_POSITIONAL, p.VAR_KEYWORD):
            continue
        annotated = p.annotation is not inspect.Parameter.empty
        entry = {
            "name": p.name,
            "type": (
                _type_str(p.annotation)
                if annotated
                else docs.get(p.name, {}).get("type", "")
            ),
            "required": p.default is inspect.Parameter.empty,
            "doc": docs.get(p.name, {}).get("desc"),
        }
        if p.default is not inspect.Parameter.empty:
            entry["default"] = _encode(p.default)
        options.append(entry)
    return {"module": fn.__module__, "summary": _summary(fn), "options": options}


def main():
    classes = {}
    for name in dir(forte2):
        obj = getattr(forte2, name)
        if inspect.isclass(obj) and dataclasses.is_dataclass(obj):
            classes[name] = obj
    for spec in EXTRA_CLASSES:
        obj = _load(spec)
        classes[obj.__name__] = obj
    out = {
        "forte2_version": forte2.__version__,
        "classes": {name: dump_class(cls) for name, cls in sorted(classes.items())},
        "functions": {
            fn.__name__: dump_function(fn)
            for fn in sorted(map(_load, FUNCTIONS), key=lambda f: f.__name__)
        },
    }
    json.dump(out, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
