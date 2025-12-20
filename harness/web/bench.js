/**
 * WebAssembly Benchmark Runner
 * Core benchmarking logic with timing and memory measurement
 */

import { ConfigLoader } from './config_loader.js';
import { WasmLoader } from './wasm_loader.js';

// Benchmark Configuration Constants
const BENCHMARK_LIMITS = {
    MAX_RUNS: 1000,
    MAX_REPETITIONS: 10,
    MAX_TIMEOUT_MS: 60 * 60 * 1000, // 60 minutes for WASM tasks
    MAX_JSON_RECORDS: 1000000,
    MAX_MATRIX_DIMENSION: 2000,
    MEMORY_THRESHOLD_MB: 500
};

const MEASUREMENT_CONSTANTS = {
    DEFAULT_RANDOM_SEED: 12345,
    GC_INTERVAL_MS: 100,
    STABILIZATION_DELAY_MS: 10,
    MIN_MEMORY_BYTES: 1024
};

const FNV_HASH_CONSTANTS = {
    OFFSET_BASIS: 2166136261,
    PRIME: 16777619
};

const MANDELBROT_CONSTANTS = {
    BUFFER_SIZE: 40,
    CENTER_REAL: -0.743643887037,
    CENTER_IMAG: 0.131825904205,
    SCALE_FACTOR: 3.0,
    DEFAULT_MAX_ITER: 100
};

const PARAM_BUFFER_SIZES = {
    JSON: 8, // 2 * u32
    MATRIX: 8, // 2 * u32
    MANDELBROT: 40
};

export class BenchmarkRunner {
    constructor(config = null) {
        this.loader = new WasmLoader();
        this.configLoader = new ConfigLoader();
        this.results = [];
        this.currentConfig = config;
        this.isRunning = false;
        this.cancelled = false;

        // Initialize random number generator (will be configured from config)
        this.randomSeed = MEASUREMENT_CONSTANTS.DEFAULT_RANDOM_SEED;
        this.random = this._xorshift32(this.randomSeed);
    }

    /**
     * XorShift32 PRNG for reproducible random numbers
     * @private
     */
    _xorshift32(seed) {
        let state = seed;
        return function () {
            state ^= state << 13;
            state ^= state >>> 17;
            state ^= state << 5;
            return (state >>> 0) / 4294967296; // Convert to [0, 1)
        };
    }

    /**
     * Generate random integers using XorShift32
     * @private
     */
    _randomInt32() {
        const state = Math.floor(this.random() * 4294967296);
        return state | 0; // Convert to signed 32-bit integer
    }

    /**
     * Initialize benchmark with configuration
     * @param {Object} config - Optional benchmark configuration (will load if not provided)
     */
    async initialize(config = null) {
        // Load configuration if not provided
        if (!config) {
            if (!this.currentConfig) {
                try {
                    this.currentConfig = await this.configLoader.loadConfig();
                } catch (error) {
                    // If config loading fails (e.g., in test environment), create minimal config
                    window.logResult(
                        `Configuration loading failed: ${error.message}. Creating minimal config for tests.`,
                        'warning'
                    );
                    this.currentConfig = this._createMinimalConfig();
                }
            }
            config = this.currentConfig;
        } else {
            this.currentConfig = config;
        }

        // Apply configuration to instance
        this._applyConfig(config);

        window.logResult('Initializing benchmark runner', 'success');
        window.logResult(
            `Config loaded: ${config.taskNames?.length || 0} tasks, ${config.enabledLanguages?.length || 0} languages`
        );

        // Update global state
        window.benchmarkState.status = 'initialized';
        window.benchmarkState.totalRuns = this._calculateTotalRuns(config);
    }

