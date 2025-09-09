/**
 * Shared Browser Test Harness
 * Provides standardized browser setup and teardown for integration tests
 * Reduces code duplication and ensures consistent test environment
 */

import puppeteer from 'puppeteer';

export class BrowserTestHarness {
  constructor(config = {}) {
    // Input validation
    if (config !== null && typeof config !== 'object') {
      throw new Error('BrowserTestHarness: config must be an object or null');
    }

    // Constants for configuration validation
    this.MAX_LOGS = 10000;
    this.MAX_ERRORS = 1000;
    this.DEFAULT_NAVIGATION_TIMEOUT = 60000;
    this.DEFAULT_WASM_TIMEOUT = 60000;
    this.MAX_TIMEOUT = 300000; // 5 minutes maximum

    this.config = { 
      ...global.testBrowserConfig, 
      ...config 
    };
    
    // Validate critical configuration values
    this._validateConfig();
    
    this.browser = null;
    this.page = null;
    this.logs = [];
    this.errors = [];
    this.setupComplete = false;
    this.teardownInProgress = false;
  }

  /**
   * Validate configuration values for safety
   * @private
   */
  _validateConfig() {
    if (this.config.navigationTimeout && 
        (typeof this.config.navigationTimeout !== 'number' || 
         this.config.navigationTimeout <= 0 || 
         this.config.navigationTimeout > this.MAX_TIMEOUT)) {
      throw new Error(`BrowserTestHarness: navigationTimeout must be between 1 and ${this.MAX_TIMEOUT}ms`);
    }
    
    if (this.config.timeout && 
        (typeof this.config.timeout !== 'number' || 
         this.config.timeout <= 0 || 
         this.config.timeout > this.MAX_TIMEOUT)) {
      throw new Error(`BrowserTestHarness: timeout must be between 1 and ${this.MAX_TIMEOUT}ms`);
    }
  }
  
  /**
   * Initialize browser and page with standardized setup
   * @returns {Promise<Object>} Page object ready for testing
   */
  async setup() {
    if (this.setupComplete) {
      throw new Error('BrowserTestHarness: setup() called multiple times. Call teardown() first.');
    }
    
    if (this.teardownInProgress) {
      throw new Error('BrowserTestHarness: cannot setup while teardown is in progress');
    }

    try {
      // Launch browser with merged configuration
      this.browser = await puppeteer.launch(this.config);
      this.page = await this.browser.newPage();
      
      // Setup console logging capture with memory management
      this.page.on('console', msg => {
        const logEntry = `[${msg.type().toUpperCase()}] ${msg.text()}`;
        this._addLog(logEntry);
        if (this.config.logConsole !== false) {
          console.log('PAGE:', logEntry);
        }
      });
      
      // Setup error tracking with memory management
      this.page.on('pageerror', error => {
        const errorEntry = `PAGE ERROR: ${error.message}`;
        this._addError(errorEntry);
        if (this.config.logErrors !== false) {
          console.error(errorEntry);
        }
      });
      
      // Setup request failure tracking
      this.page.on('requestfailed', request => {
        const failureEntry = `REQUEST FAILED: ${request.url()} - ${request.failure()?.errorText}`;
        this._addError(failureEntry);
        if (this.config.logRequests !== false) {
          console.warn(failureEntry);
        }
      });
      
      // Navigate to benchmark page with proper timeout handling
      const navigationTimeout = this.config.navigationTimeout || this.DEFAULT_NAVIGATION_TIMEOUT;
      await this.page.goto('http://localhost:2025/', { 
        waitUntil: 'networkidle0',
        timeout: navigationTimeout
      });
      
      // Wait for WebAssembly modules to be ready
      if (this.config.waitForWasm !== false) {
        const wasmTimeout = this.config.wasmTimeout || this.DEFAULT_WASM_TIMEOUT;
        await this.waitForWasmModules(wasmTimeout);
      }
      
      this.setupComplete = true;
      return this.page;
      
    } catch (error) {
      await this.teardown(true); // Force cleanup on failure
      throw new Error(`Browser setup failed: ${error.message}. Check that dev server is running on localhost:2025`);
    }
  }

  /**
   * Add log entry with memory management
   * @private
   */
  _addLog(logEntry) {
    this.logs.push(logEntry);
    if (this.logs.length > this.MAX_LOGS) {
      this.logs = this.logs.slice(-this.MAX_LOGS / 2); // Keep last half
    }
  }

