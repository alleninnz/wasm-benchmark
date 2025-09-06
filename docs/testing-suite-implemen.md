# Test Suite Documentation

## Overview

This test suite implements the testing strategy from `docs/testing-strategy-guide.md` with a focus on **scientific rigor** and **cross-language consistency validation** for WebAssembly performance experiments.

## Test Architecture (80/20 Strategy)

```
tests/
├── unit/                           # 20% - Pure logic tests
│   ├── config-parser.test.js      # Configuration parsing and validation
│   ├── statistics.test.js         # Statistical calculations and power analysis  
│   └── data-conversion.test.js    # Data transformations and format conversions
│
├── integration/                    # 70% - Service coordination tests
│   ├── cross-language.test.js     # Cross-language consistency validation
│   ├── experiment-pipeline.test.js# Complete experiment workflow
│   ├── parallel-execution.test.js # Concurrent execution and resource management
│   └── error-recovery.test.js     # Error handling and system resilience
│
├── e2e/                           # 10% - End-to-end validation
│   └── full-benchmark.test.js     # Complete benchmark suite execution
│
└── utils/                         # Test utilities
    ├── test-data-generator.js     # Deterministic data generation
    ├── statistical-power.js       # Power analysis and significance testing
    ├── browser-test-harness.js    # Shared browser setup/teardown
    └── test-assertions.js         # Standardized assertion patterns
```

## Quick Start

### Running Tests

```bash
# Quick feedback loop (< 1 minute)
npm run test:unit:quick

# Cross-language validation (< 5 minutes)  
npm run test:integration

# Pre-experiment validation (< 10 minutes)
npm run test:experiment-ready

# Full statistical validation (< 15 minutes)
npm run test:full

# Coverage analysis
npm run test:coverage
```

### Test Categories

| Command | Purpose | Timeout | Use Case |
|---------|---------|---------|----------|
| `test:unit` | Pure logic validation | 5s | Development feedback |
| `test:smoke` | Basic functionality check | 10s | Quick CI validation |
| `test:integration` | Cross-component testing | 60s | Pre-commit validation |
| `test:e2e` | Full workflow validation | 5min | Release validation |
| `test:statistical` | Power analysis validation | 10min | Experiment design |

## Test Strategy Implementation

### 1. **Real Browser Testing** ✅
- Uses **Puppeteer** with real browser instances (not mocks)
- Essential for WebAssembly performance accuracy
- Validates `performance.now()` precision and V8 optimization behavior

### 2. **Cross-Language Consistency** ✅
- **Hash validation** ensures Rust and TinyGo produce identical results
- **Tolerance = 0** for algorithm correctness (no approximations)
- Validates computational consistency across implementations

### 3. **Deterministic Data Generation** ✅
- **Fixed seeds** ensure reproducible test results
- **Scale configurations**: micro (dev), small (CI), medium (nightly), large (manual)
- **Cross-platform consistency** for collaborative development

