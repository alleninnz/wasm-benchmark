/**
 * Results Service Interface
 * Defines the contract for benchmark results processing services
 */

export class IResultsService {
    /**
     * Initialize results collection
     * @param {Object} metadata - Initial metadata for the results
     */
    initialize(metadata) {
        throw new Error('initialize method must be implemented');
    }

    /**
     * Add benchmark result
     * @param {Object} result - Benchmark result data
     */
    addResult(result) {
        throw new Error('addResult method must be implemented');
    }

    /**
     * Finalize results collection
     * @param {Object} additionalMetadata - Additional metadata to include
     */
    finalize(additionalMetadata) {
        throw new Error('finalize method must be implemented');
    }

    /**
     * Get current results
     * @returns {Array} Array of results
     */
    getResults() {
        throw new Error('getResults method must be implemented');
    }

    /**
     * Get results summary
     * @returns {Object} Summary statistics
     */
    getSummary() {
        throw new Error('getSummary method must be implemented');
    }

    /**
     * Get failed results only
     * @returns {Array} Array of failed results
     */
    getFailedResults() {
        throw new Error('getFailedResults method must be implemented');
    }

    /**
     * Get successful results only
     * @returns {Array} Array of successful results
     */
    getSuccessfulResults() {
        throw new Error('getSuccessfulResults method must be implemented');
    }

    /**
     * Filter results by criteria
     * @param {Function|Object} criteria - Filter function or criteria object
     * @returns {Array<Object>} Filtered results array
     */
    filterResults(criteria) {
        throw new Error('filterResults method must be implemented');
    }

    /**
     * Generate formatted report
     * @param {string} format - Report format ('json', 'text', 'csv')
     * @returns {string} Formatted report
     */
    generateReport(format) {
        throw new Error('generateReport method must be implemented');
    }

    /**
     * Save results to file
     * @param {string} filepath - Path to save file
     * @param {string} format - File format
     * @param {Object} options - Save options
     * @returns {Promise<void>}
     */
    async saveToFile(filepath, format, options) {
        throw new Error('saveToFile method must be implemented');
    }

    /**
     * Load results from file
     * @param {string} filepath - Path to load from
     * @returns {Promise<Object>} Loaded results data
     */
    async loadFromFile(filepath) {
        throw new Error('loadFromFile method must be implemented');
    }

    /**
     * Clear all results
     */
    clear() {
        throw new Error('clear method must be implemented');
    }

    /**
     * Get results statistics
     * @returns {Object} Statistics object
     */
    getStatistics() {
        throw new Error('getStatistics method must be implemented');
    }
}
