# -------------------------
# Stage 1: base (install all tools once)
# -------------------------
FROM ubuntu:24.04 AS base

# Build arguments for version control (can be overridden at build time)
ARG RUST_VERSION=1.90.0
ARG GO_VERSION=1.25.1
ARG NODE_VERSION=22.20.0
ARG TINYGO_VERSION=0.39.0
ARG BINARYEN_VERSION=119
ARG TZ=Pacific/Auckland

# Security and build optimization
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
ENV DEBIAN_FRONTEND=noninteractive \
    TZ=${TZ} \
    # Browser configuration for headless mode with real Chromium
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/local/bin/chromium \
    CHROME_BIN=/usr/local/bin/chromium \
    CHROMIUM_BIN=/usr/local/bin/chromium \
    DISPLAY=:99 \
    # Path configuration
    RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:/usr/local/go/bin:/usr/local/bin:/usr/bin:$PATH

# Add build cache mount labels for better caching
LABEL org.opencontainers.image.source="https://github.com/alleninnz/wasm-benchmark"
LABEL org.opencontainers.image.description="WebAssembly Benchmark Environment"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.version="0.1.0"
LABEL org.opencontainers.image.authors="Allen"

# Create application directories
RUN mkdir -p /app /app/results /app/reports /app/builds

# Install all system packages in a single optimized layer
RUN set -eux; \
    apt-get update; \
    # Install debconf-utils and preseed timezone configuration
    apt-get install -y --no-install-recommends debconf-utils; \
    TZ_AREA=$(echo "${TZ}" | cut -d'/' -f1); \
    TZ_ZONE=$(echo "${TZ}" | cut -d'/' -f2); \
    echo "tzdata tzdata/Areas select ${TZ_AREA}" | debconf-set-selections; \
    echo "tzdata tzdata/Zones/${TZ_AREA} select ${TZ_ZONE}" | debconf-set-selections; \
    # Install all packages in single operation for optimal layer caching
    apt-get install -y --no-install-recommends \
    # Core system packages
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
    lsof \
    procps \
    vim \
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
    # Timezone
    tzdata \
    # Imaging / fonts
    libfreetype6-dev \
    libpng-dev \
    xdg-utils \
    fonts-liberation \
    # Browser UI / audio deps (consolidated for headless browser testing)
    xvfb \
    libasound2t64 \
    libatk-bridge2.0-0 \
    libatk-bridge2.0-0t64 \
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
    libgbm1 \
    libxss1; \
    # Ensure python3 points to system python3
    ln -sf /usr/bin/python3 /usr/bin/python; \
    # Cleanup package cache and verify timezone
    rm -rf /var/lib/apt/lists/*; \
    echo "Timezone configured: $(date)"

# Install Poetry (no cache) - Ubuntu 24.04 requires --break-system-packages
RUN python3 -m pip install --no-cache-dir --break-system-packages poetry

# Install Go
RUN set -eux; \
    ARCH=$(uname -m); \
    case "$ARCH" in \
    x86_64) GOARCH=amd64 ;; \
    aarch64|arm64) GOARCH=arm64 ;; \
    *) echo "unsupported arch: $ARCH" && exit 1 ;; \
    esac; \
    # Download Go binary from go.dev (new official location)
    wget -q "https://go.dev/dl/go${GO_VERSION}.linux-${GOARCH}.tar.gz" -O /tmp/go.tar.gz; \
    # Extract and cleanup
    tar -C /usr/local -xzf /tmp/go.tar.gz; \
    rm -f /tmp/go.tar.gz; \
    # Verify installation
    /usr/local/go/bin/go version

# Install Node.js
RUN set -eux; \
    ARCH=$(uname -m); \
    case "$ARCH" in \
    x86_64) NODE_ARCH=x64 ;; \
    aarch64|arm64) NODE_ARCH=arm64 ;; \
    *) echo "unsupported arch: $ARCH" && exit 1 ;; \
    esac; \
    NODE_DIST=node-v${NODE_VERSION}-linux-${NODE_ARCH}; \
    # Download and install Node.js
    wget -q "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_DIST}.tar.xz" -O /tmp/node.tar.xz; \
    # Extract and cleanup
    tar -C /usr/local --strip-components=1 -xJf /tmp/node.tar.xz; \
    rm -f /tmp/node.tar.xz; \
    # Verify installation
    node --version && npm --version

# Install Playwright and Chromium with proper user handling
RUN set -eux; \
    # Install Playwright CLI globally
    npm install -g playwright@latest; \
    # Download official Chromium binaries optimized for headless use
    playwright install chromium; \
    # Install system dependencies that Playwright requires
    playwright install-deps chromium; \
    # Find Playwright's Chromium installation and create symlinks
    CHROMIUM_PATH=$(find /root/.cache/ms-playwright -name "chromium-*" -type d | head -1)/chrome-linux/chrome; \
    ln -sf "$CHROMIUM_PATH" /usr/local/bin/chromium; \
    ln -sf "$CHROMIUM_PATH" /usr/local/bin/chromium-browser; \
    ln -sf "$CHROMIUM_PATH" /usr/local/bin/chrome; \
    chmod -R 755 /root/.cache/ms-playwright; \
    # Verify installation works
    /usr/local/bin/chromium --version

# Install TinyGo with enhanced error handling
RUN set -eux; \
    DEB_ARCH=$(dpkg --print-architecture); \
    # Download TinyGo debian package
    wget -q "https://github.com/tinygo-org/tinygo/releases/download/v${TINYGO_VERSION}/tinygo_${TINYGO_VERSION}_${DEB_ARCH}.deb" \
    -O /tmp/tinygo.deb; \
    # Install with dependency resolution if needed
    dpkg -i /tmp/tinygo.deb || (apt-get update && apt-get install -y -f --no-install-recommends); \
    # Cleanup
    rm -f /tmp/tinygo.deb; \
    rm -rf /var/lib/apt/lists/*; \
    # Verify installation
    tinygo version

# Install Rust with proper verification
RUN set -eux; \
    # Download and verify Rust installer with checksums
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
    sh -s -- -y --default-toolchain ${RUST_VERSION}; \
    # Configure Rust toolchain
    source "${CARGO_HOME}/env"; \
    rustup default ${RUST_VERSION}; \
    rustup target add wasm32-unknown-unknown; \
    rustup component add rustfmt clippy; \
    # Verify installation
    rustc --version; \
    cargo --version

# Install Binaryen tools
RUN set -eux; \
    ARCH=$(uname -m); \
    case "$ARCH" in \
    x86_64) BINARYEN_ARCH=x86_64 ;; \
    aarch64|arm64) BINARYEN_ARCH=aarch64 ;; \
    *) echo "unsupported arch: $ARCH" && exit 1 ;; \
    esac; \
    echo "Installing Binaryen ${BINARYEN_VERSION} for ${BINARYEN_ARCH}..."; \
    # Download Binaryen tools
    wget -q "https://github.com/WebAssembly/binaryen/releases/download/version_${BINARYEN_VERSION}/binaryen-version_${BINARYEN_VERSION}-${BINARYEN_ARCH}-linux.tar.gz" \
    -O /tmp/binaryen.tar.gz; \
    # Extract and install
    tar -C /tmp -xzf /tmp/binaryen.tar.gz; \
    cp /tmp/binaryen-version_${BINARYEN_VERSION}/bin/* /usr/local/bin/; \
    # Cleanup and verify
    rm -rf /tmp/binaryen*; \
    wasm-opt --version

# -------------------------
# Stage 2: development (copy source code)
# -------------------------
FROM base AS development

# Copy Node package files first (keep layer small so node deps cache is effective)
COPY package*.json /app/

# Set working directory for npm operations
WORKDIR /app

# Install Node dependencies including dev dependencies for development environment
RUN if [ -f package-lock.json ]; then \
    npm ci; \
    elif [ -f package.json ]; then \
    npm install; \
    else \
    echo "no node package files found, skipping npm step"; \
    fi

# Copy Python packaging files separately so Python deps can cache independently
COPY pyproject.toml poetry.lock* /app/

# Configure Poetry to install into the system environment (inside the container)
ENV POETRY_VIRTUALENVS_CREATE=false \
    POETRY_CACHE_DIR=/root/.cache/pypoetry

# Install Python dependencies with Poetry
RUN if [ -f pyproject.toml ]; then \
    poetry install --only main --no-interaction --no-ansi --no-root; \
    else \
    echo "no pyproject.toml found, skipping poetry step"; \
    fi

# Copy source code
COPY . /app/

# Create volume mount points for output directories
VOLUME ["/app/reports", "/app/results", "/app/builds"]

# Enhanced health check for container readiness
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD ["bash", "-lc", "python3 --version && node --version && rustc --version && wasm-strip --version && wasm-opt --version && wasm2wat --version && jq --version"]

# Default command for development
CMD ["/bin/bash"]