  /**
   * Add error entry with memory management  
   * @private
   */
  _addError(errorEntry) {
    this.errors.push(errorEntry);
    if (this.errors.length > this.MAX_ERRORS) {
      this.errors = this.errors.slice(-this.MAX_ERRORS / 2); // Keep last half
    }
  }
  
  /**
   * Wait for WebAssembly modules to load
   * @param {number} timeout - Timeout in milliseconds
   */
  async waitForWasmModules(timeout = 30000) {
    try {
      await this.page.waitForFunction(() => {
        return window.wasmModulesLoaded && 
               window.wasmModulesLoaded.rust && 
               window.wasmModulesLoaded.tinygo;
      }, { timeout });
    } catch (error) {
      throw new Error(`WebAssembly modules failed to load within ${timeout}ms: ${error.message}`);
    }
  }
  
  /**
   * Execute a benchmark task with error handling
   * @param {string} task - Task name (mandelbrot, json_parse, matrix_mul)
   * @param {string} language - Language (rust, tinygo)  
   * @param {Object} data - Task input data
   * @returns {Promise<Object>} Task execution result
   */
  async executeTask(task, language, data) {
    // Input validation
    if (typeof task !== 'string' || !task.trim()) {
      throw new Error('executeTask: task must be a non-empty string');
    }
    if (typeof language !== 'string' || !language.trim()) {
      throw new Error('executeTask: language must be a non-empty string');
    }
    if (!data || typeof data !== 'object') {
      throw new Error('executeTask: data must be a valid object');
    }
    if (!this.setupComplete) {
      throw new Error('executeTask: setup() must be called before executing tasks');
    }
    if (!this.page || this.page.isClosed()) {
      throw new Error('executeTask: page is not available or has been closed');
    }

    const VALID_TASKS = ['mandelbrot', 'json_parse', 'matrix_mul'];
    const VALID_LANGUAGES = ['rust', 'tinygo'];
    
    if (!VALID_TASKS.includes(task)) {
      throw new Error(`executeTask: invalid task "${task}". Valid tasks: ${VALID_TASKS.join(', ')}`);
    }
    if (!VALID_LANGUAGES.includes(language)) {
      throw new Error(`executeTask: invalid language "${language}". Valid languages: ${VALID_LANGUAGES.join(', ')}`);
    }

    try {
      const result = await this.page.evaluate(async (t, l, d) => {
        if (!window.runTask) {
          throw new Error('runTask function not available - check that benchmark harness is loaded');
        }
        return await window.runTask(t, l, d);
      }, task, language, data);
      
      // Validate result structure
      if (!result || typeof result !== 'object') {
        throw new Error('Task execution returned invalid result format');
      }
      
      return result;
      
    } catch (error) {
      const errorResult = {
        success: false,
        error: error.message,
        errorType: 'execution_error',
        task,
        language,
        executionTime: 0,
        memoryUsed: 0,
        resultHash: 0,
        timestamp: Date.now()
      };
      
      // Log the error for debugging
      this._addError(`Task execution failed: ${task}:${language} - ${error.message}`);
      
      return errorResult;
    }
  }
  
  /**
   * Execute multiple tasks concurrently
   * @param {Array} taskConfigs - Array of {task, language, data} objects
   * @returns {Promise<Array>} Array of results
   */
  async executeConcurrentTasks(taskConfigs) {
    const promises = taskConfigs.map(async (config, index) => {
      const result = await this.executeTask(config.task, config.language, config.data);
      return { 
        index, 
        config, 
        result,
        timestamp: Date.now()
      };
    });
    
    return await Promise.all(promises);
  }
  
  /**
   * Set task timeout for subsequent executions
   * @param {number} timeoutMs - Timeout in milliseconds
   */
  async setTaskTimeout(timeoutMs) {
    await this.page.evaluate((timeout) => {
      if (window.setTaskTimeout) {
        window.setTaskTimeout(timeout);
      }
    }, timeoutMs);
  }
  
  /**
   * Enable or disable detailed metrics collection
   * @param {boolean} enabled - Whether to enable detailed metrics
   */
  async enableDetailedMetrics(enabled = true) {
    await this.page.evaluate((enable) => {
      if (window.enableDetailedMetrics) {
        window.enableDetailedMetrics(enable);
      }
    }, enabled);
  }
  
