# Forte2 input builder

[![Build and deploy](https://github.com/brianz98/forte2-builder/actions/workflows/pages.yml/badge.svg)](https://github.com/brianz98/forte2-builder/actions/workflows/pages.yml)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-website-blue?logo=github)](https://brianz98.github.io/forte2-builder/)

A visual input builder for [Forte2](https://github.com/evangelistalab/forte2). Connect methods into
a chain, and the builder checks that each step can follow the one before it and writes the Python
input. What it knows about Forte2 comes from the catalog in `catalog/`, and its examples come from
`templates/`.

To run the scripts it writes, install Forte2 from
[conda-forge](https://anaconda.org/conda-forge/forte2) with `conda install -c conda-forge forte2`,
or build it from the [Forte2 repository](https://github.com/evangelistalab/forte2).

## Develop locally

You need Node.js 22 or later.

1. Install dependencies:

   ```sh
   npm install
   ```

1. Start the development server, then open http://localhost:5173:

   ```sh
   npm run dev
   ```

1. Before you push, run the type checker and the tests:

   ```sh
   npm run check
   ```
