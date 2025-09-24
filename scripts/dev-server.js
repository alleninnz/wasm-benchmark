#!/usr/bin/env node

/**
 * Development Server for WASM Benchmark
 * Securely serves only harness/ and builds/ directories
 * Direct access to bench.html at root path
 * Logs all requests to dev-server.log with minimal terminal output
 */

import { exec } from 'child_process';
import cors from 'cors';
import express from 'express';
import fs, { promises as fsPromises } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 2025;

// Log file path and configuration
const LOG_FILE = path.join(__dirname, '../dev-server.log');
const MAX_LOG_LINES = 100;

// Async log writing function with rotation
async function writeLog(message) {
    try {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${message}\n`;
        
        // Check if log file exists and count lines
        let shouldRotate = false;
        if (fs.existsSync(LOG_FILE)) {
            const currentContent = await fsPromises.readFile(LOG_FILE, 'utf8');
            const lines = currentContent.split('\n').filter(line => line.trim() !== '');
            
            if (lines.length >= MAX_LOG_LINES) {
                shouldRotate = true;
            }
        }
        
        if (shouldRotate) {
            // Overwrite the entire file when max lines reached
            await fsPromises.writeFile(LOG_FILE, logEntry);
        } else {
            // Append to existing file
            await fsPromises.appendFile(LOG_FILE, logEntry);
        }
    } catch {
        // Silent failure to prevent server crashes from logging issues
    }
}

// Clean up any existing dev server processes
async function cleanupExistingServers() {
    try {
        console.log('🔍 Checking for existing dev server processes...');

        let processKilled = false;

        // Method 1: Kill by process name
        try {
            await execAsync('pkill -f dev-server.js 2>/dev/null');
            console.log('✅ Stopped existing dev-server.js processes');
            await writeLog('CLEANUP: Killed existing dev-server.js processes');
            processKilled = true;
        } catch {
            // No processes found, which is fine
        }

        // Method 2: Kill by port (only if Method 1 didn't find processes)
        if (!processKilled) {
            try {
                const { stdout } = await execAsync(`lsof -ti:${PORT} 2>/dev/null`);
                if (stdout.trim()) {
                    await execAsync(`lsof -ti:${PORT} | xargs kill -9 2>/dev/null`);
                    console.log(`✅ Freed up port ${PORT}`);
                    await writeLog(`CLEANUP: Freed up port ${PORT}`);
                }
            } catch {
                // Port not in use, which is fine
            }
        }

        // Give processes time to clean up
        await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
        console.log('⚠️  Cleanup had some issues, but continuing...');
        await writeLog(`CLEANUP WARNING: ${error.message}`);
    }
}// Enable CORS for all routes
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Enhanced request logging to file with timing and response details
app.use((req, res, next) => {
    const startTime = Date.now();
    const clientIP = req.ip || req.connection.remoteAddress || '-';

    // Capture response details
    const originalEnd = res.end;
    const originalSend = res.send;

    let responseSize = 0;

    // Override end method to capture timing
    res.end = function(chunk, encoding) {
        if (chunk) {
            responseSize += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding);
        }

        const duration = Date.now() - startTime;
        const sizeStr = responseSize > 0 ? `${(responseSize / 1024).toFixed(1)}KB` : '-';

        // Log format: [timestamp] METHOD path STATUS duration size [ip]
        const logMessage = `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms ${sizeStr} [${clientIP}]`;
        writeLog(logMessage);

        originalEnd.call(this, chunk, encoding);
    };

    // Override send method to capture response size
    res.send = function(body) {
        if (body) {
            responseSize += Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body.toString());
        }
        originalSend.call(this, body);
    };

    next();
});

// Handle favicon.ico to prevent 404 errors in tests
app.get('/favicon.ico', (req, res) => {
    res.status(204).end(); // No Content - prevents 404 error
});

// Shared bench.html serving logic
function serveBenchHtml(res) {
    const benchPath = path.join(__dirname, '../harness/web/bench.html');

    if (fs.existsSync(benchPath)) {
        res.sendFile(benchPath);
    } else {
        writeLog(`ERROR: bench.html not found at: ${benchPath}`);
        res.status(404).send(`
      <h1>Benchmark Harness Not Found</h1>
      <p>Could not find bench.html at: ${benchPath}</p>
      <p>Please ensure the harness is built and available.</p>
    `);
    }
}

// Root route - serve bench.html directly
app.get('/', (req, res) => {
    serveBenchHtml(res);
});

// Direct bench.html route for compatibility with test files
app.get('/bench.html', (req, res) => {
    serveBenchHtml(res);
});

// Serve JavaScript files at root level for bench.html compatibility
// This fixes the 404 errors when bench.html loads ./wasm_loader.js, ./config_loader.js, ./bench.js
const webJSFiles = ['wasm_loader.js', 'config_loader.js', 'bench.js'];
webJSFiles.forEach(fileName => {
    app.get(`/${fileName}`, (req, res) => {
        const filePath = path.join(__dirname, '../harness/web', fileName);
        res.setHeader('Content-Type', 'application/javascript');
        res.sendFile(filePath, (err) => {
            if (err) {
                writeLog(`ERROR: Failed to serve ${fileName}: ${err.message}`);
                res.status(404).send(`File not found: ${fileName}`);
            }
        });
    });
});

// Serve harness directory (web assets, scripts, etc.)
app.use('/harness', express.static(path.join(__dirname, '../harness'), {
    maxAge: 0, // No caching in development
    setHeaders: (res, filePath) => {
    // Set MIME types for JS modules
        if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// Serve builds directory (WASM modules)
app.use('/builds', express.static(path.join(__dirname, '../builds'), {
    maxAge: 0, // No caching in development
    setHeaders: (res, filePath) => {
    // Set correct MIME type for WASM files
        if (filePath.endsWith('.wasm')) {
            res.setHeader('Content-Type', 'application/wasm');
        }
        // Enable streaming for large WASM files
        res.setHeader('Accept-Ranges', 'bytes');
    }
}));

// Serve essential config files only (bench.json needed for tests)
app.get('/configs/bench.json', (req, res) => {
    const configPath = path.join(__dirname, '../configs/bench.json');

    if (fs.existsSync(configPath)) {
        res.setHeader('Content-Type', 'application/json');
        res.sendFile(configPath);
    } else {
        writeLog(`ERROR: bench.json not found at: ${configPath}`);
        res.status(404).json({
            error: 'Configuration not found',
            message: 'bench.json not found. Run "make build-config" to generate it.',
            path: '/configs/bench.json'
        });
    }
});

// Serve quick benchmark configuration (bench-quick.json needed for quick tests)
app.get('/configs/bench-quick.json', (req, res) => {
    const configPath = path.join(__dirname, '../configs/bench-quick.json');

    if (fs.existsSync(configPath)) {
        res.setHeader('Content-Type', 'application/json');
        res.sendFile(configPath);
    } else {
        writeLog(`ERROR: bench-quick.json not found at: ${configPath}`);
        res.status(404).json({
            error: 'Configuration not found',
            message: 'bench-quick.json not found. Run "make build-config-quick" to generate it.',
            path: '/configs/bench-quick.json'
        });
    }
});

// Serve individual files from harness/web at root level for convenience
const webAssets = ['bench.js', 'wasm_loader.js', 'config_loader.js'];
webAssets.forEach(asset => {
    app.get(`/${asset}`, (req, res) => {
        const assetPath = path.join(__dirname, '../harness/web', asset);
        if (fs.existsSync(assetPath)) {
            res.sendFile(assetPath);
        } else {
            res.status(404).send(`Asset ${asset} not found`);
        }
    });
});

// Block access to sensitive files and directories
const blockedPaths = [
    '/package.json',
    '/package-lock.json',
    '/.env',
    '/.git',
    '/node_modules',
    '/src',
    '/tests',
    '/scripts',
    '/docs',
    '/reports',
    '/results',
    '/tasks',
    '/.gitignore',
    '/README.md',
    '/Makefile',
    '/pyproject.toml'
];

blockedPaths.forEach(blockedPath => {
    app.get(blockedPath, (req, res) => {
        res.status(403).json({
            error: 'Access Denied',
            message: 'This path is not accessible via the development server',
            path: req.path
        });
    });
});

// Catch-all route for undefined paths
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource was not found',
        path: req.originalUrl,
        availablePaths: [
            '/ (bench.html)',
            '/harness/**',
            '/builds/**',
            '/configs/bench.json',
            '/configs/bench-quick.json'
        ]
    });
});

// Error handling middleware
app.use((error, req, res, _next) => {
    const errorMessage = `INTERNAL ERROR: ${req.method} ${req.originalUrl} - ${error.message}`;
    writeLog(errorMessage);
    console.error('🚨 Internal Server Error:', error.message);

    res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
        timestamp: new Date().toISOString()
    });
});

// Test-environment-aware shutdown handling
function isTestEnvironment() {
    return process.env.NODE_ENV === 'test' ||
         process.env.npm_lifecycle_event?.includes('test') ||
         process.argv.some(arg => arg.includes('vitest') || arg.includes('test'));
}

// Graceful shutdown handling - be less aggressive in test environments
if (!isTestEnvironment()) {
    process.on('SIGTERM', async () => {
        console.log('\n🛑 Shutting down gracefully...');
        await writeLog('SERVER SHUTDOWN - SIGTERM received');
        process.exit(0);
    });
} else {
    process.on('SIGTERM', async () => {
        console.log('\n⚠️  SIGTERM received in test environment - ignoring');
        await writeLog('SERVER SIGTERM ignored in test environment');
    });
}

process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    await writeLog('SERVER SHUTDOWN - SIGINT received');
    process.exit(0);
});

// Check for required configuration files before starting server
function checkRequiredConfigFiles() {
    const benchJsonPath = path.join(__dirname, '../configs/bench.json');
    const benchQuickJsonPath = path.join(__dirname, '../configs/bench-quick.json');

    const missingFiles = [];

    if (!fs.existsSync(benchJsonPath)) {
        missingFiles.push('configs/bench.json');
    }

    if (!fs.existsSync(benchQuickJsonPath)) {
        missingFiles.push('configs/bench-quick.json');
    }

    if (missingFiles.length > 0) {
        console.error('❌ Required configuration files are missing:');
        missingFiles.forEach(file => {
            console.error(`   - ${file}`);
        });
        console.error('');
        console.error('🔧 To generate the missing configuration files, run:');
        console.error('   make build-config');
        console.error('');
        console.error('💡 This will create the required JSON configuration files from YAML sources.');
        process.exit(1);
    }
}

// Start the server
async function startServer() {
    // Clean up any existing servers first
    await cleanupExistingServers();

    // Check for required configuration files
    checkRequiredConfigFiles();

    app.listen(PORT, async () => {
        console.log('🚀 WASM Benchmark Development Server');
        console.log(`📍 Server: http://localhost:${PORT}`);
        console.log('📄 Logs: dev-server.log');
        console.log('⏹️  Press Ctrl+C to stop');

        // Log server startup
        await writeLog(`SERVER STARTED on port ${PORT}`);
        await writeLog(`Serving: /harness -> harness/, /builds -> builds/, /configs -> configs/`);
    });
}

// Start the server
startServer().catch(error => {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
});
