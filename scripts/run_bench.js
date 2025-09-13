/**
 * Pure Service-Oriented Benchmark Runner
 * Clean architecture with dependency injection
 */

import { ConfigurationService } from './services/ConfigurationService.js';
import { BrowserService } from './services/BrowserService.js';
import { ResultsService } from './services/ResultsService.js';
import { BenchmarkOrchestrator } from './services/BenchmarkOrchestrator.js';
import { LoggingService } from './services/LoggingService.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// Configuration constants
const DEFAULT_TIMEOUT_MS = 300000;
const QUICK_TIMEOUT_MS = 30000;
const DEFAULT_MAX_PARALLEL = 4;
const DEFAULT_FAILURE_THRESHOLD = 0.3;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Parse and validate CLI argument value
 */
function parseArgumentValue(args, prefix, parser, defaultValue, validator = null) {
    const arg = args.find(arg => arg.startsWith(prefix));
    if (!arg) return defaultValue;

    const value = parser(arg.split('=')[1]);
    if (isNaN(value)) {
        console.warn(`Invalid ${prefix} value, using default: ${defaultValue}`);
        return defaultValue;
    }

    if (validator && !validator(value)) {
        console.warn(`${prefix} value out of range, using default: ${defaultValue}`);
        return defaultValue;
    }

    return value;
}

/**
 * Parse CLI options with validation
 */
function parseOptions(args) {
    const isQuick = args.includes('--quick');

    return {
        headless: !args.includes('--headed'),
        devtools: args.includes('--devtools'),
        verbose: args.includes('--verbose'),
        parallel: args.includes('--parallel'),
        quick: isQuick,
        timeout: parseArgumentValue(
            args,
            '--timeout=',
            parseInt,
            isQuick ? QUICK_TIMEOUT_MS : DEFAULT_TIMEOUT_MS,
            val => val > 0 && val <= 600000
        ),
        maxParallel: parseArgumentValue(
            args,
            '--max-concurrent=',
            parseInt,
            DEFAULT_MAX_PARALLEL,
            val => val > 0 && val <= 20
        ),
        failureThreshold: parseArgumentValue(
            args,
            '--failure-threshold=',
            parseFloat,
            DEFAULT_FAILURE_THRESHOLD,
            val => val >= 0 && val <= 1
        )
    };
}

/**
 * Main CLI entry point using pure service-oriented architecture
 */
async function main() {
    const args = process.argv.slice(2);
    const options = parseOptions(args);

    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
Usage: node run_bench.js [options]

Options:
  --headed                    Run in headed mode (show browser)
  --devtools                  Open browser DevTools
  --verbose                   Enable verbose logging
  --parallel                  Enable parallel benchmark execution
  --quick                     Use quick configuration for fast development testing
  --timeout=<ms>              Set timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS}, quick: ${QUICK_TIMEOUT_MS})
  --max-concurrent=<n>        Max concurrent benchmarks in parallel mode (default: ${DEFAULT_MAX_PARALLEL}, max: 20)
  --failure-threshold=<rate>  Failure threshold rate 0-1 (default: ${DEFAULT_FAILURE_THRESHOLD})
  --help, -h                  Show this help message

Examples:
  node run_bench.js                                # Run headless sequential
  node run_bench.js --headed                       # Run with visible browser
  node run_bench.js --quick                        # Quick development testing (fast)
  node run_bench.js --verbose                      # Enable verbose output
  node run_bench.js --parallel                     # Run benchmarks in parallel
  node run_bench.js --quick --verbose              # Quick testing with verbose output
  node run_bench.js --parallel --max-concurrent=5  # Parallel with 5 concurrent
  node run_bench.js --failure-threshold=0.1        # Conservative failure rate
        `);
        return;
    }

    // Initialize services with dependency injection
    const logger = new LoggingService({
        logLevel: options.verbose ? 'debug' : 'info',
        enableColors: true,
        enableTimestamp: false
    });

    const configService = new ConfigurationService();
    const browserService = new BrowserService();
    const resultsService = new ResultsService();
    const orchestrator = new BenchmarkOrchestrator(configService, browserService, resultsService);

    try {
        logger.section('Initializing Pure Service Architecture');

        // Initialize orchestrator with appropriate config
        const configFilename = options.quick ? 'bench-quick.json' : 'bench.json';
        const configPath = path.join(__dirname, '..', 'configs', configFilename);

        // Ensure config exists
        if (!fs.existsSync(configPath)) {
            logger.error(`Configuration file not found: ${configPath}`);
            logger.info(`Please run: npm run build:config${options.quick ? ' -- --quick' : ''}`);
            process.exit(1);
        }

        await orchestrator.initialize(configPath);

        // Execute benchmarks
        const results = await orchestrator.executeBenchmarks(options);

        // Save results with local timezone
        const now = new Date();
        const timestamp = now.getFullYear() + '-' + 
            String(now.getMonth() + 1).padStart(2, '0') + '-' +
            String(now.getDate()).padStart(2, '0') + 'T' +
            String(now.getHours()).padStart(2, '0') + '-' +
            String(now.getMinutes()).padStart(2, '0') + '-' +
            String(now.getSeconds()).padStart(2, '0') + '-' +
            String(now.getMilliseconds()).padStart(3, '0') + 'Z';
        const outputPath = path.join(__dirname, '..', 'results', `${timestamp}.json`);
        await orchestrator.saveResults(outputPath, 'json');

        logger.section('Benchmark Process Completed Successfully');
        logger.success(`Results saved to: ${outputPath}`);
        logger.success(`Total benchmarks: ${results.summary.totalTasks}`);
        logger.success(`Successful: ${results.summary.successfulTasks}`);
        logger.success(`Success rate: ${(results.summary.successRate * 100).toFixed(1)}%`);

        if (results.summary.failedTasks > 0) {
            logger.warn(`Failed: ${results.summary.failedTasks}`);
        }

        process.exit(0);

    } catch (error) {
        logger.error(`Process failed: ${error.message}`);
        if (options.verbose) {
            console.error(error.stack);
        }

        // Emergency cleanup
        try {
            await orchestrator.emergencyCleanup();
        } catch (cleanupError) {
            logger.error(`Emergency cleanup failed: ${cleanupError.message}`);
        }

        process.exit(1);
    } finally {
        // Graceful cleanup
        try {
            await orchestrator.cleanup();
        } catch (cleanupError) {
            logger.warn(`Cleanup warning: ${cleanupError.message}`);
        }
    }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

// Export services for external use
export {
    ConfigurationService,
    BrowserService,
    ResultsService,
    BenchmarkOrchestrator,
    LoggingService
};