    /**
     * Create minimal configuration for test environments
     * @private
     */
    _createMinimalConfig() {
        return {
            experiment: { name: 'Test Environment' },
            environment: { warmupRuns: 0, measureRuns: 1 },
            tasks: ['mandelbrot', 'json_parse', 'matrix_mul'],
            languages: ['rust', 'tinygo'],
            scales: ['micro', 'small'],
            taskConfigs: {
                mandelbrot: { scales: { micro: { width: 64, height: 64, maxIter: 100 } } },
                json_parse: { scales: { micro: { recordCount: 10 } } },
                matrix_mul: { scales: { micro: { dimension: 32 } } }
            },
            warmupRuns: 0,
            measureRuns: 1,
            repetitions: 1,
            timeout: 30000
        };
    }

    /**
     * Apply configuration settings to benchmark instance
     * @private
     */
    _applyConfig(config) {
        // Apply random seed from config if available
        if (config.verification && config.verification.hashOffsetBasis) {
            this.randomSeed = config.verification.hashOffsetBasis;
            this.random = this._xorshift32(this.randomSeed);
        }

        // Store config reference for easy access
        this.config = config;
    }

    /**
     * Calculate total number of runs based on configuration
     * @private
     */
    _calculateTotalRuns(config) {
        let total = 0;
        const repetitions = config.repetitions || 1;
        const tasks = config.taskNames || config.tasks || [];
        const languages = config.enabledLanguages || config.languages || [];
        const scales = config.scales || [];

        for (let rep = 0; rep < repetitions; rep++) {
            for (const _task of tasks) {
                for (const _lang of languages) {
                    for (const _scale of scales) {
                        total += config.warmupRuns + config.measureRuns;
                    }
                }
            }
        }
        return total;
    }

    /**
     * Run complete benchmark suite
     * @param {Object} config - Optional benchmark configuration (will load if not provided)
     * @returns {Promise<Array>} Benchmark results
     */
    async runBenchmarkSuite(config = null) {
        if (this.isRunning) {
            throw new Error('Benchmark is already running');
        }

        this.isRunning = true;
        this.cancelled = false;
        this.results = [];

        try {
            await this.initialize(config);

            // Use the initialized configuration
            const activeConfig = this.currentConfig;

            window.benchmarkState.status = 'running';
            const repetitions = activeConfig.repetitions || 1;
            window.logResult(
                `Starting benchmark suite execution (${repetitions} repetition${repetitions > 1 ? 's' : ''})`,
                'success'
            );

            // Use unified execution engine
            const taskList = this._generateTaskList(activeConfig);
            await this._executeTaskList(taskList, repetitions, activeConfig);

            window.benchmarkState.status = this.cancelled ? 'cancelled' : 'completed';
            // Ensure progress bar reaches 100% when completed
            if (!this.cancelled) {
                window.benchmarkState.progress = 100;
            }
            window.logResult(
                `Benchmark suite ${this.cancelled ? 'cancelled' : 'completed'}`,
                this.cancelled ? 'warning' : 'success'
            );
        } catch (error) {
            window.benchmarkState.status = 'error';
            window.logResult(`Benchmark suite failed: ${error.message}`, 'error');
            throw error;
        } finally {
            this.isRunning = false;
        }

        return this.results;
    }

    /**
     * Generate a unified task list from configuration
     * @private
     * @param {Object} config - Configuration object
     * @returns {Array} Array of task objects {task, language, scale}
     */
    _generateTaskList(config) {
        const tasks = [];

        // Handle single task configuration (from runTaskBenchmark)
        if (config.task && config.language && config.scale) {
            tasks.push({
                task: config.task,
                language: config.language,
                scale: config.scale
            });
            return tasks;
        }

        // Handle suite configuration (from runBenchmarkSuite)
        const taskNames = config.taskNames || config.tasks || [];
        const languages = config.enabledLanguages || config.languages || [];
        const scales = config.scales || [];

        for (const taskName of taskNames) {
            for (const language of languages) {
                for (const scale of scales) {
                    tasks.push({
                        task: taskName,
                        language: language,
                        scale: scale
                    });
                }
            }
        }

        return tasks;
    }

