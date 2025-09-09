/**
 * Smart Server Checker for Test Environment
 * Provides intelligent server status checking with test-level awareness
 */

import http from 'http';
import chalk from 'chalk';

/**
 * Test levels that require a running server
 */
const SERVER_REQUIRED_LEVELS = [
  'integration', 
  'e2e', 
  'stress',
  'full'
];

/**
 * Server status checker
 * @param {number} port - Server port to check
 * @returns {Promise<boolean>} Server running status
 */
async function checkServerStatus(port = null) {
  const targetPort = port || parseInt(process.env.PORT || '2025', 10);
  
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: targetPort,
      method: 'HEAD',
      path: '/',
      timeout: 2000
    }, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

/**
 * Determines if current test run requires server
 * @returns {boolean} Whether server is required
 */
function requiresServer() {
  // Check test level from environment
  const testLevel = process.env.WASM_BENCH_TEST_LEVEL;
  if (testLevel && SERVER_REQUIRED_LEVELS.includes(testLevel)) {
    return true;
  }
  
  // Check Vitest test name patterns (fallback)
  const testNamePatterns = process.argv.join(' ');
  const hasServerTests = SERVER_REQUIRED_LEVELS.some(level => 
    testNamePatterns.includes(`tests/${level}`) || 
    testNamePatterns.includes(level)
  );
  
  return hasServerTests;
}

/**
 * Smart server validation with contextual error messages
 * @param {Object} options - Configuration options
 * @returns {Promise<void>} Throws error if server required but not running
 */
async function validateServerIfNeeded(options = {}) {
  const {
    port = null,
    silent = false,
    testContext = 'unknown'
  } = options;
  
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
      console.log(chalk.green(`✅ Server running on http://localhost:${targetPort}`));
    }
    return;
  }
  
  // Server not running - provide helpful error
  console.error(chalk.red('❌ Development server is not running'));
  console.error('');
  console.error(chalk.yellow(`Required for: ${testContext} tests`));
  console.error(chalk.yellow('Start the server with:'));
  console.error(chalk.cyan('  npm run serve'));
  console.error(chalk.gray('  # or with auto-open:'));
  console.error(chalk.cyan('  npm run dev'));
  console.error('');
  
  throw new Error(`Server required for ${testContext} tests but not running on port ${targetPort}`);
}


export {
  checkServerStatus,
  requiresServer,
  validateServerIfNeeded,
  SERVER_REQUIRED_LEVELS
};

// Default export for convenience
export default {
  checkServerStatus,
  requiresServer,
  validateServerIfNeeded,
  SERVER_REQUIRED_LEVELS
};