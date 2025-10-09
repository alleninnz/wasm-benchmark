/**
 * Configuration Service Interface
 * Defines the contract for configuration management services
 */

export class IConfigurationService {
    /**
     * Load and validate configuration from file
     * @param {string} configPath - Path to config file
     * @returns {Promise<Object>} Validated configuration object
     * @throws {Error} If file not found or validation fails
     */
    async loadConfig(configPath) {
        throw new Error('loadConfig method must be implemented');
    }

    /**
     * Validate configuration structure and required fields
     * @param {Object} config - Configuration to validate
     * @throws {Error} If validation fails
     */
    validateConfig(config) {
        throw new Error('validateConfig method must be implemented');
    }

    /**
     * Get current configuration
     * @returns {Object|null} Current configuration
     */
    getConfig() {
        throw new Error('getConfig method must be implemented');
    }

    /**
     * Get benchmark configurations
     * @returns {Array} Array of benchmark configurations
     */
    getBenchmarks() {
        throw new Error('getBenchmarks method must be implemented');
    }

    /**
     * Get output configuration
     * @returns {Object} Output configuration
     */
    getOutputConfig() {
        throw new Error('getOutputConfig method must be implemented');
    }

    /**
     * Get browser configuration
     * @returns {Object} Browser configuration
     */
    getBrowserConfig() {
        throw new Error('getBrowserConfig method must be implemented');
    }

    /**
     * Get timeout configuration
     * @returns {number} Timeout in milliseconds
     */
    getTimeout() {
        throw new Error('getTimeout method must be implemented');
    }

    /**
     * Get parallel execution configuration
     * @returns {Object} Parallel execution settings
     */
    getParallelConfig() {
        throw new Error('getParallelConfig method must be implemented');
    }

    /**
     * Get failure threshold configuration
     * @returns {number} Failure threshold (0-1)
     */
    getFailureThreshold() {
        throw new Error('getFailureThreshold method must be implemented');
    }

    /**
     * Validate runtime configuration
     * @param {Object} options - Runtime options to validate
     * @throws {Error} If validation fails
     */
    validateRuntimeConfig(options) {
        throw new Error('validateRuntimeConfig method must be implemented');
    }
}
