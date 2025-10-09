/**
 * Logging Service
 * Centralized logging functionality with chalk colors and different log levels
 */

import chalk from 'chalk';
import { ILoggingService } from '../interfaces/ILoggingService.js';

// Log level priorities
const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};

export class LoggingService extends ILoggingService {
    constructor(options = {}) {
        super();
        this.logLevel = options.logLevel || 'info';
        this.enableColors = options.enableColors !== false;
        this.enableTimestamp = options.enableTimestamp === true;
        this.prefix = options.prefix || '';

        // Use shared log level constants
        this.levels = LOG_LEVELS;

        // Progress UI integration
        this.progressUI = null;
    }

    /**
     * Check if a log level should be output
     * @param {string} level - Log level to check
     * @returns {boolean}
     */
    shouldLog(level) {
        const levelValue = this.levels[level.toUpperCase()] ?? this.levels.INFO;
        const currentLevelValue = this.levels[this.logLevel.toUpperCase()] ?? this.levels.INFO;
        return levelValue <= currentLevelValue;
    }

    /**
     * Format timestamp
     * @returns {string}
     */
    getTimestamp() {
        if (!this.enableTimestamp) return '';
        return `[${new Date().toISOString()}] `;
    }

    /**
     * Format prefix
     * @returns {string}
     */
    getPrefix() {
        return this.prefix ? `[${this.prefix}] ` : '';
    }

    /**
     * Format message with args
     * @param {string} message - Message to format
     * @param {...any} args - Additional arguments
     * @returns {string}
     */
    _formatMessage(message, args) {
        if (args.length === 0) return message;
        return `${message} ${args.join(' ')}`;
    }

    /**
     * Generic log method with level-specific handling
     * @param {string} level - Log level
     * @param {string} message - Message to log
     * @param {Array} args - Additional arguments
     * @param {Function} outputFn - Console output function
     * @private
     */
    _log(level, message, args, outputFn = console.log) {
        if (!this.shouldLog(level)) return;

        // Route to progress UI if enabled
        if (this.progressUI) {
            this.progressUI.log(level, this._formatMessage(message, args));
            return;
        }

        const formattedMessage = this.enableColors
            ? this._getColoredLevel(level)
            : `[${level.toUpperCase()}]`;

        outputFn(`${this.getTimestamp()}${this.getPrefix()}${formattedMessage} ${message}`, ...args);
    }

    /**
     * Get colored level label
     * @param {string} level - Log level
     * @returns {string} Colored level label
     * @private
     */
    _getColoredLevel(level) {
        const colorMap = {
            info: chalk.blue('[INFO]'),
            success: chalk.green('[SUCCESS]'),
            warn: chalk.yellow('[WARNING]'),
            error: chalk.red('[ERROR]'),
            debug: chalk.gray('[DEBUG]')
        };
        return colorMap[level] || chalk.white(`[${level.toUpperCase()}]`);
    }

    /**
     * Log info message
     * @param {string} message - Message to log
     * @param {...any} args - Additional arguments
     */
    info(message, ...args) {
        this._log('info', message, args, console.log);
    }

    /**
     * Log success message
     * @param {string} message - Message to log
     * @param {...any} args - Additional arguments
     */
    success(message, ...args) {
        this._log('success', message, args, console.log);
    }

    /**
     * Log warning message
     * @param {string} message - Message to log
     * @param {...any} args - Additional arguments
     */
    warn(message, ...args) {
        this._log('warn', message, args, console.warn);
    }

    /**
     * Log error message
     * @param {string} message - Message to log
     * @param {...any} args - Additional arguments
     */
    error(message, ...args) {
        this._log('error', message, args, console.error);
    }

    /**
     * Log debug message
     * @param {string} message - Message to log
     * @param {...any} args - Additional arguments
     */
    debug(message, ...args) {
        this._log('debug', message, args, console.log);
    }

    /**
     * Log section header
     * @param {string} message - Section title
     */
    section(message) {
        if (!this.shouldLog('info')) return;

        // Route to progress UI if enabled
        if (this.progressUI) {
            this.progressUI.log('info', '');
            this.progressUI.log('info', '======================================');
            this.progressUI.log('info', ` ${message}`);
            this.progressUI.log('info', '======================================');
            this.progressUI.log('info', '');
            return;
        }

        console.log();
        const line = '======================================';
        const formattedLine = this.enableColors ? chalk.magenta(line) : line;
        const formattedMessage = this.enableColors ? chalk.magenta(` ${message}`) : ` ${message}`;

        console.log(this.getTimestamp() + this.getPrefix() + formattedLine);
        console.log(this.getTimestamp() + this.getPrefix() + formattedMessage);
        console.log(this.getTimestamp() + this.getPrefix() + formattedLine);
        console.log();
    }