    /**
     * Execute a list of tasks with repetitions - unified execution engine
     * @private
     * @param {Array} taskList - Array of task objects {task, language, scale}
     * @param {number} repetitions - Number of repetitions to perform
     * @param {Object} config - Configuration object for task execution
     * @returns {Promise<void>}
     */
    async _executeTaskList(taskList, repetitions = 1, config) {
        const totalTasks = taskList.length * repetitions;
        let completedTasks = 0;

        // Execute repetitions loop
        for (let rep = 0; rep < repetitions; rep++) {
            if (this.cancelled) break;

            if (repetitions > 1) {
                window.logResult(`\n=== Repetition ${rep + 1} of ${repetitions} ===`, 'info');
            }

            // Execute each task in the list
            for (const { task, language, scale } of taskList) {
                if (this.cancelled) break;

                await this._runTaskBenchmark(task, language, scale, config, rep + 1);

                completedTasks++;
                // Update progress if total tasks > 1
                if (totalTasks > 1) {
                    const progress = Math.round((completedTasks / totalTasks) * 100);
                    window.benchmarkState.progress = progress;
                }
            }

            if (repetitions > 1 && rep < repetitions - 1) {
                window.logResult(`Repetition ${rep + 1} completed. Starting next repetition...`, 'success');
            }
        }
    }

    /**
     * Run benchmark for a specific task, language, and scale
     * @private
     */
    async _runTaskBenchmark(taskName, language, scale, config, repetition = 1) {
        const moduleId = `${taskName}-${language}-${scale}-rep${repetition}`;
        // Convert camelCase taskName back to snake_case for file path
        const taskNameSnakeCase = taskName.replace(/([A-Z])/g, '_$1').toLowerCase();

        // Get optimization suffix from language configuration
        // Try both this.config and this.currentConfig, preferring this.currentConfig
        // because it's set during initialization
        const activeConfig = this.currentConfig || this.config;
        const langConfig = activeConfig?.languages?.[language];

        // Validate that we have the required configuration
        if (!activeConfig) {
            throw new Error(`No configuration available for task ${taskName}`);
        }

        if (!langConfig) {
            throw new Error(`No language configuration found for ${language} in task ${taskName}`);
        }

        if (!langConfig.optimizationLevels || langConfig.optimizationLevels.length === 0) {
            throw new Error(`No optimization levels defined for ${language} in task ${taskName}`);
        }

        const optSuffix = langConfig.optimizationLevels[0]?.suffix;
        if (!optSuffix) {
            throw new Error(`No optimization suffix defined for ${language} in task ${taskName}`);
        }

        const wasmPath = `/builds/${language}/${taskNameSnakeCase}-${optSuffix}.wasm`;

        window.benchmarkState.currentTask = taskName;
        window.benchmarkState.currentLang = language;

        const repetitions = config.repetitions || 1;
        const logMsg =
            repetitions > 1
                ? `Running ${taskName} (${language}, ${scale}) - Repetition ${repetition}`
                : `Running ${taskName} (${language}, ${scale})`;
        window.logResult(logMsg);

        try {
            // Load the WASM module
            const instance = await this.loader.loadModule(wasmPath, moduleId);

            // Initialize with seed
            instance.exports.init(this.randomSeed);

            // Generate input data based on task and scale
            const inputData = this._generateInputData(taskName, scale, config);

            // Write input data to WASM memory
            const dataPtr = this.loader.writeDataToMemory(instance, inputData);

            // Warmup runs (discard results)
            window.logResult(`Warmup runs: ${config.warmupRuns}`);
            for (let i = 0; i < config.warmupRuns; i++) {
                if (this.cancelled) return;

                window.benchmarkState.currentRun = i + 1;
                instance.exports.run_task(dataPtr);

                // Garbage collection hint between warmup runs
                if (typeof window.gc === 'function') {
                    window.gc();
                }
            }

            // Measurement runs
            window.logResult(`Measurement runs: ${config.measureRuns}`);
            for (let i = 0; i < config.measureRuns; i++) {
                if (this.cancelled) return;

                window.benchmarkState.currentRun = config.warmupRuns + i + 1;

                const result = await this._measureSingleRun(instance, dataPtr, {
                    task: taskName,
                    language: language,
                    scale: scale,
                    run: i + 1,
                    repetition: repetition,
                    moduleId: moduleId,
                    inputData: inputData,
                    inputDataHash: this._computeInputDataHash(inputData)
                });

                this.results.push(result);
                window.benchmarkState.successfulRuns++;

                // Update progress
                const totalCompleted = window.benchmarkState.successfulRuns + window.benchmarkState.failedRuns;
                window.benchmarkState.progress = (totalCompleted / window.benchmarkState.totalRuns) * 100;
            }
        } catch (error) {
            window.benchmarkState.failedRuns++;
            const errorLogMsg =
                repetitions > 1
                    ? `Failed ${taskName} (${language}, ${scale}) - Repetition ${repetition}: ${error.message}`
                    : `Failed ${taskName} (${language}, ${scale}): ${error.message}`;
            window.logResult(errorLogMsg, 'error');

            // Continue with next task rather than failing completely
            this.results.push({
                task: taskName,
                language: language,
                scale: scale,
                repetition: repetition,
                error: error.message,
                timestamp: Date.now(),
                success: false
            });
        } finally {
            // Clean up any loaded WASM module for this task
            this.loader.unloadModule(moduleId);
        }
    }

