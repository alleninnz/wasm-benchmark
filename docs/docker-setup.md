# Docker Containerization for WebAssembly Benchmark

This directory contains Docker configuration files for running the WebAssembly benchmark project in a containerized environment.

## Files

- `Dockerfile` - Multi-stage Docker build configuration
- `docker-compose.yml` - Docker Compose configuration for easy container management
- `scripts/docker-run.sh` - Convenience script for running common commands
- `.dockerignore` - Files to exclude from Docker build context

## Quick Start

### Prerequisites

- Docker (20.10+)
- Docker Compose (2.0+)

### Run Complete Pipeline

```bash
# Run the complete benchmark pipeline
./scripts/docker-run.sh full

# Or step by step:
./scripts/docker-run.sh start    # Build and start container
./scripts/docker-run.sh init     # Initialize environment
./scripts/docker-run.sh build    # Build WebAssembly modules
./scripts/docker-run.sh run      # Run benchmarks
./scripts/docker-run.sh analyze  # Run analysis
```

### Development Shell

```bash
# Enter container for development
./scripts/docker-run.sh shell
```

### Available Commands

```bash
./scripts/docker-run.sh help
```

## Architecture

### Multi-Stage Build

The Dockerfile uses a multi-stage build approach:

1. **Builder Stage**: Installs all development tools and dependencies
2. **Runtime Stage**: Contains only the necessary runtime components

This approach significantly reduces the final image size while maintaining full functionality.

### Volume Mounts

The following directories are mounted as volumes to persist data:

- `./results` - Benchmark test results
- `./reports` - Analysis reports and plots
- `./builds` - WebAssembly build artifacts
- `./configs` - Configuration files (read-only)
- `./data` - Reference data (read-only)

### Tool Versions

The container includes specific versions of all required tools:

- Rust: 1.89.0
- TinyGo: 0.39.0
- Go: 1.25.0
- Node.js: 24.7.0
- Python: 3.13.5

## Troubleshooting

### Build Issues

If the build fails, try cleaning the Docker cache:

```bash
./scripts/docker-run.sh clean
./scripts/docker-run.sh start
```

### Permission Issues

The container runs as a non-root user `benchmark`. If you encounter permission issues with mounted volumes, ensure the host directories have appropriate permissions.

### Memory Issues

The container is configured with memory limits. If you need more resources, adjust the limits in `docker-compose.yml`.

## Development Workflow

1. Make changes to source code on host
2. Run `./scripts/docker-run.sh build` to rebuild WebAssembly modules
3. Run `./scripts/docker-run.sh run quick` for fast testing
4. Access results in `./results` and `./reports` directories

## CI/CD Integration

This Docker setup is designed to work well with CI/CD pipelines. The containerized environment ensures consistent builds across different systems.
