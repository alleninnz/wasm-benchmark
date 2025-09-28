# -------------------------
# Stage 1: base (install all tools once)
# -------------------------
FROM ubuntu:24.04 AS base

SHELL ["/bin/bash", "-o", "pipefail", "-c"]
ENV DEBIAN_FRONTEND=noninteractive

# Versions (tweak as needed)
ENV RUST_VERSION=1.90.0 \
    GO_VERSION=1.25.1 \
    NODE_VERSION=22.20.0 \
    TINYGO_VERSION=0.39.0 \
    BINARYEN_VERSION=119 \
    RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:/usr/local/go/bin:/usr/local/bin:/usr/bin:$PATH

# Add build cache mount labels for better caching
LABEL org.opencontainers.image.source="https://github.com/wasm-benchmark"
LABEL org.opencontainers.image.description="WebAssembly Benchmark Environment"

# Install base packages and build deps
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    wget \
    git \
    build-essential \
    pkg-config \
    gnupg \
    lsb-release \
    jq \
    wabt \
    # Python runtime & build tools
    python3 \
    python3-venv \
    python3-pip \
    python3-dev \
    # ML / numeric libs used by some tasks
    libssl-dev \
    libffi-dev \
    libblas-dev \
    liblapack-dev \
    libatlas-base-dev \
    gfortran \
    # Imaging / fonts
    libfreetype6-dev \
    libpng-dev \
    xdg-utils \
    fonts-liberation \
    # Browser UI / audio deps (for headless browser testing)
    libasound2t64 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libdrm2 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    && rm -rf /var/lib/apt/lists/*

# Ensure python3 points to system python3
RUN ln -sf /usr/bin/python3 /usr/bin/python

# Install Poetry (no cache) - Ubuntu 24.04 requires --break-system-packages
RUN python3 -m pip install --no-cache-dir --break-system-packages poetry

# Install Go (detect arch)
RUN set -eux; \
    ARCH=$(uname -m); \
    case "$ARCH" in \
    x86_64) GOARCH=amd64 ;; \
    aarch64|arm64) GOARCH=arm64 ;; \
    *) echo "unsupported arch: $ARCH" && exit 1 ;; \
    esac; \
    wget -q https://golang.org/dl/go${GO_VERSION}.linux-${GOARCH}.tar.gz -O /tmp/go.tar.gz; \
    tar -C /usr/local -xzf /tmp/go.tar.gz; rm -f /tmp/go.tar.gz

# Install Node (binary tar)
RUN set -eux; \
    ARCH=$(uname -m); \
    case "$ARCH" in \
    x86_64) NODE_ARCH=x64 ;; \
    aarch64|arm64) NODE_ARCH=arm64 ;; \
    *) echo "unsupported arch: $ARCH" && exit 1 ;; \
    esac; \
    NODE_DIST=node-v${NODE_VERSION}-linux-${NODE_ARCH}; \
    wget -q https://nodejs.org/dist/v${NODE_VERSION}/${NODE_DIST}.tar.xz -O /tmp/node.tar.xz; \
    tar -C /usr/local --strip-components=1 -xJf /tmp/node.tar.xz; rm -f /tmp/node.tar.xz

# Install TinyGo (deb). dpkg may require apt-get -f to satisfy deps.
RUN set -eux; \
    DEB_ARCH=$(dpkg --print-architecture); \
    wget -q https://github.com/tinygo-org/tinygo/releases/download/v${TINYGO_VERSION}/tinygo_${TINYGO_VERSION}_${DEB_ARCH}.deb -O /tmp/tinygo.deb; \
    dpkg -i /tmp/tinygo.deb || (apt-get update && apt-get install -y -f --no-install-recommends); \
    rm -f /tmp/tinygo.deb; rm -rf /var/lib/apt/lists/*

# Install Rust as root
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain ${RUST_VERSION} \
    && rustup default ${RUST_VERSION} \
    && rustup target add wasm32-unknown-unknown \
    && rustup component add rustfmt clippy \
    && rustc --version \
    && cargo --version

# Create app directory
RUN mkdir -p /app /app/results /app/reports /app/builds

# Install Binaryen tools (WABT installed via apt package)
RUN set -eux; \
    # Install binaryen for wasm-opt
    ARCH=$(uname -m); \
    case "$ARCH" in \
    x86_64) BINARYEN_ARCH=x86_64 ;; \
    aarch64|arm64) BINARYEN_ARCH=aarch64 ;; \
    *) echo "unsupported arch: $ARCH" && exit 1 ;; \
    esac; \
    echo "Installing Binaryen ${BINARYEN_VERSION} for ${BINARYEN_ARCH}..." && \
    wget https://github.com/WebAssembly/binaryen/releases/download/version_${BINARYEN_VERSION}/binaryen-version_${BINARYEN_VERSION}-${BINARYEN_ARCH}-linux.tar.gz -O /tmp/binaryen.tar.gz; \
    tar -C /tmp -xzf /tmp/binaryen.tar.gz; \
    cp /tmp/binaryen-version_${BINARYEN_VERSION}/bin/* /usr/local/bin/; \
    rm -rf /tmp/binaryen*

WORKDIR /app
# -------------------------
# Stage 2: development (copy source code)
# -------------------------
FROM base AS development

# Copy Node package files first (keep layer small so node deps cache is effective)
COPY --chown=benchmark:benchmark package*.json /app/

# Install Node dependencies (use lockfile when present, otherwise fallback to install)
RUN if [ -f /app/package-lock.json ]; then \
    npm ci --omit=dev; \
    elif [ -f /app/package.json ]; then \
    npm install --omit=dev; \
    else \
    echo "no node package files found, skipping npm step"; \
    fi

# Copy Python packaging files separately so Python deps can cache independently
COPY --chown=benchmark:benchmark pyproject.toml poetry.lock /app/

# Configure Poetry to install into the system environment (inside the container)
ENV POETRY_VIRTUALENVS_CREATE=false \
    POETRY_CACHE_DIR=/home/benchmark/.cache/pypoetry

# Install Python dependencies with Poetry
RUN if [ -f /app/pyproject.toml ]; then \
    poetry install --only main --no-interaction --no-ansi --no-root; \
    else \
    echo "no pyproject.toml found, skipping poetry step"; \
    fi

# Copy source code with correct ownership
COPY --chown=benchmark:benchmark . /app/

# Create volume mount points for output directories
VOLUME ["/app/reports", "/app/results", "/app/builds"]

# Set working directory and user
WORKDIR /app

# Health check for container readiness
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD ["bash", "-lc", "python3 --version && node --version && rustc --version && wasm-strip --version && wasm-opt --version && wasm2wat --version && jq --version"]

# Default command for development
CMD ["/bin/bash"]
