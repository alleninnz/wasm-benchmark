/**
 * Browser Service Interface
 * Defines the contract for browser automation services
 */

export class IBrowserService {
    /**
     * Initialize browser with configuration
     * @param {Object} browserConfig - Browser configuration options
     * @param {boolean} [browserConfig.headless=true] - Run browser in headless mode
     * @param {string[]} [browserConfig.args] - Additional browser arguments
     * @param {number} [browserConfig.protocolTimeout] - Protocol timeout in milliseconds
     * @returns {Promise<void>} Resolves when browser is initialized
     * @throws {Error} If browser initialization fails
     */
    async initialize(browserConfig) {
        throw new Error('initialize method must be implemented');
    }

    /**
     * Navigate to URL and wait for page load
     * @param {string} url - URL to navigate to
     * @param {Object} [options] - Navigation options
     * @param {string} [options.waitUntil='networkidle0'] - When to consider navigation succeeded
     * @param {number} [options.timeout] - Navigation timeout in milliseconds
     * @returns {Promise<void>} Resolves when navigation is complete
     * @throws {Error} If navigation fails or times out
     */
    async navigateTo(url, options) {
        throw new Error('navigateTo method must be implemented');
    }

    /**
     * Execute JavaScript in browser context
     * @param {string|Function} script - JavaScript code or function to execute
     * @param {...any} args - Arguments to pass to the function
     * @returns {Promise<any>} Result of script execution
     * @throws {Error} If script execution fails
     */
    async executeScript(script, ...args) {
        throw new Error('executeScript method must be implemented');
    }

    /**
     * Wait for element to be available
     * @param {string} selector - CSS selector to wait for
     * @param {Object} options - Wait options
     * @returns {Promise<void>}
     */
    async waitForElement(selector, options) {
        throw new Error('waitForElement method must be implemented');
    }

    /**
     * Take screenshot of current page
     * @param {string} filepath - Path to save screenshot
     * @param {Object} options - Screenshot options
     * @returns {Promise<void>}
     */
    async takeScreenshot(filepath, options) {
        throw new Error('takeScreenshot method must be implemented');
    }

    /**
     * Check if browser is initialized and ready
     * @returns {boolean} True if browser is ready
     */
    isReady() {
        throw new Error('isReady method must be implemented');
    }

    /**
     * Set page timeout
     * @param {number} timeout - Timeout in milliseconds
     */
    setTimeout(timeout) {
        throw new Error('setTimeout method must be implemented');
    }

    /**
     * Close browser and cleanup resources
     * @returns {Promise<void>}
     */
    async cleanup() {
        throw new Error('cleanup method must be implemented');
    }

    /**
     * Force emergency cleanup
     * @returns {Promise<void>}
     */
    async emergencyCleanup() {
        throw new Error('emergencyCleanup method must be implemented');
    }
}
