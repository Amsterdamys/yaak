#!/bin/bash
# Rebuilds crates/yaak-wasm/pkg (the browser edition's models, migrations and template
# engine) inside Docker, for machines without a wasm-capable clang. The pkg is committed,
# so run this after any change under crates/ that the web client depends on, and commit
# the result. First run builds the image (a few minutes); later runs reuse the cached
# cargo target and take about a minute.
#
#   scripts/wasm-builder/build.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
docker build -q -t yaak-wasm-builder "$ROOT/scripts/wasm-builder"
docker run --rm \
  -v "$ROOT":/src \
  -v yaak-wasm-target:/target \
  -v yaak-wasm-cargo-registry:/usr/local/cargo/registry \
  -v yaak-wasm-cargo-git:/usr/local/cargo/git \
  yaak-wasm-builder
# wasm-pack drops a .gitignore that would hide the package from git
rm -f "$ROOT/crates/yaak-wasm/pkg/.gitignore"
