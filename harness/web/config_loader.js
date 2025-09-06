/**
 * Enhanced Configuration Loader for Browser Environment
 * Handles loading and parsing of YAML configuration files with Node.js service integration
 */

export class ConfigLoader {
    constructor() {
        this.config = null;
        this.configPath = '../../configs/bench.yaml';
    }

    /**
     * Load configuration from pre-generated JSON file
     * @param {string} configPath - Optional path to config file (ignored, uses bench.config.json)
     * @returns {Promise<Object>} Parsed configuration object
     */
    async loadConfig(configPath = null) {
        // Use pre-generated JSON configuration from configs directory
        const jsonPath = '../../configs/bench.json';
        
        try {
            window.logResult(`Loading pre-generated configuration from: ${jsonPath}`, 'info');
            
            // Fetch the pre-generated JSON file
            const response = await fetch(jsonPath);
            if (!response.ok) {
                throw new Error(`Failed to fetch config file: ${response.status} ${response.statusText}. Make sure 'npm run build:config' was executed to generate configs/bench.json`);
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
     * Parse primitive values from strings (legacy utility method)
     * @param {string} value - String value to parse
     * @returns {any} Parsed value
     * @private
     */
    parseValue(value) {
        if (value.startsWith("'") && value.endsWith("'")) {
            return value.slice(1, -1);
        }
        if (/^\d+$/.test(value)) {
            return parseInt(value, 10);
        }
        if (/^\d+\.\d+$/.test(value)) {
            return parseFloat(value);
        }
        if (value.startsWith('[') && value.endsWith(']')) {
            // Simple array parsing
            const items = value.slice(1, -1).split(',').map(item => item.trim());
            return items.map(item => this.parseValue(item));
        }
        
        return value;
    }

    /**
     * Validate configuration structure
     * @private
     */
    validateConfig() {
        if (!this.config) {
            throw new Error('Configuration is null or undefined');
        }

        // Check required sections (simplified validation for pre-processed config)
        const requiredSections = ['experiment', 'environment', 'tasks', 'languages'];
        for (const section of requiredSections) {
            if (!this.config[section]) {
                throw new Error(`Missing required configuration section: ${section}`);
            }
        }

        // Validate experiment section
        if (!this.config.experiment.name) {
            throw new Error('Missing experiment name in configuration');
        }

        // Validate pre-processed convenience arrays
        if (!this.config.taskNames || this.config.taskNames.length === 0) {
            throw new Error('No tasks defined in configuration');
        }

        if (!this.config.enabledLanguages || this.config.enabledLanguages.length === 0) {
            throw new Error('No languages enabled in configuration');
        }

        // Check generation metadata
        if (!this.config.generated || !this.config.generated.timestamp) {
            throw new Error('Configuration missing generation metadata - please run build process');
        }

        window.logResult('Configuration validation passed', 'success');
    }

    /**
     * Process and transform configuration for benchmark use
     * @private
     */
    processConfig() {
        // Pre-processed config is already optimized, just add legacy compatibility
        const config = this.config;
        
        // Add legacy compatibility fields
        config.warmupRuns = config.environment.warmupRuns;
        config.measureRuns = config.environment.measureRuns;
        config.timeout = config.environment.timeout;
        config.taskTimeouts = config.environment.taskTimeouts;
        config.gcThreshold = config.environment.gcThreshold;
        config.memoryMonitoring = config.environment.memoryMonitoring;
        config.gcMonitoring = config.environment.gcMonitoring;
        
        // Legacy arrays (already present in optimized config)
        config.tasks = config.taskNames;
        config.languages = config.enabledLanguages;
        
        // Task and language configs are already properly structured
        
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
     */
    getTaskConfig(taskName, scale) {
        if (!this.config || !this.config.taskConfigs) {
            throw new Error('Configuration not loaded');
        }

        const taskConfig = this.config.taskConfigs[taskName];
        if (!taskConfig) {
            throw new Error(`Task configuration not found: ${taskName}`);
        }

        const scaleConfig = taskConfig.scales[scale];
        if (!scaleConfig) {
            throw new Error(`Scale configuration not found: ${taskName}.${scale}`);
        }

        return {
            taskConfig: taskConfig,
            scaleConfig: scaleConfig,
            warmupRuns: this.config.warmupRuns,
            measureRuns: this.config.measureRuns,
            timeout: this.config.taskTimeouts[`${taskName}_${scale}`] || this.config.timeout
        };
    }

    /**
     * Get timeout for specific task and scale
     * @param {string} taskName - Task name
     * @param {string} scale - Scale name
     * @returns {number} Timeout in milliseconds
     */
    getTaskTimeout(taskName, scale) {
        const taskKey = `${taskName}_${scale}`;
        return this.config.taskTimeouts[taskKey] || this.config.timeout;
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