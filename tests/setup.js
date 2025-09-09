import { beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { validateServerIfNeeded } from './utils/server-checker.js';

// Constants for validation and configuration
const TEST_CONFIG_CONSTANTS = {
  MIN_RUNS: 1,
  MAX_RUNS: 1000,
  VALID_SCALES: ['micro', 'small', 'medium', 'large'],
  VALID_TEST_TYPES: ['smoke', 'integration', 'stress'],
  DEFAULT_TIMEOUT: 30000,
  MAX_TIMEOUT: 600000, // 10 minutes
  MIN_PORT: 1024,
  MAX_PORT: 65535
};

// Memory calculation constants
const MEMORY_CONSTANTS = {
  MACOS_ARM_PAGE_SIZE: 16384,    // Apple Silicon page size
  MACOS_INTEL_PAGE_SIZE: 4096,   // Intel Mac page size
  LINUX_PAGE_SIZE: 4096,         // Standard Linux page size
  INACTIVE_MEMORY_FACTOR: 0.5,   // Conservative estimate for reclaimable inactive memory
  MACOS_CACHE_BUFFER_ADJUSTMENT: 20, // Percentage to account for caches on macOS
  LINUX_CACHE_BUFFER_ADJUSTMENT: 15, // Percentage to account for caches on Linux
  HIGH_MEMORY_THRESHOLD: 95       // Percentage threshold for memory pressure warning
};

/**
 * Detects macOS page size by checking system architecture
 * @returns {number} Page size in bytes
 */
function getMacOSPageSize() {
  try {
    const arch = execSync('uname -m', { encoding: 'utf8' }).trim();
    // Apple Silicon uses 16KB pages, Intel uses 4KB pages
    return arch === 'arm64' ? MEMORY_CONSTANTS.MACOS_ARM_PAGE_SIZE : MEMORY_CONSTANTS.MACOS_INTEL_PAGE_SIZE;
  } catch {
    // Default to Intel page size if detection fails
    return MEMORY_CONSTANTS.MACOS_INTEL_PAGE_SIZE;
  }
}

/**
 * Parses vm_stat output to extract page counts
 * @param {string} line - Line from vm_stat output
 * @returns {number} Number of pages
 */
function parseVmStatPages(line) {
  const match = line.match(/(\d+)\./);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Gets memory usage on macOS using vm_stat
 * @param {number} totalMem - Total system memory in bytes
 * @param {number} freeMem - Free memory from os.freemem() (fallback)
 * @returns {number} Memory usage percentage
 */
function getMacOSMemoryUsage(totalMem, freeMem) {
  try {
    const vmstat = execSync('vm_stat', { encoding: 'utf8', timeout: 5000 });
    const lines = vmstat.split('\n');
    
    const pageSize = getMacOSPageSize();
    const freePages = parseVmStatPages(lines.find(l => l.includes('Pages free:')) || '');
    const purgeable = parseVmStatPages(lines.find(l => l.includes('Pages purgeable:')) || '');
    const inactive = parseVmStatPages(lines.find(l => l.includes('Pages inactive:')) || '');
    
    // Available memory = free + purgeable + conservative estimate of reclaimable inactive pages
    const availablePages = freePages + purgeable + Math.floor(inactive * MEMORY_CONSTANTS.INACTIVE_MEMORY_FACTOR);
    const availableMem = availablePages * pageSize;
    const usedMem = Math.max(0, totalMem - availableMem);
    
    return (usedMem / totalMem) * 100;
  } catch (error) {
    console.warn(`vm_stat command failed: ${error.message}. Using conservative estimate.`);
    // Fallback to conservative estimate accounting for OS caches
    return Math.max(0, ((totalMem - freeMem) / totalMem) * 100 - MEMORY_CONSTANTS.MACOS_CACHE_BUFFER_ADJUSTMENT);
  }
}

/**
 * Gets memory usage on Linux by parsing /proc/meminfo
 * @param {number} totalMem - Total system memory in bytes
 * @param {number} freeMem - Free memory from os.freemem() (fallback)
 * @returns {number} Memory usage percentage
 */
function getLinuxMemoryUsage(totalMem, freeMem) {
  try {
    const meminfo = execSync('cat /proc/meminfo', { encoding: 'utf8', timeout: 5000 });
    const lines = meminfo.split('\n');
    
    // Parse memory values (in kB)
    const getValue = (key) => {
      const line = lines.find(l => l.startsWith(key));
      const match = line?.match(/(\d+)/);
      return match ? parseInt(match[1], 10) * 1024 : 0; // Convert kB to bytes
    };
    
    const memTotal = getValue('MemTotal:');
    const memAvailable = getValue('MemAvailable:') || getValue('MemFree:');
    
    if (memTotal && memAvailable) {
      const usedMem = Math.max(0, memTotal - memAvailable);
      return (usedMem / memTotal) * 100;
    }
    
    // Fallback if parsing fails
    throw new Error('Could not parse /proc/meminfo');
  } catch (error) {
    console.warn(`/proc/meminfo parsing failed: ${error.message}. Using conservative estimate.`);
    // Fallback to conservative estimate accounting for OS caches
    return Math.max(0, ((totalMem - freeMem) / totalMem) * 100 - MEMORY_CONSTANTS.LINUX_CACHE_BUFFER_ADJUSTMENT);
  }
}

/**
 * Gets accurate memory usage based on the current platform
 * @param {number} totalMem - Total system memory in bytes
 * @param {number} freeMem - Free memory from os.freemem()
 * @returns {number} Memory usage percentage
 */
function getMemoryUsageByPlatform(totalMem, freeMem) {
  switch (process.platform) {
    case 'darwin':
      return getMacOSMemoryUsage(totalMem, freeMem);
    case 'linux':
      return getLinuxMemoryUsage(totalMem, freeMem);
    case 'win32':
      // Windows: os.freemem() is generally more accurate, but still conservative
      return Math.max(0, ((totalMem - freeMem) / totalMem) * 100 - 10);
    default:
      console.warn(`Unsupported platform: ${process.platform}. Using basic calculation.`);
      return Math.max(0, ((totalMem - freeMem) / totalMem) * 100);
  }
}

// Global test configuration based on strategy
const testConfig = {
  // Test configurations as per testing strategy
  smoke: { scales: ['micro'], runs: 3 },
  integration: { scales: ['small'], runs: 10 },
  stress: { scales: ['medium'], runs: 50 }
};

// Validate test configuration
function validateTestConfig(config) {
  for (const [testType, settings] of Object.entries(config)) {
    if (!TEST_CONFIG_CONSTANTS.VALID_TEST_TYPES.includes(testType)) {
      throw new Error(`Invalid test type: ${testType}. Valid types: ${TEST_CONFIG_CONSTANTS.VALID_TEST_TYPES.join(', ')}`);
    }
    
    if (!settings.scales || !Array.isArray(settings.scales)) {
      throw new Error(`Test type ${testType} must have a scales array`);
    }
    
    for (const scale of settings.scales) {
      if (!TEST_CONFIG_CONSTANTS.VALID_SCALES.includes(scale)) {
        throw new Error(`Invalid scale "${scale}" in ${testType}. Valid scales: ${TEST_CONFIG_CONSTANTS.VALID_SCALES.join(', ')}`);
      }
    }
    
    if (typeof settings.runs !== 'number' || 
        settings.runs < TEST_CONFIG_CONSTANTS.MIN_RUNS || 
        settings.runs > TEST_CONFIG_CONSTANTS.MAX_RUNS) {
      throw new Error(`Test type ${testType} runs must be between ${TEST_CONFIG_CONSTANTS.MIN_RUNS} and ${TEST_CONFIG_CONSTANTS.MAX_RUNS}`);
    }
  }
}

// Validate configuration
validateTestConfig(testConfig);

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

// Test server configuration with validation
const TEST_PORT = (() => {
  const port = parseInt(process.env.PORT || '2025', 10);
  if (isNaN(port) || port < TEST_CONFIG_CONSTANTS.MIN_PORT || port > TEST_CONFIG_CONSTANTS.MAX_PORT) {
    throw new Error(`Invalid TEST_PORT: ${process.env.PORT}. Must be between ${TEST_CONFIG_CONSTANTS.MIN_PORT} and ${TEST_CONFIG_CONSTANTS.MAX_PORT}`);
  }
  return port;
})();

const TEST_BASE_URL = `http://localhost:${TEST_PORT}`;

// Browser configuration for real puppeteer instances
const testBrowserConfig = {
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  timeout: TEST_CONFIG_CONSTANTS.DEFAULT_TIMEOUT,
  // Add additional safety configurations
  defaultViewport: { width: 1280, height: 720 },
  ignoreHTTPSErrors: false,
  slowMo: 0 // No artificial delays in tests
};

// Validate browser configuration
function validateBrowserConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('Browser configuration must be an object');
  }
  
  if (typeof config.headless !== 'boolean') {
    throw new Error('Browser config headless must be a boolean');
  }
  
  if (!Array.isArray(config.args)) {
    throw new Error('Browser config args must be an array');
  }
  
  if (typeof config.timeout !== 'number' || 
      config.timeout <= 0 || 
      config.timeout > TEST_CONFIG_CONSTANTS.MAX_TIMEOUT) {
    throw new Error(`Browser config timeout must be between 1 and ${TEST_CONFIG_CONSTANTS.MAX_TIMEOUT}ms`);
  }
}

