/**
 * Terminal Progress UI
 * Blessed-based TUI for displaying progress bar and scrolling logs
 *
 * Note: TERM environment variable must be set to 'xterm' before importing this module
 * to avoid blessed terminfo parsing debug output. This is handled in LoggingService.enableProgressUI()
 */

import blessed from 'blessed';

export class TerminalProgressUI {
    constructor(options = {}) {
        // Configuration
        this.options = {
            minTerminalHeight: 10,
            maxLogBuffer: 1000,
            progressHeight: 3,
            borderStyle: 'line',
            renderDebounceMs: 100,
            ...options
        };

        // Blessed components
        this.screen = null;
        this.progressBox = null;
        this.logBox = null;

        // State management
        this.startTime = Date.now();
        this.lastTaskTime = this.startTime;
        this.taskTimes = [];
        this.currentTask = '';
        this.completedTasks = 0;
        this.totalTasks = 0;

        // Performance optimization
        this.renderTimer = null;
        this.pendingRender = false;
    }

    /**
     * Check if terminal supports blessed UI
     * @returns {boolean}
     */
    checkCompatibility() {
        // Check if TTY
        if (!process.stdout.isTTY) {
            return false;
        }

        // Check terminal dimensions
        const height = process.stdout.rows || 24;
        const width = process.stdout.columns || 80;

        if (height < this.options.minTerminalHeight || width < 40) {
            return false;
        }

        // Check TERM environment
        const term = (process.env.TERM || '').toLowerCase();
        const unsupportedTerms = ['dumb', 'unknown', ''];
        if (unsupportedTerms.includes(term)) {
            return false;
        }

        // Check if running in CI environment
        if (process.env.CI === 'true') {
            return false;
        }

        return true;
    }

    /**
     * Initialize blessed screen and components
     */
    initialize() {
        if (!this.checkCompatibility()) {
            throw new Error('Terminal not compatible with blessed UI');
        }

        // Suppress blessed terminfo debug output during screen creation
        // blessed.screen() also parses terminfo and may output debug code
        const originalStderrWrite = process.stderr.write;
        const originalTerm = process.env.TERM;

        try {
            // Temporarily suppress stderr and set TERM to xterm
            process.stderr.write = function() { return true; };
            if (process.env.TERM === 'xterm-256color') {
                process.env.TERM = 'xterm';
            }

            // Create blessed screen
            this.screen = blessed.screen({
                smartCSR: true,
                fastCSR: true,
                fullUnicode: false,  // Keep disabled for compatibility
                dockBorders: true,
                title: 'WASM Benchmark Progress',
                warnings: false  // Suppress terminal capability warnings
            });

            // Restore stderr and TERM immediately
            process.stderr.write = originalStderrWrite;
            if (originalTerm) {
                process.env.TERM = originalTerm;
            }
        } catch (error) {
            // Restore on error
            process.stderr.write = originalStderrWrite;
            if (originalTerm) {
                process.env.TERM = originalTerm;
            }
            throw error;
        }

        // Create progress box (top fixed area)
        this.progressBox = blessed.box({
            top: 0,
            left: 0,
            width: '100%',
            height: this.options.progressHeight,
            border: {
                type: this.options.borderStyle
            },
            style: {
                border: { fg: 'cyan' }
            },
            label: ' Progress ',
            tags: true
        });

        // Create log box (scrollable area)
        this.logBox = blessed.log({
            top: this.options.progressHeight,
            left: 0,
            width: '100%',
            height: `100%-${this.options.progressHeight}`,
            border: {
                type: this.options.borderStyle
            },
            scrollable: true,
            alwaysScroll: true,
            scrollbar: {
                ch: ' ',
                style: { bg: 'blue' }
            },
            keys: true,
            mouse: true,
            vi: true,  // Enable vi-style navigation for better scrolling
            style: {
                border: { fg: 'green' }
            },
            label: ' Logs (↑↓/PgUp/PgDn | Hold Shift/Option + Mouse to select & copy) ',
            tags: true
        });

        // Assemble layout
        this.screen.append(this.progressBox);
        this.screen.append(this.logBox);

        // Setup event handlers
        this.setupEventHandlers();

        // Focus on log box for keyboard scrolling
        this.logBox.focus();

        // Initial render
        this.render();
    }

    /**
     * Setup keyboard and resize event handlers
     */
    setupEventHandlers() {
        // Ctrl+C to exit gracefully
        this.screen.key(['C-c'], () => {
            this.destroy();
            process.exit(0);
        });

        // q to quit
        this.screen.key(['q'], () => {
            this.destroy();
            process.exit(0);
        });

        // Handle terminal resize
        this.screen.on('resize', () => {
            const newHeight = process.stdout.rows || 24;

            if (newHeight < this.options.minTerminalHeight) {
                this.progressBox.setContent(
                    '{red-fg}!  Terminal too small! Please resize to at least 10 lines{/}'
                );
                this.screen.render();
            } else {
                this.render();
            }
        });
    }

