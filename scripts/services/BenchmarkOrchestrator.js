/**
 * Benchmark Orchestrator
 * Coordinates benchmark execution using injected services
 */

import { LoggingService } from './LoggingService.js';
import { IBenchmarkOrchestrator } from '../interfaces/IBenchmarkOrchestrator.js';

export class BenchmarkOrchestrator extends IBenchmarkOrchestrator {
    constructor(configService, browserService, resultsService, loggingService = null) {
        super();
        this.configService = configService;
        this.browserService = browserService;
        this.resultsService = resultsService;
        this.logger = loggingService || new LoggingService({ prefix: 'Orchestrator' });

        this.isRunning = false;
        this.abortController = null;
    }

    /**
     * Initialize the orchestrator
     * @param {string} configPath - Path to configuration file
     * @returns {Promise<void>}
     */
    async initialize(configPath) {
        try {
            // Load configuration
            await this.configService.loadConfig(configPath);

            // Initialize browser
            const browserConfig = this.configService.getBrowserConfig();
            await this.browserService.initialize(browserConfig);

            // Initialize results
            this.resultsService.initialize({
                configPath,
                browserConfig,
                timestamp: new Date().toISOString()
            });

            this.logger.success('Benchmark orchestrator initialized successfully');
        } catch (error) {
            throw new Error(`Failed to initialize orchestrator: ${error.message}`);
        }
    }

    /**
     * Execute all benchmarks
     * @param {Object} options - Execution options
     * @returns {Promise<Object>} Execution results
     */
    async executeBenchmarks(options = {}) {
        if (this.isRunning) {
            throw new Error('Benchmarks are already running');
        }

        this.isRunning = true;
        this.abortController = new AbortController();

        try {
            const config = this.configService.getConfig();
            const benchmarks = this.configService.getBenchmarks();
            const parallelConfig = this.configService.getParallelConfig();

            this.logger.info(`Starting execution of ${benchmarks.length} benchmarks...`);

            let results;
            if (parallelConfig.enabled && benchmarks.length > 1) {
                results = await this.executeInParallel(benchmarks, options);
            } else {
                results = await this.executeSequentially(benchmarks, options);
            }

            // Finalize results
            this.resultsService.finalize({
                executionMode: parallelConfig.enabled ? 'parallel' : 'sequential',
                totalBenchmarks: benchmarks.length,
                options
            });

            return {
                summary: this.resultsService.getSummary(),
                results: this.resultsService.getResults(),
                statistics: this.resultsService.getStatistics()
            };

        } catch (error) {
            this.logger.error('Benchmark execution failed:', error.message);
            throw error;
        } finally {
            this.isRunning = false;
            this.abortController = null;
        }
    }

    /**
     * Execute benchmarks in parallel
     * @param {Array} benchmarks - Benchmark configurations
     * @param {Object} options - Execution options
     * @returns {Promise<Array>} Execution results
     */
    async executeInParallel(benchmarks, options = {}) {
        const parallelConfig = this.configService.getParallelConfig();
        const maxParallel = Math.min(parallelConfig.maxParallel, benchmarks.length);

        this.logger.info(`Executing ${benchmarks.length} benchmarks in parallel (max ${maxParallel} concurrent)`);

        const results = [];
        const executing = new Set();
        let benchmarkIndex = 0;

        // Helper function to execute single benchmark
        const executeBenchmark = async (benchmark, index) => {
            try {
                const result = await this.executeSingleBenchmark(benchmark, {
                    ...options,
                    index,
                    total: benchmarks.length
                });
                results.push(result);
                return result;
            } catch (error) {
                const failedResult = {
                    benchmark: benchmark.name,
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                };
                results.push(failedResult);
                this.resultsService.addResult(failedResult);
                return failedResult;
            }
        };

        // Execute benchmarks with controlled concurrency
        while (benchmarkIndex < benchmarks.length || executing.size > 0) {
            // Start new benchmarks up to max parallel
            while (executing.size < maxParallel && benchmarkIndex < benchmarks.length) {
                const benchmark = benchmarks[benchmarkIndex];
                const promise = executeBenchmark(benchmark, benchmarkIndex);
                executing.add(promise);
                benchmarkIndex++;

                // Remove from executing set when done
                promise.finally(() => executing.delete(promise));
            }

            // Wait for at least one to complete
            if (executing.size > 0) {
                await Promise.race(executing);
            }
        }

        return results;
    }

