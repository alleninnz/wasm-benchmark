import fsSync from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { beforeAll, beforeEach } from 'vitest';
import { validateServerIfNeeded } from './utils/server-checker.js';

// Constants for validation and configuration
const TEST_CONFIG_CONSTANTS = {
    MIN_RUNS: 1,
    MAX_RUNS: 1000,
    VALID_SCALES: ['micro', 'small', 'medium', 'large'],
    VALID_TEST_TYPES: ['smoke', 'integration'],
    DEFAULT_TIMEOUT: 30000,
    MAX_TIMEOUT: 600000, // 10 minutes
    MIN_PORT: 1024,
    MAX_PORT: 65535,
    MIN_FREE_MEMORY_PERCENT: 1 // Minimum 1% free memory required (basic availability check)
};


// Global test configuration based on strategy
const testConfig = {
    // Test configurations as per testing strategy
    smoke: { scales: ['micro'], runs: 3 },
    integration: { scales: ['small'], runs: 10 }
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
        variationCoeff: 0.6  // Adjusted to 0.6 for WASM micro-benchmark browser variability
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

// Environment validation - only run once globally across all workers
function validateTestEnvironment() {
    // Use file system lock to prevent multiple validations across vitest workers
    const lockFile = path.join(os.tmpdir(), '.wasm-bench-test-env-validated');

    try {
    // Check if validation already completed by another worker
        if (fsSync.existsSync(lockFile)) {
            return; // Skip if already validated
        }
    } catch (e) {
    // Ignore file system errors, proceed with validation
    }

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

    // Basic memory availability check (simplified)
    const totalMem = os.totalmem();
    if (totalMem < 1024 * 1024 * 1024) { // Only error if less than 1GB total system memory
        errors.push(`Insufficient total memory: ${(totalMem / 1024 / 1024 / 1024).toFixed(1)}GB. Need at least 1GB.`);
    }

    if (errors.length > 0) {
        console.error('Test environment validation failed:');
        errors.forEach(error => console.error(`  - ${error}`));
        throw new Error(`Test environment is not suitable: ${errors.join('; ')}`);
    }
    
    // Create lock file to prevent other workers from validating again
    try {
        fsSync.writeFileSync(lockFile, 'validated', 'utf8');
    } catch (e) {
    // Ignore file system errors
    }
}

// Validate environment on module load
validateTestEnvironment();

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

// Smart server validation for integration
beforeAll(async () => {
    try {
        const testLevel = process.env.WASM_BENCH_TEST_LEVEL || 'integration';
        await validateServerIfNeeded({
            port: TEST_PORT,
            testContext: testLevel,
            silent: false
        });
    } catch (error) {
        console.error(`
${error.message}
`);
        process.exit(1);
    }
});
