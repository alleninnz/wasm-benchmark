/**
 * Benchmark Orchestrator
 * Coordinates benchmark execution using injected services
 */

import { IBenchmarkOrchestrator } from '../interfaces/IBenchmarkOrchestrator.js';
import { LoggingService } from './LoggingService.js';

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
     * @param {Object} runtimeOptions - Runtime options (headless, devtools, etc.)
     * @returns {Promise<void>}
     */
    async initialize(configPath, runtimeOptions = {}) {
        try {
            // Load configuration
            await this.configService.loadConfig(configPath);

            // Initialize browser with runtime options
            const browserConfig = this.configService.getBrowserConfig(runtimeOptions);
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
            const benchmarks = this.configService.getBenchmarks();
            const parallelConfig = this.configService.getParallelConfig();

            this.logger.info(`Starting execution of ${benchmarks.length} benchmarks...`);

            // In headed mode, navigate to benchmark page first
            if (!this.browserService.isHeadless) {
                try {
                    const benchmarkUrl = this.configService.getBenchmarkUrl();
                    this.logger.info(`Navigating to benchmark page: ${benchmarkUrl}`);
                    await this.browserService.navigateTo(benchmarkUrl);
                    await this.browserService.waitForElement('#status', { timeout: 10000 });
                    this.logger.success('Benchmark page loaded successfully');
                } catch (error) {
                    throw new Error(`Failed to load benchmark page: ${error.message}`);
                }
            }

            // Initialize frontend with task list for better tracking
            if (!this.browserService.isHeadless) {
                try {
                    const taskList = benchmarks.map(b => {
                        const taskName = b.task || b.name.replace(/_micro$/, '');
                        const language = b.language || 'unknown';
                        const scale = b.scale || 'default';
                        return `${taskName} ${scale} (${language})`;
                    });

                    await this.browserService.page.evaluate((tasks) => {
                        if (window.initializeBenchmarkSuite) {
                            window.initializeBenchmarkSuite(tasks);
                            console.log('Frontend initialized with', tasks.length, 'tasks');
                        } else {
                            console.warn('initializeBenchmarkSuite function not found');
                        }

                        // Fallback: directly set the state if the function doesn't work
                        if (window.benchmarkState) {
                            window.benchmarkState.allTasks = tasks;
                        }
                    }, taskList);
                } catch (error) {
                    console.warn('Failed to initialize frontend task list:', error.message);
                }
            }

            let _results;
            // In headed mode, force sequential execution to avoid multiple windows
            const isHeadedMode = this.browserService.isHeadless === false;
            const shouldUseParallel = parallelConfig.enabled && benchmarks.length > 1 && !isHeadedMode;
            
            if (shouldUseParallel) {
                this.logger.info('Using parallel execution (headless mode)');
                _results = await this.executeInParallel(benchmarks, { ...options, parallel: true });
            } else {
                if (isHeadedMode && parallelConfig.enabled) {
                    this.logger.info('Forcing sequential execution in headed mode for single window experience');
                }
                _results = await this.executeSequentially(benchmarks, { ...options, parallel: false });
            }

            // Finalize results
            this.resultsService.finalize({
                executionMode: shouldUseParallel ? 'parallel' : 'sequential',
                totalBenchmarks: benchmarks.length,
                options
            });

            // Signal to frontend that entire benchmark suite is finished
            if (!this.browserService.isHeadless) {
                try {
                    await this.browserService.page.evaluate(() => {
                        if (window.finishBenchmarkSuite) {
                            window.finishBenchmarkSuite();
                        }
                    });
                } catch (error) {
                    console.warn('Failed to signal benchmark suite completion to frontend:', error.message);
                }
            }

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
        // In headed mode, use main page for single window experience
        // In headless mode with parallel execution, use dedicated pages to avoid race conditions
        const shouldUseDedicatedPage = options.parallel && this.browserService.isHeadless !== false;
        const page = shouldUseDedicatedPage 
            ? await this.browserService.createNewPage()
            : this.browserService.page;

        try {
            // Navigate to benchmark page
            const benchmarkUrl = this.configService.getBenchmarkUrl();
            const navigationOptions = {
                waitUntil: 'networkidle0',
                timeout: 30000
            };

            // Only navigate if we're not already on the benchmark page (for main page reuse)
            if (shouldUseDedicatedPage) {
                await page.goto(benchmarkUrl, navigationOptions);
                await page.waitForSelector('body', { timeout: 10000 });
                await page.waitForSelector('#status', { timeout: 10000 });
            } else {
                // Check if we need to navigate to benchmark page
                const currentUrl = await page.url();
                if (!currentUrl.includes('bench.html') && !currentUrl.includes('localhost')) {
                    await page.goto(benchmarkUrl, navigationOptions);
                    await page.waitForSelector('body', { timeout: 10000 });
                    await page.waitForSelector('#status', { timeout: 10000 });
                }
            }

            // Extract task details from the benchmark configuration
            const taskName = benchmark.task || benchmark.name.replace(/_micro$/, '');
            // Use context-aware scale defaulting: micro for quick mode, small for standard mode
            const defaultScale = this.configService.isQuickMode ? 'micro' : 'small';
            const scale = benchmark.scale || defaultScale;
            const language = benchmark.language || 'unknown';

            // Get the full config to get the task configuration
            const fullConfig = this.configService.getConfig();
            const taskConfiguration = fullConfig.tasks ? fullConfig.tasks[taskName] : null;

            // Run benchmark for each implementation (language)
            const results = [];
            const _totalImplementations = benchmark.implementations.length;

            for (let i = 0; i < benchmark.implementations.length; i++) {
                const implementation = benchmark.implementations[i];

                // Execute benchmark in browser
                const taskConfig = {
                    task: taskName,
                    language: language,
                    scale: scale,
                    taskConfig: taskConfiguration, // Pass the full task configuration with scales
                    warmupRuns: this.configService.getConfig().environment?.warmupRuns || 3,
                    measureRuns: this.configService.getConfig().environment?.measureRuns || 10,
                    timeout: 30000 // 30 second timeout for individual tasks
                };

                try {
                    // Notify frontend about task start (in headed mode)
                    if (!this.browserService.isHeadless) {
                        try {
                            await page.evaluate((task, lang) => {
                                if (window.startTask) {
                                    window.startTask(task, lang);
                                }
                            }, taskName, language);
                        } catch {
                            // Don't fail the task if UI update fails
                        }
                    }

                    // Execute benchmark script on appropriate page
                    const result = await page.evaluate(async (config) => {
                    // This will be executed in browser context
                        if (window.benchmarkRunner && typeof window.benchmarkRunner.runTaskBenchmark === 'function') {
                            return await window.benchmarkRunner.runTaskBenchmark(config);
                        } else {
                            throw new Error('benchmarkRunner.runTaskBenchmark function not found in page');
                        }
                    }, taskConfig);

                    results.push({
                        ...result,
                        task: taskName,
                        language: language,
                        implementation: implementation.name
                    });

                    // Notify frontend about task completion (in headed mode)
                    if (!this.browserService.isHeadless) {
                        try {
                            await page.evaluate((task, lang, success, res) => {
                                if (window.completeTask) {
                                    window.completeTask(task, lang, success, res);
                                }
                            }, taskName, language, true, result);
                        } catch {
                            // Don't fail the task if UI update fails
                        }
                    }

                    this.logger.success(`Completed ${taskName} for ${language}`);
                } catch (error) {
                    results.push({
                        success: false,
                        error: error.message,
                        task: taskName,
                        language: language,
                        implementation: implementation.name
                    });

                    // Notify frontend about task failure (in headed mode)
                    if (!this.browserService.isHeadless) {
                        try {
                            await page.evaluate((task, lang, success, err) => {
                                if (window.completeTask) {
                                    window.completeTask(task, lang, success, { error: err });
                                }
                            }, taskName, language, false, error.message);
                        } catch {
                            // Don't fail the task if UI update fails
                        }
                    }

                    this.logger.error(`Failed ${taskName} for ${language}: ${error.message}`);
                }
            }

            // Return combined results
            return {
                benchmark: benchmark.name,
                success: results.some(r => r.success),
                results: results,
                timestamp: new Date().toISOString()
            };

        } finally {
            // Close dedicated page if we created one, but keep main page open
            if (shouldUseDedicatedPage && page !== this.browserService.page) {
                try {
                    await page.close();
                } catch (error) {
                    // Log but don't throw - resource cleanup shouldn't fail the benchmark
                    console.warn('Failed to close dedicated page:', error.message);
                }
            }
        }
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
     * @returns {Promise<Object>} Cleanup result
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
            let browserCleanupResult = { keptOpen: false };
            if (this.browserService) {
                cleanupOperations.push('browser-cleanup');
                browserCleanupResult = await this.browserService.cleanup();
            }

            // Step 3: Reset state atomically
            cleanupOperations.push('state-reset');
            this.isRunning = false;
            this.abortController = null;

            this.logger.success('Orchestrator cleanup completed');
            return { 
                success: true, 
                operations: cleanupOperations, 
                keptOpen: browserCleanupResult.keptOpen 
            };

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