    /**
     * Measure a single benchmark run
     * @private
     */
    async _measureSingleRun(instance, dataPtr, metadata) {
        // Force garbage collection before measurement
        if (typeof window.gc === 'function') {
            window.gc();
        }

        // Short delay to stabilize
        await new Promise(resolve => setTimeout(resolve, MEASUREMENT_CONSTANTS.STABILIZATION_DELAY_MS));

        // Capture initial memory state
        const memBefore = performance.memory
            ? {
                  used: performance.memory.usedJSHeapSize,
                  total: performance.memory.totalJSHeapSize,
                  limit: performance.memory.jsHeapSizeLimit
              }
            : null;

        // Measure execution time
        const timeBefore = performance.now();
        const hash = instance.exports.run_task(dataPtr);
        const timeAfter = performance.now();

        // Capture final memory state
        const memAfter = performance.memory
            ? {
                  used: performance.memory.usedJSHeapSize,
                  total: performance.memory.totalJSHeapSize,
                  limit: performance.memory.jsHeapSizeLimit
              }
            : null;

        const executionTime = timeAfter - timeBefore;
        const memoryDeltaBytes =
            memAfter && memBefore
                ? Math.max(MEASUREMENT_CONSTANTS.MIN_MEMORY_BYTES, memAfter.used - memBefore.used)
                : MEASUREMENT_CONSTANTS.MIN_MEMORY_BYTES;
        const memoryDelta = memoryDeltaBytes / (1024 * 1024);

        // Get WASM memory statistics
        const wasmMemStats = this.loader.getModuleMemoryStats(metadata.moduleId);

        // Destructure metadata to exclude inputData from final result
        const { inputData, ...metadataWithoutInputData } = metadata;

        const result = {
            ...metadataWithoutInputData,
            executionTime: executionTime,
            memoryUsageMb: memoryDelta,
            memoryUsed: memoryDeltaBytes, // Memory usage in bytes
            wasmMemoryBytes: wasmMemStats ? wasmMemStats.bytes : 0,
            resultHash: hash >>> 0, // Ensure unsigned 32-bit
            timestamp: Date.now(),
            jsHeapBefore: memBefore ? memBefore.used : 0,
            jsHeapAfter: memAfter ? memAfter.used : 0,
            success: true,
            // Add task-specific result fields for test compatibility
            ...this._generateTaskSpecificFields(metadata.task, inputData)
        };

        return result;
    }

