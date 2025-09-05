/**
 * Benchmark Orchestrator Interface
 * Defines the contract for benchmark execution orchestration services
 */

export class IBenchmarkOrchestrator {
    /**
     * Initialize the orchestrator
     * @param {string} configPath - Path to configuration file
     * @returns {Promise<void>}
     */
    async initialize(configPath) {
        throw new Error('initialize method must be implemented');
    }

    /**
     * Execute all benchmarks
     * @param {Object} options - Execution options
     * @returns {Promise<Object>} Execution results
     */
    async executeBenchmarks(options) {
        throw new Error('executeBenchmarks method must be implemented');
    }

    /**
     * Execute benchmarks in parallel
     * @param {Array} benchmarks - Benchmark configurations
     * @param {Object} options - Execution options
     * @returns {Promise<Array>} Execution results
     */
    async executeInParallel(benchmarks, options) {
        throw new Error('executeInParallel method must be implemented');
    }

    /**
     * Execute benchmarks sequentially
     * @param {Array} benchmarks - Benchmark configurations
     * @param {Object} options - Execution options
     * @returns {Promise<Array>} Execution results
     */
    async executeSequentially(benchmarks, options) {
        throw new Error('executeSequentially method must be implemented');
    }

    /**
     * Execute a single benchmark
     * @param {Object} benchmark - Benchmark configuration
     * @param {Object} options - Execution options
     * @returns {Promise<Object>} Benchmark result
     */
    async executeSingleBenchmark(benchmark, options) {
        throw new Error('executeSingleBenchmark method must be implemented');
    }

    /**
     * Check execution status
     * @returns {Object} Status information
     */
    getStatus() {
        throw new Error('getStatus method must be implemented');
    }

    /**
     * Abort current execution
     * @returns {Promise<void>}
     */
    async abort() {
        throw new Error('abort method must be implemented');
    }

    /**
     * Save results to file
     * @param {string} filepath - Output file path
     * @param {string} format - Output format
     * @returns {Promise<void>}
     */
    async saveResults(filepath, format) {
        throw new Error('saveResults method must be implemented');
    }

    /**
     * Cleanup resources
     * @returns {Promise<void>}
     */
    async cleanup() {
        throw new Error('cleanup method must be implemented');
    }

    /**
     * Emergency cleanup - force cleanup without graceful shutdown
     * @returns {Promise<void>}
     */
    async emergencyCleanup() {
        throw new Error('emergencyCleanup method must be implemented');
    }

    /**
     * Validate services are properly injected and initialized
     * @throws {Error} If validation fails
     */
    validateServices() {
        throw new Error('validateServices method must be implemented');
    }
}