/**
 * Smart Server Checker for Test Environment
 * Provides intelligent server status checking with test-level awareness
 */

import chalk from 'chalk';
import { spawn } from 'child_process';
import http from 'http';

/**
 * Test levels that require a running server
 */
const SERVER_REQUIRED_LEVELS = [
    'integration', // Integration tests require the dev server
    'smoke' // Smoke tests also require the dev server (mixed unit + integration)
];

/**
 * Global server process tracking
 */
let serverProcess = null;
const SERVER_STARTUP_TIMEOUT = 30000; // 30 seconds
const SERVER_POLL_INTERVAL = 500; // 500ms

/**
 * Detect if we're running in a test environment
 * @returns {boolean} True if in test environment
 */
function isTestEnvironment() {
    return (
        process.env.NODE_ENV === 'test' ||
        process.env.npm_lifecycle_event?.includes('test') ||
        process.argv.some(arg => arg.includes('vitest') || arg.includes('test'))
    );
}

/**
 * Server status checker
 * @param {number} port - Server port to check
 * @returns {Promise<boolean>} Server running status
 */
async function checkServerStatus(port = null) {
    const targetPort = port || parseInt(process.env.PORT || '2025', 10);

    return new Promise(resolve => {
        const req = http.request(
            {
                hostname: 'localhost',
                port: targetPort,
                method: 'HEAD',
                path: '/',
                timeout: 2000
            },
            res => {
                resolve(res.statusCode >= 200 && res.statusCode < 400);
            }
        );

        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });

        req.end();
    });
}

/**
 * Start the development server automatically
 * @param {number} port - Server port
 * @returns {Promise<boolean>} Success status
 */
async function startServer(port = null) {
    const targetPort = port || parseInt(process.env.PORT || '2025', 10);

    if (serverProcess) {
        console.log(chalk.yellow('🔄 Server process already running, skipping startup'));
        return true;
    }

    console.log(chalk.blue('🚀 Starting development server...'));

    return new Promise(resolve => {
        // Start server with PORT environment variable
        // In test environments, detach process to prevent signal inheritance
        const shouldDetach = isTestEnvironment();

        serverProcess = spawn('pnpm', ['run', 'serve'], {
            env: { ...process.env, PORT: targetPort.toString() },
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: shouldDetach
        });

        let serverStarted = false;

        // Handle server process events
        serverProcess.stdout?.on('data', data => {
            const output = data.toString();
            // Look for server startup indicators
            if (output.includes('Server running') || output.includes(`localhost:${targetPort}`)) {
                if (!serverStarted) {
                    serverStarted = true;
                    console.log(chalk.green('✅ Development server started successfully'));
                    resolve(true);
                }
            }
        });

        serverProcess.stderr?.on('data', data => {
            const error = data.toString();
            if (error.includes('EADDRINUSE') || error.includes('address already in use')) {
                console.log(chalk.yellow('⚠️  Port already in use, assuming server is running'));
                if (!serverStarted) {
                    serverStarted = true;
                    resolve(true);
                }
            }
        });

        serverProcess.on('error', error => {
            console.error(chalk.red('❌ Failed to start server:'), error.message);
            serverProcess = null;
            if (!serverStarted) {
                resolve(false);
            }
        });

        serverProcess.on('exit', code => {
            console.log(chalk.yellow(`🔄 Server process exited with code ${code}`));
            serverProcess = null;
        });

        // Fallback timeout
        setTimeout(() => {
            if (!serverStarted) {
                console.log(chalk.yellow('⏱️  Server startup timeout, checking status...'));
                resolve(true); // Continue to status check
            }
        }, 10000);
    });
}

/**
 * Wait for server to be ready with polling
 * @param {number} port - Server port
 * @returns {Promise<boolean>} Ready status
 */
async function waitForServerReady(port = null) {
    const targetPort = port || parseInt(process.env.PORT || '2025', 10);
    const startTime = Date.now();

    console.log(chalk.blue('🔍 Waiting for server to be ready...'));

    while (Date.now() - startTime < SERVER_STARTUP_TIMEOUT) {
        const isReady = await checkServerStatus(targetPort);

        if (isReady) {
            console.log(chalk.green(`✅ Server ready on http://localhost:${targetPort}`));
            return true;
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, SERVER_POLL_INTERVAL));
    }

    console.error(chalk.red(`❌ Server failed to start within ${SERVER_STARTUP_TIMEOUT / 1000}s timeout`));
    return false;
}

/**
 * Cleanup server process (optional - for graceful shutdown)
 */