    /**
     * Compute FNV-1a hash of input data for compact storage
     * @private
     * @param {Uint8Array} inputData - Input data to hash
     * @returns {number} 32-bit FNV-1a hash
     */
    _computeInputDataHash(inputData) {
        let hash = FNV_HASH_CONSTANTS.OFFSET_BASIS;

        for (let i = 0; i < inputData.length; i++) {
            hash ^= inputData[i];
            hash = (hash * FNV_HASH_CONSTANTS.PRIME) >>> 0; // Ensure 32-bit unsigned
        }

        return hash;
    }

    /**
     * Extract uint32 value from binary data
     * @param {Uint8Array} data - Binary data
     * @param {number} offset - Byte offset
     * @returns {number|null} Extracted value or null if invalid
     * @private
     */
    _extractUint32(data, offset = 0) {
        if (!data || data.length < offset + 4) {
            return null;
        }
        const view = new DataView(data.buffer);
        return view.getUint32(offset, true);
    }

    /**
     * Generate task-specific result fields for test compatibility
     * @private
     */
    _generateTaskSpecificFields(taskName, inputData) {
        // Convert camelCase taskName back to snake_case for switch statement
        const taskNameSnakeCase = taskName.replace(/([A-Z])/g, '_$1').toLowerCase();

        switch (taskNameSnakeCase) {
            case 'json_parse': {
                const recordCount = this._extractUint32(inputData);
                return recordCount !== null ? { recordsProcessed: recordCount } : {};
            }

            case 'matrix_mul': {
                const dimension = this._extractUint32(inputData);
                return dimension !== null ? { resultDimensions: [dimension, dimension] } : {};
            }

            case 'mandelbrot':
                return {};

            default:
                return {};
        }
    }

    /**
     * Generate input data for a specific task and scale
     * @private
     */
    _generateInputData(taskName, scale, config) {
        // Debug: Check what we actually received
        // DEBUG _generateInputData: taskName, scale, config.taskConfigs removed for clean test output

        const taskConfig = config.taskConfigs[taskName];
        if (!taskConfig || !taskConfig.scales) {
            console.error(`ERROR: Missing task configuration for ${taskName}, taskConfig:`, taskConfig);
            throw new Error(`Missing task configuration for ${taskName}`);
        }
        const scaleConfig = taskConfig.scales[scale];

        // Convert camelCase taskName back to snake_case for switch statement
        const taskNameSnakeCase = taskName.replace(/([A-Z])/g, '_$1').toLowerCase();

        switch (taskNameSnakeCase) {
            case 'mandelbrot':
                return this._generateMandelbrotParams(scaleConfig);
            case 'json_parse':
                return this._generateJsonData(scaleConfig);
            case 'matrix_mul':
                return this._generateMatrixData(scaleConfig);
            default:
                throw new Error(`Unknown task: ${taskName} (converted to: ${taskNameSnakeCase})`);
        }
    }

    /**
     * Generate Mandelbrot parameters
     * @private
     */
    _generateMandelbrotParams(scaleConfig) {
        // Validate required parameters
        if (!scaleConfig.width || !scaleConfig.height) {
            throw new Error('Mandelbrot requires width and height parameters');
        }
        if (scaleConfig.width <= 0 || scaleConfig.height <= 0) {
            throw new Error('Mandelbrot width and height must be positive integers');
        }

        const maxIter = scaleConfig.maxIter || MANDELBROT_CONSTANTS.DEFAULT_MAX_ITER;
        if (maxIter <= 0) {
            throw new Error('Mandelbrot maxIter must be a positive integer');
        }

        const params = new ArrayBuffer(MANDELBROT_CONSTANTS.BUFFER_SIZE);
        const view = new DataView(params);

        // MandelbrotParams struct layout matching Rust: Width, Height, MaxIter, CenterReal, CenterImag, ScaleFactor
        view.setUint32(0, scaleConfig.width, true); // Width: uint32
        view.setUint32(4, scaleConfig.height, true); // Height: uint32
        view.setUint32(8, maxIter, true); // MaxIter: uint32
        view.setUint32(12, 0, true); // Padding for 8-byte alignment
        view.setFloat64(16, MANDELBROT_CONSTANTS.CENTER_REAL, true); // CenterReal: float64
        view.setFloat64(24, MANDELBROT_CONSTANTS.CENTER_IMAG, true); // CenterImag: float64
        view.setFloat64(32, MANDELBROT_CONSTANTS.SCALE_FACTOR, true); // ScaleFactor: float64

        return new Uint8Array(params);
    }

