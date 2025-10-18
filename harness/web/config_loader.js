/**
 * Enhanced Configuration Loader for Browser Environment
 * Handles loading and parsing of YAML configuration files with Node.js service integration
 */

// HTTP Status Codes
const HTTP_STATUS = {
    NOT_FOUND: 404,
    FORBIDDEN: 403,
    SERVER_ERROR: 500
};

export class ConfigLoader {
    constructor() {
        this.config = null;
        this.configPath = '../../configs/bench.yaml';
    }

    /**
     * Validate string parameter is non-empty
     * @param {*} value - Value to validate
     * @param {string} paramName - Parameter name for error messages
     * @throws {Error} If validation fails
     * @private
     */
    _validateNonEmptyString(value, paramName) {
        if (!value || typeof value !== 'string' || !value.trim()) {
            throw new Error(`${paramName} must be a non-empty string`);
        }
    }

    /**
     * Validate array is non-empty
     * @param {*} value - Value to validate
     * @param {string} paramName - Parameter name for error messages
     * @throws {Error} If validation fails
     * @private
     */
    _validateNonEmptyArray(value, paramName) {
        if (!Array.isArray(value) || value.length === 0) {
            throw new Error(`${paramName} must be a non-empty array`);
        }
    }

    /**
     * Detect configuration mode from URL parameters
     * @returns {string} Configuration file path
     * @private
     */
    _detectConfigPath() {
        // Check URL parameters for mode
        const urlParams = new URLSearchParams(window.location.search);
        const mode = urlParams.get('mode');

        if (mode === 'quick') {
            return '/configs/bench-quick.json';
        } else {
            return '/configs/bench.json';
        }
    }

