/**
 * Configuration Service
 * Handles all configuration loading, validation, and management
 */

import fs from 'fs';
import { IConfigurationService } from '../interfaces/IConfigurationService.js';

export class ConfigurationService extends IConfigurationService {
    constructor() {
        super();
        this.config = null;
        this.benchmarkConfigs = null;
    }

    /**
     * Load and validate configuration from file
     * @param {string} configPath - Path to config file
     * @returns {Promise<Object>} Validated configuration
     */
    async loadConfig(configPath) {
        try {
            if (!fs.existsSync(configPath)) {
                throw new Error(`Config file not found: ${configPath}`);
            }

            const configContent = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configContent);

            // Store config path for mode detection
            this.configPath = configPath;
            this.isQuickMode = configPath.includes('bench-quick.json');

            // Validate required fields
            this.validateConfig(config);

            this.config = this.addDefaults(config);
            return this.config;
        } catch (error) {
            throw new Error(`Failed to load config: ${error.message}`);
        }
    }

    /**
     * Validate configuration structure and required fields
     * @param {Object} config - Configuration to validate
     * @throws {Error} If validation fails
     */
    validateConfig(config) {
        const required = ['benchmarks', 'output'];
        const missing = required.filter(field => !config[field]);

        if (missing.length > 0) {
            throw new Error(`Missing required config fields: ${missing.join(', ')}`);
        }

        if (!Array.isArray(config.benchmarks) || config.benchmarks.length === 0) {
            throw new Error('Config must contain non-empty benchmarks array');
        }

        // Validate each benchmark configuration
        config.benchmarks.forEach((bench, index) => {
            this.validateBenchmarkConfig(bench, index);
        });
    }

    /**
     * Validate individual benchmark configuration
     * @param {Object} benchmark - Benchmark config to validate
     * @param {number} index - Index for error reporting
     * @throws {Error} If validation fails
     */
    validateBenchmarkConfig(benchmark, index) {
        const required = ['name', 'implementations'];
        const missing = required.filter(field => !benchmark[field]);

        if (missing.length > 0) {
            throw new Error(`Benchmark ${index}: Missing required fields: ${missing.join(', ')}`);
        }

        if (!Array.isArray(benchmark.implementations) || benchmark.implementations.length === 0) {
            throw new Error(`Benchmark ${index}: Must contain non-empty implementations array`);
        }

        // Validate each implementation
        benchmark.implementations.forEach((impl, implIndex) => {
            if (!impl.name || !impl.path) {
                throw new Error(`Benchmark ${index}, implementation ${implIndex}: Missing name or path`);
            }
        });
    }

    /**
     * Add default values to configuration
     * @param {Object} config - Base configuration
     * @returns {Object} Configuration with defaults applied
     */
    addDefaults(config) {
        const defaults = {
            timeout: 300000, // 5 minutes
            iterations: 10,
            warmupIterations: 3,
            parallel: true,
            maxParallel: 4,
            retries: 3,
            failureThreshold: 0.3,
            output: {
                directory: 'results',
                format: 'json',
                detailed: true
            },
            server: {
                host: 'localhost',
                port: process.env.PORT || 2025,
                benchmarkPath: '/bench.html'
            },
            browser: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--no-first-run',
                    '--no-default-browser-check',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding'
                ]
            }
        };

        return this.mergeDefaults(config, defaults);
    }

    /**
     * Deep merge configuration with defaults
     * @param {Object} config - User configuration
     * @param {Object} defaults - Default values
     * @returns {Object} Merged configuration
     */
    mergeDefaults(config, defaults) {
        const result = { ...config };

        for (const [key, value] of Object.entries(defaults)) {
            if (!(key in result)) {
                result[key] = value;
            } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                result[key] = this.mergeDefaults(result[key] || {}, value);
            }
        }

        return result;
    }

    /**
     * Get current configuration
     * @returns {Object|null} Current configuration
     */
    getConfig() {
        return this.config;
    }

    /**
     * Get benchmark configurations
     * @returns {Array} Array of benchmark configurations
     */
    getBenchmarks() {
        return this.config?.benchmarks || [];
    }

    /**
     * Get output configuration
     * @returns {Object} Output configuration
     */
    getOutputConfig() {
        return this.config?.output || {};
    }

    /**
     * Get browser configuration
     * @returns {Object} Browser configuration
     */
    getBrowserConfig() {
        return this.config?.browser || {};
    }

    /**
     * Get timeout configuration
     * @returns {number} Timeout in milliseconds
     */
    getTimeout() {
        return this.config?.timeout || 300000;
    }

    /**
     * Get parallel execution configuration
     * @returns {Object} Parallel execution settings
     */
    getParallelConfig() {
        return {
            enabled: this.config?.parallel || false,
            maxParallel: this.config?.maxParallel || 4
        };
    }

    /**
     * Get failure threshold configuration
     * @returns {number} Failure threshold (0-1)
     */
    getFailureThreshold() {
        return this.config?.failureThreshold || 0.3;
    }

    /**
     * Get retry configuration
     * @returns {number} Number of retries
     */
    getRetries() {
        return this.config?.retries || 3;
    }

    /**
     * Get server configuration
     * @returns {Object} Server configuration
     */
    getServerConfig() {
        return this.config?.server || {
            host: 'localhost',
            port: process.env.PORT || 2025,
            benchmarkPath: '/bench.html'
        };
    }

    /**
     * Get benchmark URL
     * @returns {string} Full benchmark URL
     */
    getBenchmarkUrl() {
        const server = this.getServerConfig();
        const baseUrl = `http://${server.host}:${server.port}${server.benchmarkPath}`;

        // Add quick parameter if in quick mode
        if (this.isQuickMode) {
            return `${baseUrl}?mode=quick`;
        }

        return baseUrl;
    }

    /**
     * Validate runtime configuration
     * @param {Object} options - Runtime options to validate
     * @throws {Error} If validation fails
     */
    validateRuntimeConfig(options = {}) {
        if (options.timeout && (typeof options.timeout !== 'number' || options.timeout <= 0)) {
            throw new Error('[ConfigurationService] Invalid timeout: must be a positive number');
        }

        if (options.maxParallel && (typeof options.maxParallel !== 'number' || options.maxParallel <= 0)) {
            throw new Error('[ConfigurationService] Invalid maxParallel: must be a positive number');
        }

        if (options.failureThreshold &&
            (typeof options.failureThreshold !== 'number' ||
             options.failureThreshold < 0 ||
             options.failureThreshold > 1)) {
            throw new Error('[ConfigurationService] Invalid failureThreshold: must be a number between 0 and 1');
        }
    }

    /**
     * Create standardized error message
     * @private
     * @param {string} operation - Operation that failed
     * @param {string} reason - Reason for failure
     * @returns {string} Standardized error message
     */
    _createError(operation, reason) {
        return `[ConfigurationService] ${operation} failed: ${reason}`;
    }
}
