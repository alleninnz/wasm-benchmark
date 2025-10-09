import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',

        // Enhanced timeout strategy
        testTimeout: 30000,
        hookTimeout: 10000,

        // Setup and teardown
        setupFiles: ['./tests/setup.js'],

        // Enhanced coverage configuration
        coverage: {
            provider: 'c8',
            reporter: ['text', 'json', 'html', 'lcov'],
            reportsDirectory: './coverage',
            exclude: [
                'node_modules/**',
                'tests/**',
                'builds/**',
                'tasks/**/target/**',
                '*.config.js',
                'scripts/**',
                'analysis/**',
                'configs/**'
            ],
            // Quality thresholds for code coverage
            thresholds: {
                lines: 80,
                functions: 80,
                branches: 70,
                statements: 80
            }
        },

        // Enhanced reporting - environment-aware
        reporters: process.env.VITEST_REPORTER === 'minimal'
            ? [['default', { summary: false }]]
            : ['verbose', 'json'],
        outputFile: {
            json: './test-results.json'
        },

        // Test file discovery
        include: [
            'tests/**/*.{test,spec}.{js,ts}'
        ],

        // Comprehensive exclusions
        exclude: [
            'node_modules/**',
            'builds/**',
            'tasks/**/target/**',
            'results/**',
            'coverage/**',
            '.git/**'
        ],

        // Optimized test execution
        pool: 'forks',
        poolOptions: {
            forks: {
                singleFork: process.env.CI === 'true' // Reduce resource usage in CI
            }
        },
        isolate: true,

        // Concurrent execution settings
        concurrent: true,
        maxConcurrency: process.env.CI ? 2 : 4, // Reduce concurrency in CI

        // Environment-specific configurations
        env: {
            NODE_ENV: 'test',
            CI: process.env.CI || 'false',
            WASM_BENCH_TEST_LEVEL: process.env.TEST_LEVEL || 'integration',
            PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: process.env.CI || 'false'
        },

        // Retry configuration for flaky tests
        retry: process.env.CI ? 1 : 0,

        // Watch mode configuration
        watch: {
            include: ['tests/**/*.{test,spec}.{js,ts}', 'scripts/**/*.js'],
            exclude: ['node_modules/**', 'builds/**', 'results/**']
        }
    }
});