    /**
     * Load configuration from pre-generated JSON file
     * @param {string} configPath - Optional path to config file (will auto-detect if not provided)
     * @returns {Promise<Object>} Parsed configuration object
     */
    async loadConfig(configPath = null) {
        // Detect configuration path based on URL parameters or use provided path
        const jsonPath = configPath || this._detectConfigPath();

        try {
            window.logResult(`Loading pre-generated configuration from: ${jsonPath}`, 'info');

            // Fetch the pre-generated JSON file
            const response = await fetch(jsonPath);
            if (!response.ok) {
                throw new Error(this._createFetchErrorMessage(jsonPath, response.status, response.statusText));
            }

            // Parse JSON content directly - no YAML service needed!
            this.config = await response.json();

            // Validate and process configuration
            this.validateConfig();
            this.processConfig();

            window.logResult(`Configuration loaded successfully: ${this.config.experiment.name}`, 'success');
            window.logResult(`Tasks: ${this.config.taskNames.join(', ')}`, 'info');
            window.logResult(`Languages: ${this.config.enabledLanguages.join(', ')}`, 'info');
            window.logResult(`Generated: ${this.config.generated.timestamp}`, 'info');

            return this.config;
        } catch (error) {
            window.logResult(`Failed to load configuration: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Create detailed HTTP fetch error message
     * @param {string} path - File path that failed
     * @param {number} status - HTTP status code
     * @param {string} statusText - HTTP status text
     * @returns {string} Detailed error message
     * @private
     */
    _createFetchErrorMessage(path, status, statusText) {
        let errorMsg = `Failed to fetch configuration from ${path}: ${status} ${statusText}`;

        if (status === HTTP_STATUS.NOT_FOUND) {
            errorMsg +=
                '. Configuration file not found. Run "pnpm run build:config" to generate the required config file.';
        } else if (status === HTTP_STATUS.FORBIDDEN) {
            errorMsg += '. Access denied to configuration file. Check server permissions and CORS settings.';
        } else if (status >= HTTP_STATUS.SERVER_ERROR) {
            errorMsg += '. Server error occurred. Check server logs and try again.';
        } else {
            errorMsg += '. Check network connectivity and server status.';
        }

        return errorMsg;
    }

    /**
     * Validate configuration structure
     * @private
     */
    validateConfig() {
        if (!this.config) {
            throw new Error('Configuration is null or undefined');
        }

        // Check required sections
        const requiredSections = ['experiment', 'environment', 'tasks', 'languages'];
        for (const section of requiredSections) {
            if (!this.config[section]) {
                throw new Error(`Missing required configuration section: ${section}`);
            }
        }

        // Validate using helper methods
        this._validateNonEmptyString(this.config.experiment?.name, 'experiment.name');
        this._validateNonEmptyArray(this.config.taskNames, 'taskNames');
        this._validateNonEmptyArray(this.config.enabledLanguages, 'enabledLanguages');

        // Check generation metadata
        if (!this.config.generated?.timestamp) {
            throw new Error('Configuration missing generation metadata - please run build process');
        }

        window.logResult('Configuration validation passed', 'success');
    }

    /**
     * Process and transform configuration for benchmark use
     * @private
     */
    processConfig() {
        // Pre-processed config is already optimized
        const { config } = this;

        // Validate environment section exists
        if (!config.environment) {
            throw new Error('Configuration missing environment section');
        }

        // JSON now uses camelCase, maintain camelCase interface for consistency
        config.warmupRuns = config.environment.warmupRuns || 20;
        config.measureRuns = config.environment.measureRuns || 100;
        config.repetitions = config.environment.repetitions || 3;
        config.timeout = config.environment.timeout || 90000;

        config.tasks = config.taskNames || [];
        // Keep original languages object, add convenience array
        config.enabledLanguagesList = config.enabledLanguages || [];
        config.scales = config.availableScales || ['small', 'medium', 'large'];

        // Validate critical arrays are populated
        if (config.tasks.length === 0) {
            throw new Error('Configuration has no tasks defined');
        }
        if (config.enabledLanguagesList.length === 0) {
            throw new Error('Configuration has no languages enabled');
        }

        window.logResult('Configuration processing completed (pre-optimized)', 'success');
    }

    /**
     * Get current configuration
     * @returns {Object} Current configuration object
     */
    getConfig() {
        return this.config;
    }

    /**
     * Get configuration for a specific task and scale
     * @param {string} taskName - Task name
     * @param {string} scale - Scale name (small, medium, large)
     * @returns {Object} Task-specific configuration
     * @throws {Error} If configuration not loaded or task/scale not found
     */
    getTaskConfig(taskName, scale) {
        if (!this.config || !this.config.taskConfigs) {
            throw new Error('[ConfigLoader] Configuration not loaded');
        }

        this._validateNonEmptyString(taskName, 'taskName');
        this._validateNonEmptyString(scale, 'scale');

        const taskConfig = this.config.taskConfigs[taskName];
        if (!taskConfig) {
            throw new Error(`[ConfigLoader] Task configuration not found: ${taskName}`);
        }

        const scaleConfig = taskConfig.scales?.[scale];
        if (!scaleConfig) {
            throw new Error(`[ConfigLoader] Scale configuration not found: ${taskName}.${scale}`);
        }

        return {
            taskConfig: taskConfig,
            scaleConfig: scaleConfig,
            warmupRuns: this.config.warmupRuns,
            measureRuns: this.config.measureRuns,
            timeout: this.config.timeout
        };
    }

    /**
     * Get timeout for specific task and scale
     * @param {string} _taskName - Task name (unused - all tasks use same timeout)
     * @param {string} _scale - Scale name (unused - all tasks use same timeout)
     * @returns {number} Timeout in milliseconds
     */
    getTaskTimeout(_taskName, _scale) {
        return this.config.timeout;
    }

    /**
     * Check if configuration is loaded
     * @returns {boolean} True if configuration is loaded
     */
    isLoaded() {
        return this.config !== null;
    }

    /**
     * Reload configuration
     * @param {string} configPath - Optional path to config file
     * @returns {Promise<Object>} Reloaded configuration
     */
    async reload(configPath = null) {
        this.config = null;
        return await this.loadConfig(configPath);
    }
}

// Create global instance
window.configLoader = new ConfigLoader();

// Export for external use
export default ConfigLoader;
