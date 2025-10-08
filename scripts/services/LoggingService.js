/**
 * Logging Service
 * Centralized logging functionality with chalk colors and different log levels
 */

import chalk from 'chalk';
import { ILoggingService } from '../interfaces/ILoggingService.js';
// Temporarily comment out to debug hang issue
// import { TerminalProgressUI } from '../utils/TerminalProgressUI.js';

export class LoggingService extends ILoggingService {
    constructor(options = {}) {
        super();
        this.logLevel = options.logLevel || 'info';
        this.enableColors = options.enableColors !== false;
        this.enableTimestamp = options.enableTimestamp === true;
        this.prefix = options.prefix || '';

        // Log levels hierarchy: error < warn < info < debug
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };

        // Progress UI integration
        this.progressUI = null;
    }

    /**
     * Check if a log level should be output
     * @param {string} level - Log level to check
     * @returns {boolean}
     */
    shouldLog(level) {
        return this.levels[level] <= this.levels[this.logLevel];
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
     * Log info message
     * @param {string} message - Message to log
     * @param {...any} args - Additional arguments
     */
    info(message, ...args) {
        if (!this.shouldLog('info')) return;

        // Route to progress UI if enabled
        if (this.progressUI) {
            this.progressUI.log('info', this._formatMessage(message, args));
            return;
        }

        const formattedMessage = this.enableColors
            ? chalk.blue('[INFO]')
            : '[INFO]';

        console.log(
            `${this.getTimestamp() +
            this.getPrefix() +
            formattedMessage} ${
                message}`,
            ...args
        );
    }

    /**
     * Log success message
     * @param {string} message - Message to log
     * @param {...any} args - Additional arguments
     */
    success(message, ...args) {
        if (!this.shouldLog('info')) return;

        // Route to progress UI if enabled
        if (this.progressUI) {
            this.progressUI.log('success', this._formatMessage(message, args));
            return;
        }

        const formattedMessage = this.enableColors
            ? chalk.green('[SUCCESS]')
            : '[SUCCESS]';

        console.log(
            `${this.getTimestamp() +
            this.getPrefix() +
            formattedMessage} ${
                message}`,
            ...args
        );
    }

    /**
     * Log warning message
     * @param {string} message - Message to log
     * @param {...any} args - Additional arguments
     */
    warn(message, ...args) {
        if (!this.shouldLog('warn')) return;

        // Route to progress UI if enabled
        if (this.progressUI) {
            this.progressUI.log('warn', this._formatMessage(message, args));
            return;
        }

        const formattedMessage = this.enableColors
            ? chalk.yellow('[WARNING]')
            : '[WARNING]';

        console.warn(
            `${this.getTimestamp() +
            this.getPrefix() +
            formattedMessage} ${
                message}`,
            ...args
        );
    }

    /**
     * Log error message
     * @param {string} message - Message to log
     * @param {...any} args - Additional arguments
     */
    error(message, ...args) {
        if (!this.shouldLog('error')) return;

        // Route to progress UI if enabled
        if (this.progressUI) {
            this.progressUI.log('error', this._formatMessage(message, args));
            return;
        }

        const formattedMessage = this.enableColors
            ? chalk.red('[ERROR]')
            : '[ERROR]';

        console.error(
            `${this.getTimestamp() +
            this.getPrefix() +
            formattedMessage} ${
                message}`,
            ...args
        );
    }

    /**
     * Log debug message
     * @param {string} message - Message to log
     * @param {...any} args - Additional arguments
     */
    debug(message, ...args) {
        if (!this.shouldLog('debug')) return;

        // Route to progress UI if enabled
        if (this.progressUI) {
            this.progressUI.log('debug', this._formatMessage(message, args));
            return;
        }

        const formattedMessage = this.enableColors
            ? chalk.gray('[DEBUG]')
            : '[DEBUG]';

        console.log(
            `${this.getTimestamp() +
            this.getPrefix() +
            formattedMessage} ${
                message}`,
            ...args
        );
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