    /**
     * Update progress information
     * @param {number} completedTasks - Number of completed tasks
     * @param {number} totalTasks - Total number of tasks
     * @param {string} currentTask - Name of current task
     */
    updateProgress(completedTasks, totalTasks, currentTask = '') {
        // Record task completion time for ETA calculation
        if (completedTasks > this.completedTasks && this.completedTasks > 0) {
            const now = Date.now();
            const taskDuration = now - this.lastTaskTime;
            this.taskTimes.push(taskDuration);
            this.lastTaskTime = now;

            // Keep only recent task times (last 10)
            if (this.taskTimes.length > 10) {
                this.taskTimes.shift();
            }
        }

        this.completedTasks = completedTasks;
        this.totalTasks = totalTasks;
        this.currentTask = currentTask;

        // Force immediate render for progress updates
        this.renderImmediate();
    }

    /**
     * Add log message
     * @param {string} level - Log level (info, success, warn, error, debug)
     * @param {string} message - Log message
     */
    log(level, message) {
        if (!this.logBox) return;

        const timestamp = new Date().toLocaleTimeString();
        const colorMap = {
            info: '{blue-fg}',
            success: '{green-fg}',
            warn: '{yellow-fg}',
            error: '{red-fg}',
            debug: '{gray-fg}'
        };

        const color = colorMap[level] || '{white-fg}';
        const formatted = `[${timestamp}] ${color}[${level.toUpperCase()}]{/} ${message}`;

        this.logBox.log(formatted);
        this.renderDebounced();
    }

    /**
     * Calculate ETA based on recent task times
     * @returns {number} ETA in milliseconds
     */
    calculateETA() {
        if (this.taskTimes.length === 0 || this.completedTasks === 0) {
            return 0;
        }

        // Use average of recent task times
        const avgTime = this.taskTimes.reduce((a, b) => a + b, 0) / this.taskTimes.length;
        const remainingTasks = Math.max(0, this.totalTasks - this.completedTasks);

        return avgTime * remainingTasks;
    }

    /**
     * Render progress bar content
     */
    renderProgress() {
        if (!this.progressBox) return;

        const progress = this.totalTasks > 0 ? this.completedTasks / this.totalTasks : 0;
        const percent = Math.min(Math.round(progress * 100), 100);

        // Calculate time metrics
        const elapsed = Date.now() - this.startTime;
        const eta = this.calculateETA();

        const elapsedMin = Math.floor(elapsed / 60000);
        const elapsedSec = Math.floor((elapsed % 60000) / 1000);
        const etaMin = Math.floor(eta / 60000);
        const etaSec = Math.floor((eta % 60000) / 1000);

        // Build progress bar
        const boxWidth = this.progressBox.width - 2; // Account for borders
        const barWidth = Math.max(30, boxWidth - 50);
        const filledWidth = Math.round(barWidth * progress);

        const filled = '█'.repeat(filledWidth);
        const empty = '░'.repeat(barWidth - filledWidth);

        // Line 1: Progress bar with percentage and elapsed time
        const line1 = `>  {cyan-fg}[${filled}${empty}]{/} {yellow-fg}{bold}${percent}%{/} | ${elapsedMin}:${String(elapsedSec).padStart(2, '0')} elapsed`;

        // Line 2: ETA and current task
        const taskDisplay = this.currentTask || 'Initializing...';
        const line2 = `#  ETA: {green-fg}${etaMin}:${String(etaSec).padStart(2, '0')}{/} | {blue-fg}${taskDisplay}{/}`;

        // Line 3: Task progress
        const line3 = `*  {cyan-fg}${this.completedTasks}/${this.totalTasks}{/} benchmarks completed`;

        this.progressBox.setContent(`${line1}\n${line2}\n${line3}`);
    }

    /**
     * Immediate render (no debounce)
     */
    renderImmediate() {
        if (!this.screen) return;

        this.renderProgress();
        this.screen.render();
    }

    /**
     * Debounced render for log updates
     */
    renderDebounced() {
        if (!this.screen) return;

        if (this.renderTimer) {
            clearTimeout(this.renderTimer);
        }

        this.renderTimer = setTimeout(() => {
            this.renderProgress();
            this.screen.render();
            this.renderTimer = null;
        }, this.options.renderDebounceMs);
    }

    /**
     * Main render method (debounced)
     */
    render() {
        this.renderDebounced();
    }

    /**
     * Show completion message and wait for user to exit
     * @returns {Promise<void>}
     */
    async waitForExit() {
        if (!this.screen) return;

        // Update progress to 100% and show completion message
        this.completedTasks = this.totalTasks;
        this.currentTask = '✓ All benchmarks completed!';
        this.renderProgress();

        // Add completion message to logs
        this.log('success', '========================================');
        this.log('success', '✓ All benchmarks completed successfully!');
        this.log('success', '========================================');
        this.log('info', '\n* Press ESC or Ctrl+C to exit and view results\n');

        this.screen.render();

        // Wait for user input
        return new Promise((resolve) => {
            this.screen.key(['escape', 'C-c'], () => {
                resolve();
            });
        });
    }

    /**
     * Cleanup and destroy blessed screen
     */
    destroy() {
        if (this.renderTimer) {
            clearTimeout(this.renderTimer);
            this.renderTimer = null;
        }

        if (this.screen) {
            this.screen.destroy();
            this.screen = null;
            this.progressBox = null;
            this.logBox = null;
        }
    }
}