// Validate browser configuration
validateBrowserConfig(testBrowserConfig);

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
global.TEST_PORT = TEST_PORT;
global.TEST_BASE_URL = TEST_BASE_URL;

// Test setup hooks with improved error handling
beforeEach(async (context) => {
  try {
    // Create temporary directory for each test suite
    const tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'wasm-bench-test-')
    );
    
    // Validate temporary directory was created
    try {
      await fs.access(tempDir);
      global.testTempDir = tempDir;
    } catch (accessError) {
      throw new Error(`Failed to access created temporary directory: ${tempDir} - ${accessError.message}`);
    }
    
  } catch (error) {
    console.error('Failed to set up test environment:', error.message);
    throw new Error(`Test setup failed: ${error.message}`);
  }
});

afterEach(async () => {
  // Clean up temporary directory with improved error handling
  if (global.testTempDir) {
    const tempDir = global.testTempDir;
    global.testTempDir = null; // Clear reference first
    
    try {
      // Check if directory exists before attempting cleanup
      await fs.access(tempDir);
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Log warning but don't fail the test
      console.warn(`Failed to clean up temp directory ${tempDir}:`, error.message);
    }
  }
});

// Enhanced global error handler for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection at:', promise);
  console.error('Reason:', reason);
  
  // In test environment, log stack trace for better debugging
  if (reason instanceof Error) {
    console.error('Stack trace:', reason.stack);
  }
  
  // Don't exit in test environment, but provide detailed logging
});

