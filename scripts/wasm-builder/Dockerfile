# Builds crates/yaak-wasm/pkg on a Mac without a wasm-capable clang. Mirrors the
# release workflow: clang-18 from apt.llvm.org, wasm32 target, wasm-pack.
FROM rust:1-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget gnupg lsb-release software-properties-common nodejs ca-certificates \
    && wget -qO /tmp/llvm.sh https://apt.llvm.org/llvm.sh && chmod +x /tmp/llvm.sh \
    && /tmp/llvm.sh 18 && rm -rf /var/lib/apt/lists/*
RUN rustup target add wasm32-unknown-unknown && cargo install wasm-pack --locked
ENV CC_wasm32_unknown_unknown=/usr/bin/clang-18 \
    AR_wasm32_unknown_unknown=/usr/bin/llvm-ar-18 \
    CARGO_TARGET_DIR=/target
WORKDIR /src/crates/yaak-wasm
CMD ["node", "build-wasm.cjs"]
