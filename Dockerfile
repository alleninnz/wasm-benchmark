# WebAssembly Benchmark Dockerfile
# Multi-stage build optimization: build stage vs runtime stage

# =============================================================================
# First Stage: Build and Tool Installation
# =============================================================================
FROM ubuntu:24.04 AS builder

# Avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install basic system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    pkg-config \
    libssl-dev \
    ca-certificates \
    gnupg \
    lsb-release \
    software-properties-common \
    && rm -rf /var/lib/apt/lists/*

# Install Python scientific computing dependencies
RUN apt-get update && apt-get install -y \
    python3.13 \
    python3.13-dev \
    python3.13-venv \
    python3-pip \
    libblas-dev \
    liblapack-dev \
    libatlas-base-dev \
    gfortran \
    libfreetype6-dev \
    libpng-dev \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Rust toolchain
ENV RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    PATH=/usr/local/cargo/bin:$PATH

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y \
    && rustup install 1.89.0 \
    && rustup default 1.89.0 \
    && rustup target add wasm32-unknown-unknown \
    && rustup component add rustfmt clippy

# Install Go
ENV GO_VERSION=1.25.0
RUN wget -q https://golang.org/dl/go${GO_VERSION}.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go${GO_VERSION}.linux-amd64.tar.gz \
    && rm go${GO_VERSION}.linux-amd64.tar.gz

# Install TinyGo
ENV TINYGO_VERSION=0.39.0
RUN wget -q https://github.com/tinygo-org/tinygo/releases/download/v${TINYGO_VERSION}/tinygo_${TINYGO_VERSION}_amd64.deb \
    && dpkg -i tinygo_${TINYGO_VERSION}_amd64.deb \
    && rm tinygo_${TINYGO_VERSION}_amd64.deb

# Install Node.js (using NodeSource repository)
ENV NODE_VERSION=24.7.0
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs=${NODE_VERSION}* \
    && npm install -g npm@latest

# Install Poetry
RUN pip3 install --break-system-packages poetry

# Install WebAssembly tools
RUN apt-get update && apt-get install -y \
    wabt \
    binaryen \
    && rm -rf /var/lib/apt/lists/*

# Install Puppeteer dependencies (browser automation)
RUN apt-get update && apt-get install -y \
    fonts-liberation \
    libasound2 \
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
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# =============================================================================
# Second Stage: Runtime Environment (Minimal Image)
# =============================================================================
FROM ubuntu:24.04

# Avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install runtime system dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    libffi8 \
    libblas3 \
    liblapack3 \
    libatlas3-base \
    libfreetype6 \
    libpng16-16 \
    fonts-liberation \
    libasound2 \
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
    xdg-utils \
    curl \
    git \
    make \
    && rm -rf /var/lib/apt/lists/*

# Copy installed toolchains from build stage
COPY --from=builder /usr/local/go /usr/local/go
COPY --from=builder /usr/local/cargo /usr/local/cargo
COPY --from=builder /usr/local/rustup /usr/local/rustup
COPY --from=builder /usr/local/tinygo /usr/local/tinygo
COPY --from=builder /usr/bin/node /usr/bin/node
COPY --from=builder /usr/bin/npm /usr/bin/npm
COPY --from=builder /usr/bin/python3.13 /usr/bin/python3.13
COPY --from=builder /usr/bin/pip3 /usr/bin/pip3
COPY --from=builder /usr/local/bin/poetry /usr/local/bin/poetry
COPY --from=builder /usr/bin/wasm-strip /usr/bin/wasm-strip
COPY --from=builder /usr/bin/wasm-opt /usr/bin/wasm-opt

# Create symbolic links
RUN ln -sf /usr/bin/python3.13 /usr/bin/python3 && \
    ln -sf /usr/bin/python3.13 /usr/bin/python

# Set environment variables
ENV PATH=/usr/local/go/bin:/usr/local/cargo/bin:/usr/local/tinygo/bin:$PATH \
    PYTHONPATH=/app \
    NODE_ENV=development \
    RUSTUP_HOME=/usr/local/rustup \
    CARGO_HOME=/usr/local/cargo \
    GO_VERSION=1.25.0 \
    RUST_VERSION=1.89.0 \
    TINYGO_VERSION=0.39.0 \
    NODE_VERSION=24.7.0 \
    PYTHON_VERSION=3.13.5

# Create working directory
WORKDIR /app

# Create non-root user and set permissions
RUN useradd -m -s /bin/bash benchmark && \
    usermod -a -G benchmark benchmark && \
    mkdir -p /app/results /app/reports /app/builds && \
    chown -R benchmark:benchmark /app

# Switch to non-root user
USER benchmark

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python3 --version && node --version && rustc --version && tinygo version && go version

# Default startup command
CMD ["/bin/bash"]