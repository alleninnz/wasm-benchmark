/**
 * Logging Service
 * Centralized logging functionality with chalk colors and different log levels
 */

import chalk from 'chalk';
import { ILoggingService } from '../interfaces/ILoggingService.js';

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
     * Log info message
     * @param {string} message - Message to log
     * @param {...any} args - Additional arguments
     */
    info(message, ...args) {
        if (!this.shouldLog('info')) return;

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
}
