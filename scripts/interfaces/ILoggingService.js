/**
 * Logging Service Interface
 * Defines the contract for logging services
 */

export class ILoggingService {
    /**
     * Log info message
     * @param {string} message - Message to log
     * @param {...any} args - Additional arguments
     */
    info(message, ...args) {
        throw new Error('info method must be implemented');
    }

    /**
     * Log success message
     * @param {string} message - Message to log
     * @param {...any} args - Additional arguments
     */
    success(message, ...args) {
        throw new Error('success method must be implemented');
    }

    /**
     * Log warning message
     * @param {string} message - Message to log
     * @param {...any} args - Additional arguments
     */
    warn(message, ...args) {
        throw new Error('warn method must be implemented');
    }

    /**
     * Log error message
     * @param {string} message - Message to log
     * @param {...any} args - Additional arguments
     */
    error(message, ...args) {
        throw new Error('error method must be implemented');
    }

    /**
     * Log debug message
     * @param {string} message - Message to log
     * @param {...any} args - Additional arguments
     */
    debug(message, ...args) {
        throw new Error('debug method must be implemented');
    }

    /**
     * Log section header
     * @param {string} message - Section title
     */
    section(message) {
        throw new Error('section method must be implemented');
    }

    /**
     * Log progress information
     * @param {string} message - Progress message
     * @param {number} current - Current progress
     * @param {number} total - Total items
     */
    progress(message, current, total) {
        throw new Error('progress method must be implemented');
    }

    /**
     * Set log level
     * @param {string} level - New log level (error, warn, info, debug)
     */
    setLogLevel(level) {
        throw new Error('setLogLevel method must be implemented');
    }

    /**
     * Create a child logger with a specific prefix
     * @param {string} prefix - Prefix for the child logger
     * @returns {ILoggingService}
     */
    child(prefix) {
        throw new Error('child method must be implemented');
    }
}