// Handle uncaught exceptions in test environment
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message);
  console.error('Stack trace:', error.stack);
  
  // In test environment, don't exit immediately but log for debugging
  console.error('This error should be handled properly in test code');
});

// Environment validation on module load
function validateTestEnvironment() {
  const errors = [];
  
  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  if (majorVersion < 16) {
    errors.push(`Node.js version ${nodeVersion} is unsupported. Minimum version: 16.x`);
  }
  
  // Check if temp directory is writable
  try {
    const tmpDir = os.tmpdir();
    if (!tmpDir) {
      errors.push('System temporary directory is not available');
    }
  } catch (error) {
    errors.push(`Cannot access system temporary directory: ${error.message}`);
  }
  
  // Check memory availability with accurate calculation
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  
  // More accurate memory calculation that excludes OS caches and buffers
  // On macOS/Linux, we need to account for available memory, not just free memory
  const getActualMemoryUsage = () => {
    return getMemoryUsageByPlatform(totalMem, freeMem);
  };
  
  const memoryUsagePercent = getActualMemoryUsage();
  
  // Only warn if actual memory pressure is detected (raised threshold)
  if (memoryUsagePercent > MEMORY_CONSTANTS.HIGH_MEMORY_THRESHOLD) {
    errors.push(`High memory usage detected: ${memoryUsagePercent.toFixed(1)}%. Tests may be unreliable.`);
  }
  
  if (errors.length > 0) {
    console.error('Test environment validation failed:');
    errors.forEach(error => console.error(`  - ${error}`));
    throw new Error(`Test environment is not suitable: ${errors.join('; ')}`);
  }
  
  console.log(`Test environment validated successfully (Node.js ${nodeVersion}, ${(freeMem / 1024 / 1024 / 1024).toFixed(1)}GB free memory)`);
}

// Validate environment on module load
validateTestEnvironment();

// Smart server validation for integration and e2e tests
beforeAll(async () => {
  try {
    const testLevel = process.env.WASM_BENCH_TEST_LEVEL || 'integration';
    await validateServerIfNeeded({
      port: TEST_PORT,
      testContext: testLevel,
      silent: false
    });
  } catch (error) {
    console.error(`\n${error.message}\n`);
    process.exit(1);
  }
});