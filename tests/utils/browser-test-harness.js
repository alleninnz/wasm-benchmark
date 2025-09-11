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

    this.config = { 
      ...global.testBrowserConfig, 
      ...config 
    };
    
    this.browser = null;
    this.page = null;
    this.setupComplete = false;
    this.teardownInProgress = false;
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
      
      // Setup simple console and error logging
      if (this.config.logConsole !== false) {
        this.page.on('console', msg => {
          console.log('PAGE:', `[${msg.type().toUpperCase()}] ${msg.text()}`);
        });
      }
      
      if (this.config.logErrors !== false) {
        this.page.on('pageerror', error => {
          console.error('PAGE ERROR:', error.message);
        });
      }
      
      if (this.config.logRequests !== false) {
        this.page.on('requestfailed', request => {
          console.warn('REQUEST FAILED:', `${request.url()} - ${request.failure()?.errorText}`);
        });
      }
      
      // Navigate to benchmark page
      const navigationTimeout = this.config.navigationTimeout || 30000;
      await this.page.goto('http://localhost:2025/', { 
        waitUntil: 'networkidle0',
        timeout: navigationTimeout
      });
      
      // Wait for WebAssembly modules to be ready
      if (this.config.waitForWasm !== false) {
        await this.waitForWasmModules(this.config.wasmTimeout || 30000);
      }
      
      this.setupComplete = true;
      return this.page;
      
    } catch (error) {
      await this.teardown(true); // Force cleanup on failure
      throw new Error(`Browser setup failed: ${error.message}. Check that dev server is running on localhost:2025`);
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
      
      return errorResult;
    }
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