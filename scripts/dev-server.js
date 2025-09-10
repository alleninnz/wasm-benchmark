#!/usr/bin/env node

/**
 * Development Server for WASM Benchmark
 * Securely serves only harness/ and builds/ directories
 * Direct access to bench.html at root path
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔄 Initializing WASM Benchmark Development Server...');

const app = express();
const PORT = process.env.PORT || 2025;

console.log(`📍 Target port: ${PORT}`);

// Enable CORS for all routes
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Request logging for development
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
});

// Handle favicon.ico to prevent 404 errors in tests
app.get('/favicon.ico', (req, res) => {
  res.status(204).end(); // No Content - prevents 404 error
});

// Root route - serve bench.html directly
app.get('/', (req, res) => {
  const benchPath = path.join(__dirname, '../harness/web/bench.html');
  console.log(`🏠 Serving bench.html from: ${benchPath}`);
  
  if (fs.existsSync(benchPath)) {
    res.sendFile(benchPath);
  } else {
    console.log(`❌ bench.html not found at: ${benchPath}`);
    res.status(404).send(`
      <h1>Benchmark Harness Not Found</h1>
      <p>Could not find bench.html at: ${benchPath}</p>
      <p>Please ensure the harness is built and available.</p>
    `);
  }
});

// Serve JavaScript files at root level for bench.html compatibility
// This fixes the 404 errors when bench.html loads ./wasm_loader.js, ./config_loader.js, ./bench.js
const webJSFiles = ['wasm_loader.js', 'config_loader.js', 'bench.js'];
webJSFiles.forEach(fileName => {
  app.get(`/${fileName}`, (req, res) => {
    const filePath = path.join(__dirname, '../harness/web', fileName);
    console.log(`📄 Serving root JS file: ${fileName} -> ${filePath}`);
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(filePath, (err) => {
      if (err) {
        console.log(`❌ Failed to serve ${fileName}: ${err.message}`);
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
  console.log(`🔧 Serving config: ${configPath}`);
  
  if (fs.existsSync(configPath)) {
    res.setHeader('Content-Type', 'application/json');
    res.sendFile(configPath);
  } else {
    console.log(`❌ bench.json not found at: ${configPath}`);
    res.status(404).json({
      error: 'Configuration not found',
      message: 'bench.json not found. Run "npm run build:config" to generate it.',
      path: '/configs/bench.json'
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
  '/requirements.txt'
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
      '/configs/bench.json'
    ]
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Start the server
console.log('🔧 Setting up server...');
app.listen(PORT, () => {
  console.log('🚀 WASM Benchmark Development Server');
  console.log(`📍 Server running on http://localhost:${PORT}`);
  console.log('📁 Serving directories:');
  console.log('   • /harness -> harness/');
  console.log('   • /builds  -> builds/');
  console.log('   • /configs -> configs/');
  console.log('🏠 Direct access: http://localhost:' + PORT + ' → bench.html');
  console.log('⏹️  Press Ctrl+C to stop');
});

console.log('✅ Server setup complete, waiting for connections...');