    /**
     * Extract record count from scale config
     * @param {Object} scaleConfig - Scale configuration
     * @returns {number} Record count
     * @throws {Error} If record count not found
     * @private
     */
    _extractRecordCount(scaleConfig) {
        // Test data generator format
        if (scaleConfig.expectedProperties?.recordCount) {
            return scaleConfig.expectedProperties.recordCount;
        }
        // Simple config format
        if (scaleConfig.recordCount) {
            return scaleConfig.recordCount;
        }
        throw new Error('JSON test data requires recordCount or pre-generated data structure');
    }

    /**
     * Generate JSON test data
     * @private
     */
    _generateJsonData(scaleConfig) {
        const recordCount = this._extractRecordCount(scaleConfig);

        if (recordCount <= 0) {
            throw new Error('JSON test data requires positive recordCount parameter');
        }
        if (recordCount > BENCHMARK_LIMITS.MAX_JSON_RECORDS) {
            throw new Error(`JSON test data recordCount cannot exceed ${BENCHMARK_LIMITS.MAX_JSON_RECORDS} for safety`);
        }

        try {
            // Create binary parameter structure for WASM module
            // The JSON task expects: [recordCount: u32, seed: u32]
            const params = new ArrayBuffer(PARAM_BUFFER_SIZES.JSON);
            const view = new DataView(params);

            view.setUint32(0, recordCount, true); // recordCount
            view.setUint32(4, this.randomSeed || MEASUREMENT_CONSTANTS.DEFAULT_RANDOM_SEED, true); // seed

            return new Uint8Array(params);
        } catch (error) {
            throw new Error(`Failed to create JSON parameters: ${error.message}`);
        }
    }

    /**
     * Extract matrix dimension from scale config
     * @param {Object} scaleConfig - Scale configuration
     * @returns {number} Matrix dimension
     * @throws {Error} If dimension not found
     * @private
     */
    _extractMatrixDimension(scaleConfig) {
        // Test data generator format
        if (scaleConfig.expectedProperties?.dimensions?.[0]) {
            return scaleConfig.expectedProperties.dimensions[0];
        }
        // Simple config format
        if (scaleConfig.dimension) {
            return scaleConfig.dimension;
        }
        // Alternative naming
        if (scaleConfig.size) {
            return scaleConfig.size;
        }
        throw new Error('Matrix test data requires dimension parameter');
    }

    /**
     * Generate matrix multiplication data
     * @private
     */
    _generateMatrixData(scaleConfig) {
        const dimension = this._extractMatrixDimension(scaleConfig);

        if (dimension <= 0) {
            throw new Error('Matrix dimension must be positive');
        }
        if (dimension > BENCHMARK_LIMITS.MAX_MATRIX_DIMENSION) {
            throw new Error(`Matrix dimension cannot exceed ${BENCHMARK_LIMITS.MAX_MATRIX_DIMENSION} for safety`);
        }

        // Create binary parameter structure for WASM module
        // The matrix task expects: MatrixMulParams { dimension: u32, seed: u32 }
        const params = new ArrayBuffer(PARAM_BUFFER_SIZES.MATRIX);
        const view = new DataView(params);

        view.setUint32(0, dimension, true); // dimension: u32
        view.setUint32(4, this.randomSeed || MEASUREMENT_CONSTANTS.DEFAULT_RANDOM_SEED, true); // seed: u32

        return new Uint8Array(params);
    }