  /**
   * Get system metrics from the browser
   * @returns {Promise<Object>} System metrics object
   */
  async getSystemMetrics() {
    return await this.page.evaluate(() => {
      const metrics = {};
      
      if (performance.memory) {
        metrics.memory = {
          used: performance.memory.usedJSHeapSize,
          total: performance.memory.totalJSHeapSize,
          limit: performance.memory.jsHeapSizeLimit,
          pressure: performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit
        };
      }
      
      if (window.getSystemMetrics) {
        Object.assign(metrics, window.getSystemMetrics());
      }
      
      metrics.userAgent = navigator.userAgent;
      metrics.platform = navigator.platform;
      metrics.timestamp = Date.now();
      
      return metrics;
    });
  }
  
  /**
   * Validate current browser state for testing
   * @returns {Promise<Object>} Validation result
   */
  async validateTestEnvironment() {
    return await this.page.evaluate(() => {
      const validation = {
        webassembly: typeof WebAssembly !== 'undefined',
        performanceAPI: typeof performance?.now === 'function',
        runTaskFunction: typeof window.runTask === 'function',
        wasmModulesLoaded: !!(window.wasmModulesLoaded?.rust && window.wasmModulesLoaded?.tinygo),
        memoryAPI: !!performance.memory,
        timestamp: Date.now()
      };
      
      validation.allValid = Object.values(validation).every(v => v === true || typeof v === 'number');
      
      return validation;
    });
  }
  
  /**
   * Clean up browser resources
   * @param {boolean} force - Force cleanup even if errors occur
   */
  async teardown(force = false) {
    if (this.teardownInProgress) {
      console.warn('BrowserTestHarness: teardown already in progress');
      return;
    }

    this.teardownInProgress = true;
    
    try {
      // Close page first
      if (this.page && !this.page.isClosed()) {
        try {
          await this.page.close();
        } catch (pageError) {
          if (!force) {
            this.teardownInProgress = false;
            throw new Error(`Page cleanup failed: ${pageError.message}`);
          }
          console.warn('Page cleanup warning:', pageError.message);
        }
      }
    } catch (error) {
      if (!force) {
        this.teardownInProgress = false;
        throw error;
      }
      console.warn('Page cleanup error:', error.message);
    }
    
    try {
      // Close browser
      if (this.browser) {
        try {
          await this.browser.close();
        } catch (browserError) {
          if (!force) {
            this.teardownInProgress = false;
            throw new Error(`Browser cleanup failed: ${browserError.message}`);
          }
          console.warn('Browser cleanup warning:', browserError.message);
        }
      }
    } catch (error) {
      if (!force) {
        this.teardownInProgress = false;
        throw error;
      }
      console.warn('Browser cleanup error:', error.message);
    }
    
    // Reset state
    this.page = null;
    this.browser = null;
    this.setupComplete = false;
    this.teardownInProgress = false;
    
    // Clear logs and errors to prevent memory leaks
    this.logs = [];
    this.errors = [];
  }
  
  /**
   * Get collected logs and errors
   * @returns {Object} Logs and errors arrays
   */
  getTestLogs() {
    return {
      logs: [...this.logs],
      errors: [...this.errors],
      logCount: this.logs.length,
      errorCount: this.errors.length
    };
  }
  
  /**
   * Clear collected logs and errors
   */
  clearTestLogs() {
    this.logs = [];
    this.errors = [];
  }
}

/**
 * Test timeout constants for consistent timeout management
 */
export const TEST_TIMEOUTS = {
  unit: 5000,           // Unit tests: 5 seconds
  integration: 30000,   // Integration tests: 30 seconds  
  e2e: 120000,         // E2E tests: 2 minutes
  statistical: 300000,  // Statistical analysis: 5 minutes
  concurrent: 60000,    // Concurrent execution: 1 minute
  stress: 600000       // Stress tests: 10 minutes
};

/**
 * Standard test configurations for different test scenarios
 */
export const TEST_CONFIGS = {
  // Quick smoke tests
  smoke: {
    logConsole: false,
    logErrors: true,
    logRequests: false,
    navigationTimeout: 15000,
    waitForWasm: true
  },
  
  // Full integration testing
  integration: {
    logConsole: true,
    logErrors: true, 
    logRequests: true,
    navigationTimeout: 30000,
    waitForWasm: true
  },
  
  // Performance-focused testing
  performance: {
    logConsole: false,
    logErrors: true,
    logRequests: false,
    navigationTimeout: 30000,
    waitForWasm: true,
    args: [
      '--disable-extensions',
      '--disable-plugins', 
      '--disable-background-networking',
      '--disable-background-timer-throttling'
    ]
  },
  
  // Debugging configuration
  debug: {
    logConsole: true,
    logErrors: true,
    logRequests: true,
    navigationTimeout: 60000,
    waitForWasm: true,
    headless: false,
    devtools: true
  }
};

export default BrowserTestHarness;