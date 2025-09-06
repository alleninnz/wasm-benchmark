import { beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Global test configuration based on strategy
const testConfig = {
  // Test configurations as per testing strategy
  smoke: { scales: ['micro'], runs: 3 },
  integration: { scales: ['small'], runs: 10 },
  stress: { scales: ['medium'], runs: 50 }
};

// Test data generator with fixed seeds for reproducibility
const testDataGenerator = {
  mandelbrot: { 
    seed: 12345,
    width: 64, height: 64, maxIter: 100 
  },
  jsonParse: {
    seed: 67890,
    records: 100,
    schema: 'fixed'
  },
  matrixMul: {
    seed: 54321,
    size: 32
  }
};

// Browser configuration for real puppeteer instances
const testBrowserConfig = {
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  timeout: 30000
};

// Validation rules from strategy
const validationRules = {
  hashConsistency: {
    tolerance: 0 // Must be exact match
  },
  executionTime: {
    min: 0.1,
    max: 30000,
    variationCoeff: 0.3
  },
  memoryUsage: {
    min: 0,
    max: 100 * 1024 * 1024, // 100MB
    growth: 'bounded'
  }
};

// Global variables for test state
global.testTempDir = null;
global.testConfig = testConfig;
global.testDataGenerator = testDataGenerator;
global.testBrowserConfig = testBrowserConfig;
global.validationRules = validationRules;

// Test setup hooks
beforeEach(async (context) => {
  // Create temporary directory for each test suite
  global.testTempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'wasm-bench-test-')
  );
});

afterEach(async () => {
  // Clean up temporary directory
  if (global.testTempDir) {
    try {
      await fs.rm(global.testTempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error.message);
    }
    global.testTempDir = null;
  }
});

// Global error handler for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit in test environment, but log for debugging
});