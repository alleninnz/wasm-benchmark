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
     * @returns {Promise<Object>} Validated configuration object
     * @throws {Error} If file not found or validation fails
     */
    async loadConfig(configPath) {
        if (!configPath || typeof configPath !== 'string') {
            throw new Error('[ConfigurationService] Config path must be a non-empty string');
        }

        try {
            if (!fs.existsSync(configPath)) {
                throw new Error(`Config file not found: ${configPath}`);
            }

            const configContent = fs.readFileSync(configPath, 'utf8');
            if (!configContent.trim()) {
                throw new Error('Config file is empty');
            }

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
     * Get browser configuration with runtime options
     * @param {Object} runtimeOptions - Runtime options to merge (e.g., headless, devtools)
     * @returns {Object} Browser configuration
     */
    getBrowserConfig(runtimeOptions = {}) {
        const baseConfig = this.config?.browser || {};

        // Merge runtime options with base config
        // Runtime options have higher priority
        return {
            ...baseConfig,
            ...runtimeOptions
        };
    }

    /**
     * Get base timeout configuration from environment.timeout
     * @returns {number} Base timeout in milliseconds
     */
    getTimeout() {
        // Get timeout from environment.timeout
        const timeoutValue = this.config?.environment?.timeout || 240;

        // Config values are always in seconds, convert to milliseconds for JavaScript setTimeout()
        return timeoutValue * 1000;
    }

    /**
     * Get browser protocol timeout - hardcoded to maximum allowed value
     * @returns {number} Browser protocol timeout in milliseconds
     */
    getBrowserTimeout() {
        // Hardcoded to maximum allowed value (30 minutes)
        return 30 * 60 * 1000; // 1,800,000ms
    }

    /**
     * Get navigation timeout - hardcoded to maximum allowed value
     * @returns {number} Navigation timeout in milliseconds
     */
    getNavigationTimeout() {
        // Hardcoded to maximum allowed value (30 minutes)
        return 30 * 60 * 1000; // 1,800,000ms
    }

    /**
     * Get element wait timeout - hardcoded to maximum allowed value
     * @returns {number} Element wait timeout in milliseconds
     */
    getElementTimeout() {
        // Hardcoded to maximum allowed value (30 minutes)
        return 30 * 60 * 1000; // 1,800,000ms
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
        return (
            this.config?.server || {
                host: 'localhost',
                port: process.env.PORT || 2025,
                benchmarkPath: '/bench.html'
            }
        );
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
        this._validatePositiveNumber(options.timeout, 'timeout');
        this._validatePositiveNumber(options.maxParallel, 'maxParallel');
        this._validateRange(options.failureThreshold, 'failureThreshold', 0, 1);
    }

    /**
     * Validate a positive number parameter
     * @param {*} value - Value to validate
     * @param {string} name - Parameter name
     * @throws {Error} If validation fails
     * @private
     */
    _validatePositiveNumber(value, name) {
        if (value !== undefined && (typeof value !== 'number' || value <= 0)) {
            throw new Error(`[ConfigurationService] Invalid ${name}: must be a positive number`);
        }
    }

    /**
     * Validate a number is within a range
     * @param {*} value - Value to validate
     * @param {string} name - Parameter name
     * @param {number} min - Minimum value (inclusive)
     * @param {number} max - Maximum value (inclusive)
     * @throws {Error} If validation fails
     * @private
     */
    _validateRange(value, name, min, max) {
        if (value !== undefined && (typeof value !== 'number' || value < min || value > max)) {
            throw new Error(`[ConfigurationService] Invalid ${name}: must be a number between ${min} and ${max}`);
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
