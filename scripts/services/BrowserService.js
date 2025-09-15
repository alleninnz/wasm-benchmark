/**
 * Browser Service
 * Manages browser lifecycle and page interactions
 */

import chalk from 'chalk';
import { LoggingService } from './LoggingService.js';
import { IBrowserService } from '../interfaces/IBrowserService.js';

export class BrowserService extends IBrowserService {
    constructor(loggingService = null) {
        super();
        this.browser = null;
        this.page = null;
        this.puppeteer = null;
        this.logger = loggingService || new LoggingService({ prefix: 'Browser' });
    }

    /**
     * Initialize browser with configuration
     * @param {Object} browserConfig - Browser configuration options
     * @returns {Promise<void>}
     */
    async initialize(browserConfig = {}) {
        this.puppeteer = (await import('puppeteer')).default;

        const config = {
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
            ],
            ...browserConfig
        };

        try {
            this.browser = await this.puppeteer.launch(config);
            this.page = await this.browser.newPage();

            // Set default timeout
            this.page.setDefaultTimeout(30000);

            // Configure console logging
            this.page.on('console', msg => {
                const type = msg.type();
                if (type === 'error' || type === 'warning') {
                    console.log(chalk.gray(`Browser ${type}: ${msg.text()}`));
                }
            });

            // Handle page errors
            this.page.on('pageerror', error => {
                console.error(chalk.red('Page error:'), error.message);
            });

        } catch (error) {
            throw new Error(`Failed to initialize browser: ${error.message}`);
        }
    }

    /**
     * Create a new page for parallel execution
     * @returns {Promise<Object>} New page instance
     */
    async createNewPage() {
        if (!this.browser) {
            throw new Error('Browser not initialized. Call initialize() first.');
        }

        try {
            const page = await this.browser.newPage();
            page.setDefaultTimeout(30000);

            // Configure console logging for new page
            page.on('console', msg => {
                const type = msg.type();
                if (type === 'error' || type === 'warning') {
                    console.log(chalk.gray(`Browser ${type}: ${msg.text()}`));
                }
            });

            // Handle page errors for new page
            page.on('pageerror', error => {
                console.error(chalk.red('Page error:'), error.message);
            });

            return page;
        } catch (error) {
            throw new Error(`Failed to create new page: ${error.message}`);
        }
    }

    /**
     * Navigate to URL and wait for page load
     * @param {string} url - URL to navigate to
     * @param {Object} options - Navigation options
     * @returns {Promise<void>}
     */
    async navigateTo(url, options = {}) {
        if (!this.page) {
            throw new Error('Browser not initialized. Call initialize() first.');
        }

        const navigationOptions = {
            waitUntil: 'networkidle0',
            timeout: 30000,
            ...options
        };

        try {
            await this.page.goto(url, navigationOptions);

            // Wait for basic page elements
            await this.page.waitForSelector('body', { timeout: 10000 });

        } catch (error) {
            throw new Error(`Failed to navigate to ${url}: ${error.message}`);
        }
    }

    /**
     * Execute JavaScript in browser context
     * @param {string|Function} script - JavaScript code or function to execute
     * @param {...any} args - Arguments to pass to the function
     * @returns {Promise<any>} Result of script execution
     */
    async executeScript(script, ...args) {
        if (!this.page) {
            throw new Error('Browser not initialized. Call initialize() first.');
        }

        try {
            return await this.page.evaluate(script, ...args);
        } catch (error) {
            throw new Error(`Script execution failed: ${error.message}`);
        }
    }

    /**
     * Wait for element to be available
     * @param {string} selector - CSS selector to wait for
     * @param {Object} options - Wait options
     * @returns {Promise<void>}
     */
    async waitForElement(selector, options = {}) {
        if (!this.page) {
            throw new Error('Browser not initialized. Call initialize() first.');
        }

        const waitOptions = {
            timeout: 30000,
            ...options
        };

        try {
            await this.page.waitForSelector(selector, waitOptions);
        } catch (error) {
            throw new Error(`Element ${selector} not found: ${error.message}`);
        }
    }

    /**
     * Take screenshot of current page
     * @param {string} filepath - Path to save screenshot
     * @param {Object} options - Screenshot options
     * @returns {Promise<void>}
     */
    async takeScreenshot(filepath, options = {}) {
        if (!this.page) {
            throw new Error('Browser not initialized. Call initialize() first.');
        }

        const screenshotOptions = {
            fullPage: true,
            ...options
        };

        try {
            await this.page.screenshot({
                path: filepath,
                ...screenshotOptions
            });
        } catch (error) {
            throw new Error(`Screenshot failed: ${error.message}`);
        }
    }

    /**
     * Get page title
     * @returns {Promise<string>} Page title
     */
    async getTitle() {
        if (!this.page) {
            throw new Error('Browser not initialized. Call initialize() first.');
        }

        try {
            return await this.page.title();
        } catch (error) {
            throw new Error(`Failed to get page title: ${error.message}`);
        }
    }

    /**
     * Get page URL
     * @returns {Promise<string>} Current page URL
     */
    async getUrl() {
        if (!this.page) {
            throw new Error('Browser not initialized. Call initialize() first.');
        }

        try {
            return this.page.url();
        } catch (error) {
            throw new Error(`Failed to get page URL: ${error.message}`);
        }
    }

    /**
     * Check if browser is initialized and ready
     * @returns {boolean} True if browser is ready
     */
    isReady() {
        return !!(this.browser && this.page && !this.browser.process()?.killed);
    }

    /**
     * Get browser process info
     * @returns {Object} Browser process information
     */
    getProcessInfo() {
        if (!this.browser) {
            return null;
        }

        const process = this.browser.process();
        return {
            pid: process?.pid,
            killed: process?.killed,
            connected: this.browser.isConnected()
        };
    }

    /**
     * Set page timeout
     * @param {number} timeout - Timeout in milliseconds
     */
    setTimeout(timeout) {
        if (this.page) {
            this.page.setDefaultTimeout(timeout);
        }
    }

    /**
     * Clear browser cache and storage
     * @returns {Promise<void>}
     */
    async clearCache() {
        if (!this.page) {
            throw new Error('Browser not initialized. Call initialize() first.');
        }

        try {
            // Clear cache
            await this.page.evaluate(() => {
                if ('caches' in window) {
                    caches.keys().then(names => {
                        names.forEach(name => caches.delete(name));
                    });
                }
            });

            // Clear local storage
            await this.page.evaluate(() => {
                if (typeof Storage !== 'undefined') {
                    localStorage.clear();
                    sessionStorage.clear();
                }
            });

        } catch (error) {
            console.warn(chalk.yellow('Failed to clear cache:'), error.message);
        }
    }

    /**
     * Reload current page
     * @param {Object} options - Reload options
     * @returns {Promise<void>}
     */
    async reload(options = {}) {
        if (!this.page) {
            throw new Error('Browser not initialized. Call initialize() first.');
        }

        const reloadOptions = {
            waitUntil: 'networkidle0',
            timeout: 30000,
            ...options
        };

        try {
            await this.page.reload(reloadOptions);
        } catch (error) {
            throw new Error(`Page reload failed: ${error.message}`);
        }
    }

    /**
     * Close current page
     * @returns {Promise<void>}
     */
    async closePage() {
        if (this.page) {
            try {
                await this.page.close();
                this.page = null;
            } catch (error) {
                console.warn(chalk.yellow('Failed to close page:'), error.message);
            }
        }
    }

    /**
     * Close browser and cleanup resources
     * @returns {Promise<void>}
     */
    async cleanup() {
        try {
            if (this.page) {
                await this.page.close();
                this.page = null;
            }

            if (this.browser) {
                await this.browser.close();
                this.browser = null;
            }
        } catch (error) {
            console.warn(chalk.yellow('Browser cleanup warning:'), error.message);

            // Force kill if close fails
            if (this.browser && this.browser.process()) {
                try {
                    this.browser.process().kill('SIGKILL');
                } catch (killError) {
                    console.warn(chalk.yellow('Failed to force kill browser process:'), killError.message);
                }
            }
        } finally {
            this.browser = null;
            this.page = null;
            this.puppeteer = null;
        }
    }

    /**
     * Force emergency cleanup
     * @returns {Promise<void>}
     */
    async emergencyCleanup() {
        console.warn(chalk.yellow('Performing emergency browser cleanup...'));

        try {
            // Force close any remaining browser instances
            if (this.browser && this.browser.isConnected && this.browser.isConnected()) {
                await this.browser.close();
            }

        } catch (error) {
            console.warn(chalk.yellow('Emergency cleanup error:'), error.message);
        }
    }
}