### 4. **Statistical Rigor** ✅
- **Power analysis** validates experimental design adequacy
- **Effect size calculation** (Cohen's d) for meaningful differences
- **Sample size recommendations** for statistical validity

## Key Test Utilities

### BrowserTestHarness

Standardized browser setup eliminates code duplication:

```javascript
import { BrowserTestHarness, TEST_CONFIGS } from '../utils/browser-test-harness.js';

describe('My Integration Test', () => {
  let harness;
  
  beforeEach(async () => {
    harness = new BrowserTestHarness(TEST_CONFIGS.integration);
    await harness.setup();
  });
  
  afterEach(async () => {
    await harness.teardown();
  });
  
  test('should execute task consistently', async () => {
    const result = await harness.executeTask('mandelbrot', 'rust', testData);
    // harness handles browser lifecycle automatically
  });
});
```

### Standardized Assertions

Consistent validation patterns with contextual error messages:

```javascript
import { assertBenchmarkResult, assertCrossLanguageConsistency } from '../utils/test-assertions.js';

test('should validate benchmark quality', async () => {
  const rustResult = await harness.executeTask('mandelbrot', 'rust', data);
  const tinygoResult = await harness.executeTask('mandelbrot', 'tinygo', data);
  
  // Comprehensive result validation
  assertBenchmarkResult(rustResult, expectedHash, { task: 'mandelbrot', language: 'rust' });
  assertBenchmarkResult(tinygoResult, expectedHash, { task: 'mandelbrot', language: 'tinygo' });
  
  // Cross-language consistency check
  assertCrossLanguageConsistency(rustResult, tinygoResult, 'mandelbrot');
});
```

### Statistical Validation

Built-in power analysis and significance testing:

```javascript
import { assertStatisticalPower, assertStatisticalSignificance } from '../utils/test-assertions.js';

test('should meet statistical requirements', async () => {
  const pilotData = { rust: rustTimes, tinygo: tinygoTimes };
  
  // Validate experimental design
  const powerAnalysis = assertStatisticalPower(pilotData, {
    targetEffectSize: 0.2,  // Detect 20% difference
    targetPower: 0.8,       // 80% statistical power
    requireSufficientPower: true
  });
  
  // Test for significant difference
  assertStatisticalSignificance(rustTimes, tinygoTimes, {
    alpha: 0.05,
    group1Name: 'Rust',
    group2Name: 'TinyGo'
  });
});
```

## Quality Standards

### **Scientific Validity Metrics** ✅
- Cross-language hash consistency = 100%
- Data collection success rate ≥ 95%  
- Performance measurement CV ≤ 15%

### **System Reliability Metrics** ✅
- Error recovery success rate ≥ 90%
- Concurrent execution control = 100%
- Memory leak detection passing

### **Data Quality Metrics** ✅
- Outlier detection accuracy ≥ 95%
- Statistical analysis pipeline error-free
- Result file format compliance = 100%

## Configuration

### Environment Variables

```bash
# Test execution level
export TEST_LEVEL=integration  # unit|integration|e2e

# CI optimizations
export CI=true  # Reduces concurrency and enables retries

# Browser configuration
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true  # Skip download in CI
```

### Test Timeouts

| Test Type | Default | Override Example |
|-----------|---------|------------------|
| Unit | 5s | `--testTimeout=5000` |
| Integration | 60s | `--testTimeout=60000` |
| E2E | 5min | `--testTimeout=300000` |
| Statistical | 10min | `--testTimeout=600000` |

## Development Workflow

### 1. **Adding New Tests**

1. Choose appropriate test level (unit/integration/e2e)
2. Use shared utilities (`BrowserTestHarness`, test assertions)
3. Follow naming convention: `feature.test.js`
4. Add timeout appropriate to test complexity
5. Include contextual error messages

### 2. **Test Data Strategy**

- **Unit Tests**: Use `DeterministicTestDataGenerator` with fixed seeds
- **Integration Tests**: Use shared test configurations (smoke/integration/stress)  
- **E2E Tests**: Use realistic data scales matching experiment requirements

### 3. **Debugging Failed Tests**

```bash
# Run with detailed logging
npm run test:integration -- --reporter=verbose

# Debug specific test
npm run test:watch -- --grep="cross-language consistency"

# Generate coverage report
npm run test:coverage:unit
```

## Best Practices

### ✅ **Do**
- Use `BrowserTestHarness` for browser-based tests
- Apply standardized assertions with contextual messages
- Generate deterministic test data with fixed seeds
- Validate cross-language consistency for all algorithm tests
- Include statistical power analysis for performance comparisons

### ❌ **Don't**
- Mock WebAssembly or browser APIs (breaks performance accuracy)
- Skip cross-language validation (violates scientific rigor)
- Use random test data (breaks reproducibility)
- Ignore timeout configurations (causes flaky tests)
- Skip statistical validation (reduces experiment credibility)

## Troubleshooting

### Common Issues

**Browser setup failures:**
```bash
# Check if server is running
curl -s http://localhost:3001/bench.html

# Install browser dependencies
npm run serve &  # Start in background
npm run test:smoke  # Verify basic functionality
```

**Memory pressure issues:**
```bash
# Reduce test concurrency
npm run test:integration -- --maxConcurrency=1

# Monitor system resources
npm run test:coverage -- --reporter=verbose
```

**Statistical test failures:**
```bash
# Run with larger sample size
npm run test:statistical -- --grep="power analysis" --testTimeout=900000

# Check experimental environment
npm run test:e2e -- --grep="system validation"
```

## Contributing

When contributing new tests:

1. Follow the 80/20 testing strategy (integration-heavy)
2. Maintain cross-language consistency validation  
3. Use shared utilities to reduce code duplication
4. Include comprehensive error messaging
5. Add appropriate timeouts and test categorization
6. Validate statistical assumptions for performance tests

For questions about test strategy or implementation, refer to `docs/testing-strategy-guide.md`.