    /**
     * Log progress information
     * @param {string} message - Progress message
     * @param {number} current - Current progress
     * @param {number} total - Total items
     */
    progress(message, current, total) {
        if (!this.shouldLog('info')) return;

        const percentage = total > 0 ? ((current / total) * 100).toFixed(1) : '0.0';
        const progressBar = this.createProgressBar(current, total);

        const formattedMessage = this.enableColors
            ? chalk.cyan('[PROGRESS]')
            : '[PROGRESS]';

        console.log(
            `${this.getTimestamp() +
            this.getPrefix() +
            formattedMessage} ${
                message} ${
                progressBar} ` +
            `${percentage}% (${current}/${total})`
        );
    }

    /**
     * Create a simple progress bar
     * @param {number} current - Current progress
     * @param {number} total - Total items
     * @returns {string}
     */
    createProgressBar(current, total, width = 20) {
        if (total === 0) return '[]';

        const filled = Math.round((current / total) * width);
        const empty = width - filled;

        const bar = '█'.repeat(filled) + '░'.repeat(empty);
        return this.enableColors ? chalk.blue(`[${bar}]`) : `[${bar}]`;
    }

    /**
     * Set log level
     * @param {string} level - New log level (error, warn, info, debug)
     */
    setLogLevel(level) {
        if (Object.prototype.hasOwnProperty.call(this.levels, level)) {
            this.logLevel = level;
        } else {
            this.warn(`Invalid log level: ${level}. Using 'info' instead.`);
            this.logLevel = 'info';
        }
    }

    /**
     * Enable or disable colors
     * @param {boolean} enabled - Whether to enable colors
     */
    setColors(enabled) {
        this.enableColors = enabled;
    }

    /**
     * Enable or disable timestamps
     * @param {boolean} enabled - Whether to enable timestamps
     */
    setTimestamp(enabled) {
        this.enableTimestamp = enabled;
    }

    /**
     * Set service prefix
     * @param {string} prefix - Prefix for log messages
     */
    setPrefix(prefix) {
        this.prefix = prefix;
    }

    /**
     * Create a child logger with a specific prefix
     * @param {string} prefix - Prefix for the child logger
     * @returns {LoggingService}
     */
    child(prefix) {
        return new LoggingService({
            logLevel: this.logLevel,
            enableColors: this.enableColors,
            enableTimestamp: this.enableTimestamp,
            prefix: this.prefix ? `${this.prefix}:${prefix}` : prefix
        });
    }

    /**
     * Enable progress UI for terminal display
     * @param {number} totalTasks - Total number of tasks
     * @param {Object} options - Progress UI options
     * @returns {boolean} - True if successfully enabled
     */
    async enableProgressUI(totalTasks, options = {}) {
        // Suppress blessed terminfo debug output completely during import
        const originalStderrWrite = process.stderr.write;
        const originalTerm = process.env.TERM;

        try {
            // Suppress stderr during blessed module loading
            // blessed outputs JS code when parsing xterm-256color's Setulc
            process.stderr.write = function() { return true; };

            // Set TERM to xterm to avoid triggering the problematic Setulc parsing
            if (process.env.TERM === 'xterm-256color') {
                process.env.TERM = 'xterm';
            }

            // Lazy load TerminalProgressUI (this triggers blessed import)
            const { TerminalProgressUI } = await import('../utils/TerminalProgressUI.js');

            // Restore stderr and TERM immediately after import
            process.stderr.write = originalStderrWrite;
            if (originalTerm) {
                process.env.TERM = originalTerm;
            }

            this.progressUI = new TerminalProgressUI(options);
            this.progressUI.initialize();
            this.progressUI.updateProgress(0, totalTasks, 'Initializing...');
            return true;
        } catch (error) {
            // Make sure to restore stderr even on error
            process.stderr.write = originalStderrWrite;
            if (originalTerm) {
                process.env.TERM = originalTerm;
            }

            this.warn(`Failed to initialize progress UI: ${error.message}`);
            if (error.stack) {
                this.debug(`Stack trace: ${error.stack}`);
            }
            this.warn('Falling back to standard console output');
            this.progressUI = null;
            return false;
        }
    }

    /**
     * Wait for user to exit progress UI (shows completion message)
     * @returns {Promise<void>}
     */
    async waitForProgressUIExit() {
        if (this.progressUI) {
            await this.progressUI.waitForExit();
        }
    }

    /**
     * Disable and cleanup progress UI
     */
    disableProgressUI() {
        if (this.progressUI) {
            this.progressUI.destroy();
            this.progressUI = null;
        }
    }
}
