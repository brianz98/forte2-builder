# forte2 builder

[![Build and deploy](https://github.com/brianz98/forte2-builder/actions/workflows/pages.yml/badge.svg)](https://github.com/brianz98/forte2-builder/actions/workflows/pages.yml)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-website-blue?logo=github)](https://brianz98.github.io/forte2-builder/)

A visual input builder for [forte2](https://github.com/evangelistalab/forte2). You connect methods
into a chain, the builder checks that each step can follow the one before it, and it writes the
Python input for you.

The site holds no knowledge of forte2 in its code. Everything it shows comes from three kinds of data
files, so updating it for a new forte2 release means editing data, not code:

`catalog/forte2-<version>.yaml`
: The curated catalog: which classes appear, how they compose, which options matter, and the
  compatibility rules.

`catalog/forte2-<version>.dump.json`
: Option names, types, defaults, and descriptions, generated from an installed forte2 by
  `tools/dump_forte2.py`. The site merges it with the curated catalog, and any constructor argument
  the catalog doesn't list still appears under **Advanced**.

`templates/*.yaml`
: Example inputs, each transcribed from a forte2 test, with the reference results from that test's
  assertions.

## Develop locally

You need Node.js 22 or later.

1. Install dependencies:

   ```sh
   npm install
   ```

1. Start the development server:

   ```sh
   npm run dev
   ```

   Open http://localhost:5173. The page reloads when you save a change to the source, the catalog,
   or a template.

1. Before you push, run the type checker and the tests:

   ```sh
   npm run check
   ```

The tests check that the catalog loads cleanly, that every template passes the builder's rules, and
that the rules and code generation behave as expected. They also write every template as a Python
script to `build/templates-py/`.

To change how the server runs, pass Vite flags after `--`:

- To serve on another port, run `npm run dev -- --port 3000`.
- To reach the server from other devices on your network, run `npm run dev -- --host`. Vite prints
  the network URL to open.

## Preview the production build

The deployed site is a static build served from `/forte2-builder/`. To check the build before you
deploy it:

1. Build the site into `dist/`:

   ```sh
   npm run build
   ```

1. Serve the build:

   ```sh
   npm run preview
   ```

1. Open http://localhost:4173/forte2-builder/. The path matters: the build loads its assets from
   `/forte2-builder/`, so the site doesn't load from the server root.

## Repository layout

| Path | Contents |
| --- | --- |
| `catalog/` | Curated catalogs and generated dumps, one pair per forte2 version. |
| `templates/` | Example graphs in the `forte2-graph/1` format. |
| `src/catalog/` | Catalog loader: merges the YAML with the dump and resolves `extends`. |
| `src/rules/` | Compatibility checks, run on every edit. |
| `src/codegen/` | Graph to Python, formatted the way Black formats it. |
| `src/ui/` | React components; the canvas uses React Flow and ELK for layout. |
| `tools/` | Python scripts that run against an installed forte2. |

## Edit the catalog

The header of `catalog/forte2-2026.9.1.yaml` documents every node field. The fields that decide
what can connect to what are the following:

`parents`
: The node types this node can follow. Omit it to allow any node that meets `requires`.

`requires` and `provides`
: Facts such as `mos`, `mo_space`, `energy`, and `gradient`. A node can follow a parent only if the
  parent provides everything the node requires.

`sets` and `requires_attrs`
: Attributes that flow down the chain, such as `two_component` and `model`. A node inherits its
  parent's attributes unless it sets its own.

`rules`
: Checks that the fields above can't express. For example, "spin-orbit X2C needs GHF" is a rule on
  the one-component SCF classes.

`family`
: Types that can replace each other, such as the SCF classes or the four solvers. The inspector's
  **Switch to** menu and the fix suggestions only swap a node for another type in its family.

When a check fails, the builder suggests fixes: connecting a loose node, inserting one node before
the failing one, or switching the node or its upstream method to another type in its family. It
tries each candidate on a copy of the graph and offers it only if the failed check passes and the
graph has fewer errors afterward.

To see your changes, save the file. The development server reloads it, and a panel on the canvas
lists any catalog problems, such as an option that isn't a constructor argument of that forte2
version.

## Add a template

1. Pick a forte2 test whose input shows a capability worth showing.
1. Copy one of the files in `templates/` and transcribe the test's input into it. Quote any result
   label that contains a comma, because YAML splits unquoted flow mappings at commas.
1. Run `npm run check`. The template must pass the rules with no errors or warnings.
1. Optional: To confirm that the generated script runs and reproduces the test's energies, run it
   against a local forte2, as described in step 5 of the next section.

## Update for a new forte2 release

Run these steps with the Python environment that has the new forte2 installed:

1. Dump the new release:

   ```sh
   python tools/dump_forte2.py > catalog/forte2-NEW.dump.json
   ```

1. Compare it with the current catalog:

   ```sh
   python tools/diff_catalog.py catalog/forte2-OLD.yaml catalog/forte2-NEW.dump.json
   ```

   The report lists new and removed classes, new and removed options, changed defaults, and curated
   options that no longer exist.

1. Copy `catalog/forte2-OLD.yaml` to `catalog/forte2-NEW.yaml`, set `forte2_version`, and resolve
   the report.
1. Update `forte2_version` in each template, then run `npm run check`.
1. Run every template against the new forte2:

   ```sh
   npm run render-templates
   python tools/run_templates.py
   ```

   The tool runs each generated script and prints the energy of every node the script calls
   `run()` on, so you can compare it with the template's reference results.

The site offers the newest catalog version. To keep only one version, delete the old catalog pair.

## Deploy

Pushes to `main` build the site and deploy it to GitHub Pages. To turn this on once, go to the
repository's **Settings** > **Pages** and set **Source** to **GitHub Actions**.

The site is served from `/forte2-builder/`, which is set as `base` in `vite.config.ts`. If you
rename the repository, update `base` to match.