    /**
     * Execute benchmarks sequentially
     * @param {Array} benchmarks - Benchmark configurations
     * @param {Object} options - Execution options
     * @returns {Promise<Array>} Execution results
     */
    async executeSequentially(benchmarks, options = {}) {
        this.logger.info(`Executing ${benchmarks.length} benchmarks sequentially`);

        const results = [];

        for (let i = 0; i < benchmarks.length; i++) {
            const benchmark = benchmarks[i];

            try {
                const result = await this.executeSingleBenchmark(benchmark, {
                    ...options,
                    index: i,
                    total: benchmarks.length
                });
                results.push(result);
            } catch (error) {
                const failedResult = {
                    benchmark: benchmark.name,
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                };
                results.push(failedResult);
                this.resultsService.addResult(failedResult);
            }
        }

        return results;
    }

    /**
     * Execute a single benchmark
     * @param {Object} benchmark - Benchmark configuration
     * @param {Object} options - Execution options
     * @returns {Promise<Object>} Benchmark result
     */
    async executeSingleBenchmark(benchmark, options = {}) {
        const startTime = Date.now();
        const timeout = this.configService.getTimeout();

        this.logger.progress(`Running benchmark: ${benchmark.name}`, options.index, options.total);

        try {
            // Check if aborted
            if (this.abortController?.signal.aborted) {
                throw new Error('Execution aborted');
            }

            // Create timeout promise
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`Benchmark timeout (${timeout}ms)`)), timeout);
            });

            // Execute benchmark with timeout
            const benchmarkPromise = this.runBenchmarkTask(benchmark, options);
            const result = await Promise.race([benchmarkPromise, timeoutPromise]);

            const duration = Date.now() - startTime;
            const benchmarkResult = {
                ...result,
                benchmark: benchmark.name,
                duration,
                success: true,
                timestamp: new Date().toISOString()
            };

            this.resultsService.addResult(benchmarkResult);
            this.logger.success(`Completed: ${benchmark.name} (${duration}ms)`);

            return benchmarkResult;

        } catch (error) {
            const duration = Date.now() - startTime;
            const errorResult = {
                benchmark: benchmark.name,
                success: false,
                error: error.message,
                duration,
                timestamp: new Date().toISOString()
            };

            this.resultsService.addResult(errorResult);
            this.logger.error(`Failed: ${benchmark.name} - ${error.message}`);

            throw error;
        }
    }

    /**
     * Run individual benchmark task
     * @param {Object} benchmark - Benchmark configuration
     * @param {Object} options - Execution options
     * @returns {Promise<Object>} Task result
     */
    async runBenchmarkTask(benchmark, options = {}) {
        // Navigate to benchmark page
        const benchmarkUrl = this.configService.getBenchmarkUrl();
        await this.browserService.navigateTo(benchmarkUrl);

        // Wait for page to be ready
        await this.browserService.waitForElement('#benchmark-controls', { timeout: 10000 });

        // Execute benchmark in browser
        const taskConfig = {
            task: benchmark.name,
            implementations: benchmark.implementations,
            iterations: this.configService.getConfig().iterations || 10,
            warmupIterations: this.configService.getConfig().warmupIterations || 3
        };

        // Call the browser benchmark runner
        const result = await this.browserService.executeScript(async (config) => {
            // This will be executed in browser context
            if (typeof window.runTaskBenchmark === 'function') {
                return await window.runTaskBenchmark(config);
            } else {
                throw new Error('runTaskBenchmark function not found in page');
            }
        }, taskConfig);

        return result;
    }

    /**
     * Check execution status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            isAborted: this.abortController?.signal.aborted || false,
            resultsCount: this.resultsService.getResults().length,
            summary: this.resultsService.getSummary()
        };
    }

    /**
     * Abort current execution
     * @returns {Promise<void>}
     */
    async abort() {
        if (this.abortController && !this.abortController.signal.aborted) {
            this.logger.warn('Aborting benchmark execution...');
            this.abortController.abort();

            // Allow some time for cleanup
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    /**
     * Save results to file
     * @param {string} filepath - Output file path
     * @param {string} format - Output format
     * @returns {Promise<void>}
     */
    async saveResults(filepath, format = 'json') {
        const outputConfig = this.configService.getOutputConfig();
        const actualFormat = format || outputConfig.format || 'json';

        await this.resultsService.saveToFile(filepath, actualFormat, {
            saveMetadata: outputConfig.detailed || false
        });

        this.logger.info(`Results saved to: ${filepath}`);
    }

    /**
     * Cleanup resources with atomic operations
     * @returns {Promise<void>}
     */
    async cleanup() {
        const cleanupOperations = [];

        try {
            // Step 1: Abort execution atomically
            if (this.isRunning) {
                cleanupOperations.push('abort-execution');
                await this.abort();
            }

            // Step 2: Cleanup browser atomically
            if (this.browserService) {
                cleanupOperations.push('browser-cleanup');
                await this.browserService.cleanup();
            }

            // Step 3: Reset state atomically
            cleanupOperations.push('state-reset');
            this.isRunning = false;
            this.abortController = null;

            this.logger.success('Orchestrator cleanup completed');
            return { success: true, operations: cleanupOperations };

        } catch (error) {
            const errorMsg = `[BenchmarkOrchestrator] Cleanup failed at ${cleanupOperations[cleanupOperations.length - 1]}: ${error.message}`;
            this.logger.error(errorMsg);
            throw new Error(errorMsg);
        }
    }

    /**
     * Emergency cleanup - force cleanup without graceful shutdown
     * @returns {Promise<void>}
     */
    async emergencyCleanup() {
        // Import chalk dynamically to avoid import issues
        let chalk;
        try {
            const chalkModule = await import('chalk');
            chalk = chalkModule.default;
        } catch (chalkError) {
            // Fallback to console.log if chalk is not available
            chalk = {
                yellow: (text) => text,
                red: (text) => text,
                green: (text) => text
            };
        }

        this.logger.warn('[BenchmarkOrchestrator] Performing emergency cleanup...');
        const emergencyOperations = [];

        try {
            // Force state reset first
            emergencyOperations.push('force-state-reset');
            this.isRunning = false;
            this.abortController = null;

            // Emergency browser cleanup
            if (this.browserService) {
                emergencyOperations.push('emergency-browser-cleanup');
                await this.browserService.emergencyCleanup();
            }

            // Clear results service
            if (this.resultsService) {
                emergencyOperations.push('results-clear');
                this.resultsService.clear();
            }

            this.logger.warn(`[BenchmarkOrchestrator] Emergency cleanup completed: ${emergencyOperations.join(', ')}`);
            return { success: true, emergencyOperations };

        } catch (error) {
            const errorMsg = `[BenchmarkOrchestrator] Emergency cleanup failed: ${error.message}`;
            this.logger.error(errorMsg);
            // Don't throw in emergency cleanup - log and continue
            return { success: false, error: errorMsg, completedOperations: emergencyOperations };
        }
    }

    /**
     * Validate services are properly injected and initialized
     * @throws {Error} If validation fails
     */
    validateServices() {
        if (!this.configService) {
            throw new Error('ConfigurationService not injected');
        }
        if (!this.browserService) {
            throw new Error('BrowserService not injected');
        }
        if (!this.resultsService) {
            throw new Error('ResultsService not injected');
        }

        // Check if services have required methods
        const requiredMethods = {
            configService: ['loadConfig', 'getConfig', 'getBenchmarks'],
            browserService: ['initialize', 'navigateTo', 'executeScript'],
            resultsService: ['initialize', 'addResult', 'getSummary']
        };

        for (const [service, methods] of Object.entries(requiredMethods)) {
            for (const method of methods) {
                if (typeof this[service][method] !== 'function') {
                    throw new Error(`${service} missing required method: ${method}`);
                }
            }
        }
    }
}