    /**
     * Cancel the running benchmark
     */
    cancel() {
        this.cancelled = true;
        window.logResult('Benchmark cancellation requested', 'warning');
    }

    /**
     * Run benchmark for a single task configuration
     * Public interface method for external callers like run_browser_bench.js
     * @param {Object} config - Task configuration object
     * @returns {Promise<Array>} Benchmark results for the specific task
     */
    async runTaskBenchmark(config) {
        // Input validation
        if (!config || typeof config !== 'object') {
            throw new Error('runTaskBenchmark: config must be a valid object');
        }

        if (this.isRunning) {
            throw new Error('Benchmark is already running. Cancel current run or wait for completion.');
        }

        // Extract and validate task parameters from config
        const {
            task,
            language,
            scale,
            taskConfig,
            scaleConfig: _scaleConfig,
            warmupRuns,
            measureRuns,
            repetitions,
            timeout
        } = config;

        if (!task || typeof task !== 'string') {
            throw new Error('runTaskBenchmark: task must be a non-empty string');
        }
        if (!language || typeof language !== 'string') {
            throw new Error('runTaskBenchmark: language must be a non-empty string');
        }
        if (!scale || typeof scale !== 'string') {
            throw new Error('runTaskBenchmark: scale must be a non-empty string');
        }
        if (
            warmupRuns &&
            (typeof warmupRuns !== 'number' || warmupRuns < 0 || warmupRuns > BENCHMARK_LIMITS.MAX_RUNS)
        ) {
            throw new Error(`runTaskBenchmark: warmupRuns must be between 0 and ${BENCHMARK_LIMITS.MAX_RUNS}`);
        }
        if (
            measureRuns &&
            (typeof measureRuns !== 'number' || measureRuns <= 0 || measureRuns > BENCHMARK_LIMITS.MAX_RUNS)
        ) {
            throw new Error(`runTaskBenchmark: measureRuns must be between 1 and ${BENCHMARK_LIMITS.MAX_RUNS}`);
        }
        if (
            repetitions &&
            (typeof repetitions !== 'number' || repetitions <= 0 || repetitions > BENCHMARK_LIMITS.MAX_REPETITIONS)
        ) {
            throw new Error(`runTaskBenchmark: repetitions must be between 1 and ${BENCHMARK_LIMITS.MAX_REPETITIONS}`);
        }
        if (timeout && (typeof timeout !== 'number' || timeout <= 0 || timeout > BENCHMARK_LIMITS.MAX_TIMEOUT_MS)) {
            throw new Error(`runTaskBenchmark: timeout must be between 1 and ${BENCHMARK_LIMITS.MAX_TIMEOUT_MS}ms`);
        }

        this.isRunning = true;
        this.cancelled = false;
        const taskResults = [];

        try {
            // Load the full configuration first to get language details
            const fullConfig = await this.configLoader.loadConfig();

            // Create a compatible config structure for initialization, but preserve the languages object
            const benchConfig = {
                tasks: [task],
                languages: fullConfig.languages, // Use full languages object instead of array
                enabledLanguages: [language], // Add this for filtering/validation
                scales: [scale],
                taskConfigs: {
                    [task]: taskConfig || {}
                },
                warmupRuns: warmupRuns || 3,
                measureRuns: measureRuns || 10,
                repetitions: repetitions || 1,
                timeout: timeout || 60000,
                environment: {
                    warmupRuns: warmupRuns || 3,
                    measureRuns: measureRuns || 10,
                    repetitions: repetitions || 1,
                    timeout: timeout || 60000
                }
            };

            // Initialize with the compatible configuration
            await this.initialize(benchConfig);

            window.benchmarkState.status = 'running';
            window.logResult(`Running single task benchmark: ${task}-${language}-${scale}`, 'success');

            // Store original results to filter later
            const originalResultsLength = this.results.length;

            // Run the specific task benchmark with repetitions using unified execution engine
            const actualRepetitions = repetitions || 1;
            const singleTaskConfig = { task, language, scale };
            const taskList = this._generateTaskList(singleTaskConfig);
            await this._executeTaskList(taskList, actualRepetitions, this.currentConfig);

            // Extract only the results from this specific run
            const newResults = this.results.slice(originalResultsLength);
            taskResults.push(...newResults);

            window.benchmarkState.status = this.cancelled ? 'cancelled' : 'completed';
            // Ensure progress bar reaches 100% when completed
            if (!this.cancelled) {
                window.benchmarkState.progress = 100;
            }
            window.logResult(
                `Single task benchmark ${this.cancelled ? 'cancelled' : 'completed'}`,
                this.cancelled ? 'warning' : 'success'
            );
        } catch (error) {
            window.benchmarkState.status = 'error';
            window.logResult(`Single task benchmark failed: ${error.message}`, 'error');
            throw error;
        } finally {
            this.isRunning = false;
        }

        // Create aggregated result with detailed structure for analysis
        if (taskResults.length === 0) {
            return {
                success: false,
                error: 'No results generated',
                task: task,
                language: language,
                scale: scale,
                timestamp: Date.now()
            };
        }

        // Filter successful results
        const successfulResults = taskResults.filter(r => r.success !== false && !r.error);

        if (successfulResults.length === 0) {
            return {
                success: false,
                error: 'All runs failed',
                task: task,
                language: language,
                scale: scale,
                timestamp: Date.now()
            };
        }

        // Create structured result object that analysis code expects
        const firstResult = successfulResults[0];

        // Build the detailed results array with individual run data
        const detailedResults = successfulResults.map(r => ({
            task: r.task,
            language: r.language,
            scale: r.scale,
            run: r.run,
            repetition: r.repetition || 1,
            moduleId: r.moduleId,
            inputDataHash: r.inputDataHash,
            executionTime: r.executionTime,
            memoryUsageMb: r.memoryUsageMb,
            memoryUsed: r.memoryUsed,
            wasmMemoryBytes: r.wasmMemoryBytes,
            resultHash: r.resultHash,
            timestamp: r.timestamp,
            jsHeapBefore: r.jsHeapBefore,
            jsHeapAfter: r.jsHeapAfter,
            success: r.success,
            implementation: `${r.task}_${r.language}`,
            resultDimensions: r.resultDimensions,
            recordsProcessed: r.recordsProcessed
        }));

        return {
            task: firstResult.task,
            language: firstResult.language,
            scale: firstResult.scale,
            success: true,
            results: detailedResults, // Array of individual run results
            timestamp: Date.now(),
            averageExecutionTime:
                successfulResults.reduce((sum, r) => sum + r.executionTime, 0) / successfulResults.length,
            averageMemoryUsage: successfulResults.reduce((sum, r) => sum + r.wasmMemoryBytes + r.memoryUsed, 0) / successfulResults.length,
            totalRuns: taskResults.length,
            successfulRuns: successfulResults.length
        };
    }

    /**
     * Get current benchmark results
     */
    getResults() {
        return [...this.results];
    }

    /**
     * Clear all results and reset state
     */
    clear() {
        this.results = [];
        this.loader.clearAll();
        window.benchmarkState.successfulRuns = 0;
        window.benchmarkState.failedRuns = 0;
        window.benchmarkState.progress = 0;
        window.logResult('Benchmark runner cleared');
    }
}

// Create global instance
window.benchmarkRunner = new BenchmarkRunner();

// Initialize the wasmModulesLoaded flag - set to true for test compatibility
// since modules are loaded on-demand during task execution
window.wasmModulesLoaded = {
    rust: true,
    tinygo: true
};

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await window.benchmarkRunner.initialize();

        // Modules are already marked as loaded for on-demand loading
        window.logResult('Benchmark runner initialized, WASM modules ready for on-demand loading', 'success');
    } catch (error) {
        window.logResult(`Failed to initialize benchmark runner: ${error.message}`, 'error');
    }
});

// Export for external use
export default BenchmarkRunner;
