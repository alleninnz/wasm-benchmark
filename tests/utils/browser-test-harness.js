/**
 * Shared Browser Test Harness
 * Provides standardized browser setup and teardown for integration tests
 * Reduces code duplication and ensures consistent test environment
 */

import puppeteer from 'puppeteer';

export class BrowserTestHarness {
  constructor(config = {}) {
    this.config = { 
      ...global.testBrowserConfig, 
      ...config 
    };
    this.browser = null;
    this.page = null;
    this.logs = [];
    this.errors = [];
  }
  
  /**
   * Initialize browser and page with standardized setup
   * @returns {Promise<Object>} Page object ready for testing
   */
  async setup() {
    try {
      // Launch browser with merged configuration
      this.browser = await puppeteer.launch(this.config);
      this.page = await this.browser.newPage();
      
      // Setup console logging capture
      this.page.on('console', msg => {
        const logEntry = `[${msg.type().toUpperCase()}] ${msg.text()}`;
        this.logs.push(logEntry);
        if (this.config.logConsole !== false) {
          console.log('PAGE:', logEntry);
        }
      });
      
      // Setup error tracking
      this.page.on('pageerror', error => {
        const errorEntry = `PAGE ERROR: ${error.message}`;
        this.errors.push(errorEntry);
        if (this.config.logErrors !== false) {
          console.error(errorEntry);
        }
      });
      
      // Setup request failure tracking
      this.page.on('requestfailed', request => {
        const failureEntry = `REQUEST FAILED: ${request.url()} - ${request.failure()?.errorText}`;
        this.errors.push(failureEntry);
        if (this.config.logRequests !== false) {
          console.warn(failureEntry);
        }
      });
      
      // Navigate to benchmark page  
      await this.page.goto('http://localhost:2025/', { 
        waitUntil: 'networkidle0',
        timeout: this.config.navigationTimeout || 30000
      });
      
      // Wait for WebAssembly modules to be ready
      if (this.config.waitForWasm !== false) {
        await this.waitForWasmModules();
      }
      
      return this.page;
      
    } catch (error) {
      await this.teardown(); // Cleanup on failure
      throw new Error(`Browser setup failed: ${error.message}`);
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
    try {
      const result = await this.page.evaluate(async (t, l, d) => {
        if (!window.runTask) {
          throw new Error('runTask function not available');
        }
        return await window.runTask(t, l, d);
      }, task, language, data);
      
      return result;
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        errorType: 'execution_error',
        task,
        language
      };
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
    try {
      if (this.page && !this.page.isClosed()) {
        await this.page.close();
      }
    } catch (error) {
      if (!force) throw error;
      console.warn('Page cleanup warning:', error.message);
    }
    
    try {
      if (this.browser) {
        await this.browser.close();
      }
    } catch (error) {
      if (!force) throw error;
      console.warn('Browser cleanup warning:', error.message);
    }
    
    this.page = null;
    this.browser = null;
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