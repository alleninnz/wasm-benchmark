/**
 * WebAssembly Benchmark Runner
 * Core benchmarking logic with timing and memory measurement
 */

import { WasmLoader } from './wasm_loader.js';
import { ConfigLoader } from './config_loader.js';

export class BenchmarkRunner {
    constructor(config = null) {
        this.loader = new WasmLoader();
        this.configLoader = new ConfigLoader();
        this.results = [];
        this.currentConfig = config;
        this.isRunning = false;
        this.cancelled = false;
        
        // Initialize random number generator (will be configured from config)
        this.randomSeed = 12345;
        this.random = this._xorshift32(this.randomSeed);
    }

    /**
     * XorShift32 PRNG for reproducible random numbers
     * @private
     */
    _xorshift32(seed) {
        let state = seed;
        return function() {
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
                this.currentConfig = await this.configLoader.loadConfig();
            }
            config = this.currentConfig;
        } else {
            this.currentConfig = config;
        }
        
        // Apply configuration to instance
        this._applyConfig(config);
        
        window.logResult('Initializing benchmark runner', 'success');
        window.logResult(`Config loaded: ${config.tasks.length} tasks, ${config.languages.length} languages`);
        
        // Update global state
        window.benchmarkState.status = 'initialized';
        window.benchmarkState.totalRuns = this._calculateTotalRuns(config);
    }

    /**
     * Apply configuration settings to benchmark instance
     * @private
     */
    _applyConfig(config) {
        // Apply random seed from config if available
        if (config.verification && config.verification.hash_offset_basis) {
            this.randomSeed = config.verification.hash_offset_basis;
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
        for (const task of config.tasks) {
            for (const lang of config.languages) {
                for (const scale of config.scales) {
                    total += config.warmupRuns + config.measureRuns;
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
            window.logResult('Starting benchmark suite execution', 'success');

            for (const taskName of activeConfig.tasks) {
                if (this.cancelled) break;
                
                for (const language of activeConfig.languages) {
                    if (this.cancelled) break;
                    
                    for (const scale of activeConfig.scales) {
                        if (this.cancelled) break;
                        
                        await this._runTaskBenchmark(taskName, language, scale, activeConfig);
                    }
                }
            }
            
            window.benchmarkState.status = this.cancelled ? 'cancelled' : 'completed';
            window.logResult(`Benchmark suite ${this.cancelled ? 'cancelled' : 'completed'}`, 
                           this.cancelled ? 'warning' : 'success');
            
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
     * Run benchmark for a specific task, language, and scale
     * @private
     */
    async _runTaskBenchmark(taskName, language, scale, config) {
        const moduleId = `${taskName}-${language}-${scale}`;
        const wasmPath = `../../builds/${language}/${taskName}-${language}-o3.wasm`;
        
        window.benchmarkState.currentTask = taskName;
        window.benchmarkState.currentLang = language;
        
        window.logResult(`Running ${taskName} (${language}, ${scale})`);
        
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
                    moduleId: moduleId
                });
                
                this.results.push(result);
                window.benchmarkState.successfulRuns++;
                
                // Update progress
                const totalCompleted = window.benchmarkState.successfulRuns + window.benchmarkState.failedRuns;
                window.benchmarkState.progress = (totalCompleted / window.benchmarkState.totalRuns) * 100;
            }
            
        } catch (error) {
            window.benchmarkState.failedRuns++;
            window.logResult(`Failed ${taskName} (${language}, ${scale}): ${error.message}`, 'error');
            
            // Continue with next task rather than failing completely
            this.results.push({
                task: taskName,
                language: language,
                scale: scale,
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
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Capture initial memory state
        const memBefore = performance.memory ? {
            used: performance.memory.usedJSHeapSize,
            total: performance.memory.totalJSHeapSize,
            limit: performance.memory.jsHeapSizeLimit
        } : null;
        
        // Measure execution time
        const timeBefore = performance.now();
        const hash = instance.exports.run_task(dataPtr);
        const timeAfter = performance.now();
        
        // Capture final memory state
        const memAfter = performance.memory ? {
            used: performance.memory.usedJSHeapSize,
            total: performance.memory.totalJSHeapSize,
            limit: performance.memory.jsHeapSizeLimit
        } : null;
        
        const executionTime = timeAfter - timeBefore;
        const memoryDelta = memAfter && memBefore ? 
            (memAfter.used - memBefore.used) / (1024 * 1024) : 0;
        
        // Get WASM memory statistics
        const wasmMemStats = this.loader.getModuleMemoryStats(metadata.moduleId);
        
        const result = {
            ...metadata,
            executionTimeMs: executionTime,
            memoryUsageMb: memoryDelta,
            wasmMemoryBytes: wasmMemStats ? wasmMemStats.bytes : 0,
            hash: hash >>> 0, // Ensure unsigned 32-bit
            timestamp: Date.now(),
            jsHeapBefore: memBefore ? memBefore.used : 0,
            jsHeapAfter: memAfter ? memAfter.used : 0,
            success: true
        };
        
        return result;
    }

    /**
     * Generate input data for a specific task and scale
     * @private
     */
    _generateInputData(taskName, scale, config) {
        const taskConfig = config.taskConfigs[taskName];
        const scaleConfig = taskConfig.scales[scale];
        
        switch (taskName) {
            case 'mandelbrot':
                return this._generateMandelbrotParams(scaleConfig);
            case 'json_parse':
                return this._generateJsonData(scaleConfig);
            case 'matrix_mul':
                return this._generateMatrixData(scaleConfig);
            default:
                throw new Error(`Unknown task: ${taskName}`);
        }
    }

    /**
     * Generate Mandelbrot parameters
     * @private
     */
    _generateMandelbrotParams(scaleConfig) {
        const params = new ArrayBuffer(32); // 8 * 4 bytes for proper alignment
        const view = new DataView(params);
        
        view.setUint32(0, scaleConfig.width, true);
        view.setUint32(4, scaleConfig.height, true);
        view.setUint32(8, scaleConfig.max_iter, true); // Fixed: use max_iter not maxIter
        view.setUint32(12, 0, true); // Padding for alignment
        view.setFloat64(16, -0.743643887037, true); // center_real
        view.setFloat64(24, 0.131825904205, true);  // center_imag
        
        return new Uint8Array(params);
    }


    /**
     * Generate JSON test data
     * @private
     */
    _generateJsonData(scaleConfig) {
        const records = [];
        const count = scaleConfig.recordCount;
        
        for (let i = 0; i < count; i++) {
            const value = this._randomInt32() & 0x7FFFFFFF; // Ensure positive
            records.push({
                id: i,
                value: value,
                flag: (value & 1) === 0,
                name: `a${i}`
            });
        }
        
        const jsonString = JSON.stringify(records);
        return new TextEncoder().encode(jsonString);
    }

    /**
     * Generate matrix multiplication data
     * @private
     */
    _generateMatrixData(scaleConfig) {
        const dim = scaleConfig.dimension;
        const totalElements = dim * dim * 2; // Two matrices
        const buffer = new ArrayBuffer(totalElements * 4); // f32
        const view = new Float32Array(buffer);
        
        for (let i = 0; i < totalElements; i++) {
            view[i] = this.random(); // [0, 1) range
        }
        
        return new Uint8Array(buffer);
    }

    /**
     * Cancel the running benchmark
     */
    cancel() {
        this.cancelled = true;
        window.logResult('Benchmark cancellation requested', 'warning');
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

// Export for external use
export default BenchmarkRunner;