function cleanupServerProcess() {
    if (serverProcess) {
        console.log(chalk.yellow('🧹 Cleaning up server process...'));
        try {
            serverProcess.kill('SIGTERM');
            setTimeout(() => {
                if (serverProcess && !serverProcess.killed) {
                    serverProcess.kill('SIGKILL');
                }
            }, 5000);
        } catch (error) {
            // Ignore cleanup errors
        }
        serverProcess = null;
    }
}

// Test-aware cleanup: only cleanup on actual process termination, not worker transitions
// Only register cleanup for main process termination in non-test environments
// In test environments, let the test runner manage server lifecycle
if (!isTestEnvironment()) {
    process.on('exit', cleanupServerProcess);
    process.on('SIGINT', () => {
        cleanupServerProcess();
        process.exit(0);
    });
    process.on('SIGTERM', () => {
        cleanupServerProcess();
        process.exit(0);
    });
} else {
    // In test environments, only cleanup on explicit SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
        console.log(chalk.yellow('🛑 Received SIGINT, cleaning up server...'));
        cleanupServerProcess();
        process.exit(0);
    });
}

/**
 * Determines if current test run requires server
 * @returns {boolean} Whether server is required
 */
function requiresServer() {
    // Method 1: Check npm script context - unit tests never need server
    const npmLifecycleEvent = process.env.npm_lifecycle_event;

    if (npmLifecycleEvent === 'test:unit') {
        return false;
    }

    // Method 2: Check test level from environment
    const testLevel = process.env.WASM_BENCH_TEST_LEVEL;

    if (testLevel && SERVER_REQUIRED_LEVELS.includes(testLevel)) {
        return true;
    }

    // Method 3: Check if any integration test files are being run
    // Look at process arguments for tests/integration paths
    const cmdLine = process.argv.join(' ');
    if (cmdLine.includes('tests/integration')) {
        return true;
    }

    // Method 4: Check npm script patterns that typically require server
    if (npmLifecycleEvent) {
        const serverRequiredScripts = ['test:integration', 'test:smoke', 'test'];
        if (serverRequiredScripts.includes(npmLifecycleEvent)) {
            return true;
        }
    }

    // Default to not requiring server for explicit unit test scenarios
    if (testLevel === 'unit') {
        return false;
    }

    // Conservative default: if unclear, require server
    return true;
}

/**
 * Smart server validation with contextual error messages
 * @param {Object} options - Configuration options
 * @returns {Promise<void>} Throws error if server required but not running
 */
async function validateServerIfNeeded(options = {}) {
    const { port = null, silent = false, testContext = 'unknown' } = options;

    const needsServer = requiresServer();

    if (!needsServer) {
        if (!silent) {
            console.log(chalk.gray('ℹ️  Server check skipped - unit tests only'));
        }
        return;
    }

    const targetPort = port || parseInt(process.env.PORT || '2025', 10);

    if (!silent) {
        console.log(chalk.blue(`🔍 Checking server status for ${testContext} tests...`));
    }

    const isRunning = await checkServerStatus(targetPort);

    if (isRunning) {
        if (!silent) {
            console.log(chalk.green(`✅ Server already running on http://localhost:${targetPort}`));
        }
        return;
    }

    // Server not running - attempt to start it automatically
    if (!silent) {
        console.log(chalk.yellow('🚀 Server not running, starting automatically...'));
    }

    try {
        // Start server
        const startSuccess = await startServer(targetPort);

        if (!startSuccess) {
            throw new Error('Failed to start server process');
        }

        // Wait for server to be ready
        const readySuccess = await waitForServerReady(targetPort);

        if (!readySuccess) {
            throw new Error('Server started but failed to become ready');
        }

        if (!silent) {
            console.log(chalk.green('🎉 Server auto-start completed successfully!'));
        }
    } catch (error) {
        console.error(chalk.red('❌ Failed to auto-start development server'));
        console.error('');
        console.error(chalk.yellow(`Error: ${error.message}`));
        console.error(chalk.yellow('Please start the server manually:'));
        console.error(chalk.cyan('  pnpm run serve'));
        console.error(chalk.gray('  # or with auto-open:'));
        console.error(chalk.cyan('  pnpm run dev'));
        console.error('');

        throw new Error(`Auto-start failed for ${testContext} tests: ${error.message}`);
    }
}

export {
    checkServerStatus,
    requiresServer,
    SERVER_REQUIRED_LEVELS,
    startServer,
    validateServerIfNeeded,
    waitForServerReady
};

// Default export for convenience
export default {
    checkServerStatus,
    requiresServer,
    validateServerIfNeeded,
    startServer,
    waitForServerReady,
    SERVER_REQUIRED_LEVELS
};
