#!/usr/bin/env node

/**
 * Browser Benchmark Runner
 * Uses Puppeteer to drive headless Chrome for WebAssembly benchmarking
 */

import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for console output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    purple: '\x1b[35m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m'
};

// Logging functions
const log = {
    info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
    success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
    warning: (msg) => console.log(`${colors.yellow}[WARNING]${colors.reset} ${msg}`),
    error: (msg) => console.error(`${colors.red}[ERROR]${colors.reset} ${msg}`),
    section: (msg) => {
        console.log();
        console.log(`${colors.purple}======================================${colors.reset}`);
        console.log(`${colors.purple} ${msg}${colors.reset}`);
        console.log(`${colors.purple}======================================${colors.reset}`);
        console.log();
    }
};

class BrowserBenchmarkRunner {
    constructor(options = {}) {
        this.projectRoot = path.resolve(__dirname, '..');
        this.configFile = path.join(this.projectRoot, 'harness', 'web', 'bench.config.json');
        this.harnessPath = path.join(this.projectRoot, 'harness', 'web', 'bench.html');
        this.resultsDir = path.join(this.projectRoot, 'results');
        this.buildsDir = path.join(this.projectRoot, 'builds');
        
        this.options = {
            headless: options.headless !== false,
            devtools: options.devtools === true,
            timeout: options.timeout || 300000, // 5 minutes
            viewport: options.viewport || { width: 1280, height: 720 },
            cpuThrottling: options.cpuThrottling || 1, // No throttling
            networkThrottling: null,
            ...options
        };
        
        this.browser = null;
        this.page = null;
        this.config = null;
        this.results = [];
        this.startTime = Date.now();
    }

    /**
     * Load benchmark configuration from pre-generated JSON
     */
    async loadConfig() {
        try {
            const configContent = await fs.readFile(this.configFile, 'utf8');
            this.config = JSON.parse(configContent);
            
            // Validate required configuration sections
            this.validateConfig();
            
            log.info(`Loaded configuration: ${this.config.experiment.name}`);
            log.info(`Generated: ${this.config.generated.timestamp}`);
            return this.config;
        } catch (error) {
            if (error.code === 'ENOENT') {
                log.error('Configuration file not found. Run "npm run build:config" to generate bench.config.json');
            } else {
                log.error(`Failed to load config: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Validate loaded configuration structure
     */
    validateConfig() {
        const required = ['experiment', 'environment', 'tasks', 'languages', 'taskNames', 'enabledLanguages'];
        for (const field of required) {
            if (!this.config[field]) {
                throw new Error(`Missing required configuration field: ${field}`);
            }
        }
        
        if (!this.config.generated || !this.config.generated.timestamp) {
            throw new Error('Configuration missing generation metadata. Please regenerate with build:config');
        }
    }

    /**
     * Initialize browser and page
     */
    async initializeBrowser() {
        log.info('Launching browser...');
        
        const launchOptions = {
            headless: this.options.headless,
            devtools: this.options.devtools,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-background-networking',
                '--disable-default-apps',
                '--disable-extensions',
                '--disable-sync',
                '--disable-translate',
                '--hide-scrollbars',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-first-run',
                '--safebrowsing-disable-auto-update',
                '--ignore-certificate-errors',
                '--ignore-ssl-errors',
                '--ignore-certificate-errors-spki-list',
                '--allow-file-access-from-files',
                '--allow-file-access',
                '--enable-precise-memory-info',
                '--js-flags="--expose-gc"'
            ]
        };
        
        this.browser = await puppeteer.launch(launchOptions);
        this.page = await this.browser.newPage();
        
        // Set viewport
        await this.page.setViewport(this.options.viewport);
        
        // Enable CPU throttling if specified
        if (this.options.cpuThrottling > 1) {
            const client = await this.page.target().createCDPSession();
            await client.send('Emulation.setCPUThrottlingRate', {
                rate: this.options.cpuThrottling
            });
        }
        
        // Enable network throttling if specified
        if (this.options.networkThrottling) {
            await this.page.emulate(this.options.networkThrottling);
        }
        
        // Set up console logging from the page
        this.page.on('console', msg => {
            const type = msg.type();
            const text = msg.text();
            if (type === 'error') {
                log.error(`Browser: ${text}`);
            } else if (type === 'warn') {
                log.warning(`Browser: ${text}`);
            } else if (this.options.verbose) {
                log.info(`Browser: ${text}`);
            }
        });
        
        // Set up error handling
        this.page.on('pageerror', error => {
            log.error(`Page error: ${error.message}`);
        });
        
        log.success('Browser initialized');
        return this.page;
    }

    /**
     * Load the benchmark harness page
     */
    async loadHarnessPage() {
        log.info('Loading benchmark harness...');
        
        const harnessUrl = `file://${this.harnessPath}`;
        await this.page.goto(harnessUrl, {
            waitUntil: 'networkidle0',
            timeout: this.options.timeout
        });
        
        // Wait for the harness to initialize
        await this.page.waitForFunction(() => {
            return window.benchmarkState && window.benchmarkRunner;
        }, { timeout: 10000 });
        
        log.success('Benchmark harness loaded');
    }

    /**
     * Run a single task benchmark
     */
    async runTaskBenchmark(task, language, scale) {
        const taskId = `${task}-${language}-${scale}`;
        log.info(`Running benchmark: ${taskId}`);
        
        try {
            // Prepare benchmark configuration for this specific task
            const taskConfig = this.prepareBenchmarkConfig(task, language, scale);
            
            // Inject configuration and start benchmark with enhanced error handling
            const results = await this.page.evaluate(async (config) => {
                const runner = window.benchmarkRunner;
                
                try {
                    // Validate runner availability
                    if (!runner) {
                        throw new Error('BenchmarkRunner not initialized in page');
                    }
                    
                    // Run the benchmark
                    const benchResults = await runner.runTaskBenchmark(config);
                    return {
                        success: true,
                        results: benchResults,
                        state: window.benchmarkState,
                        timestamp: Date.now()
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: {
                            message: error.message,
                            stack: error.stack,
                            name: error.name,
                            timestamp: Date.now()
                        },
                        state: window.benchmarkState,
                        config: config
                    };
                }
            }, taskConfig);
            
            if (results.success) {
                this.results.push(...results.results);
                log.success(`Completed ${taskId}: ${results.results.length} samples`);
                return results.results;
            } else {
                log.error(`Failed ${taskId}: ${results.error}`);
                throw new Error(results.error);
            }
            
        } catch (error) {
            log.error(`Benchmark failed for ${taskId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Prepare benchmark configuration for a specific task
     */
    prepareBenchmarkConfig(task, language, scale) {
        const taskConfig = this.config.tasks[task];
        const scaleConfig = taskConfig.scales[scale];
        
        return {
            task: task,
            language: language,
            scale: scale,
            warmupRuns: this.config.environment.warmupRuns,
            measureRuns: this.config.environment.measureRuns,
            timeout: this.config.environment.timeout,
            taskConfig: taskConfig,
            scaleConfig: scaleConfig,
            wasmPath: this.getWasmPath(task, language)
        };
    }

    /**
     * Generate WASM file path based on task and language
     */
    getWasmPath(task, language) {
        // Use language configuration if available
        const langConfig = this.config.languages[language];
        if (langConfig && langConfig.optimization_levels) {
            const optLevel = langConfig.optimization_levels[0];
            const suffix = optLevel.name === 'research_optimized' ? 
                (language === 'rust' ? 'o3' : 'oz') : 'default';
            return `../../builds/${language}/${task}-${language}-${suffix}.wasm`;
        }
        
        // Fallback to simple naming
        return `../../builds/${language}/${task}-${language}.wasm`;
    }

    /**
     * Run the complete benchmark suite
     */
    async runBenchmarkSuite() {
        log.section('Starting Browser Benchmark Suite');
        
        // Use pre-computed arrays from optimized config
        const tasks = this.config.taskNames;
        const languages = this.config.enabledLanguages; 
        const scales = this.config.scales || ['small', 'medium', 'large'];
        
        let totalBenchmarks = 0;
        let completedBenchmarks = 0;
        let failedBenchmarks = 0;
        
        // Calculate total benchmarks
        for (const task of tasks) {
            for (const language of languages) {
                for (const scale of scales) {
                    totalBenchmarks++;
                }
            }
        }
        
        log.info(`Running ${totalBenchmarks} benchmark combinations`);
        log.info(`Tasks: ${tasks.join(', ')}`);
        log.info(`Languages: ${languages.join(', ')}`);
        log.info(`Scales: ${scales.join(', ')}`);
        
        // Run all benchmark combinations
        for (const task of tasks) {
            for (const language of languages) {
                for (const scale of scales) {
                    try {
                        await this.runTaskBenchmark(task, language, scale);
                        completedBenchmarks++;
                        
                        const progress = ((completedBenchmarks + failedBenchmarks) / totalBenchmarks * 100).toFixed(1);
                        log.info(`Progress: ${progress}% (${completedBenchmarks}/${totalBenchmarks} completed)`);
                        
                    } catch (error) {
                        failedBenchmarks++;
                        log.error(`Benchmark failed: ${task}-${language}-${scale}`);
                        
                        // Continue with remaining benchmarks
                        continue;
                    }
                    
                    // Smart cleanup between benchmarks
                    await this.cleanupBetweenBenchmarks();
                }
            }
        }
        
        log.section('Benchmark Suite Completed');
        log.success(`Successful: ${completedBenchmarks}/${totalBenchmarks}`);
        if (failedBenchmarks > 0) {
            log.warning(`Failed: ${failedBenchmarks}/${totalBenchmarks}`);
        }
        
        return {
            total: totalBenchmarks,
            completed: completedBenchmarks,
            failed: failedBenchmarks,
            results: this.results
        };
    }

    /**
     * Save results to files
     */
    async saveResults(results) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const outputDir = path.join(this.resultsDir, timestamp);
        
        await fs.mkdir(outputDir, { recursive: true });
        
        // Save raw results as JSON
        const jsonFile = path.join(outputDir, 'raw_data.json');
        await fs.writeFile(jsonFile, JSON.stringify({
            metadata: {
                timestamp: new Date().toISOString(),
                experiment: this.config.experiment,
                environment: this.config.environment,
                total_duration_ms: Date.now() - this.startTime
            },
            results: this.results
        }, null, 2));
        
        // Save raw results as CSV
        const csvFile = path.join(outputDir, 'raw_data.csv');
        const csvContent = this.convertResultsToCSV(this.results);
        await fs.writeFile(csvFile, csvContent);
        
        // Save summary
        const summaryFile = path.join(outputDir, 'summary.json');
        await fs.writeFile(summaryFile, JSON.stringify(results, null, 2));
        
        log.success(`Results saved to: ${outputDir}`);
        log.info(`JSON data: ${jsonFile}`);
        log.info(`CSV data: ${csvFile}`);
        log.info(`Summary: ${summaryFile}`);
        
        return outputDir;
    }

    /**
     * Convert results to CSV format
     */
    convertResultsToCSV(results) {
        if (results.length === 0) return 'No results to export';
        
        const headers = [
            'task', 'language', 'scale', 'run', 'execution_time_ms', 
            'memory_usage_mb', 'wasm_memory_bytes', 'hash', 'timestamp',
            'js_heap_before', 'js_heap_after', 'success'
        ];
        
        const csvRows = [headers.join(',')];
        
        for (const result of results) {
            const row = headers.map(header => {
                const value = result[header] || '';
                return typeof value === 'string' ? `"${value}"` : value;
            });
            csvRows.push(row.join(','));
        }
        
        return csvRows.join('\n');
    }

    /**
     * Smart cleanup between benchmarks
     */
    async cleanupBetweenBenchmarks() {
        try {
            // Force garbage collection in the browser if available
            await this.page.evaluate(() => {
                if (window.gc) {
                    window.gc();
                }
                
                // Clear any module caches
                if (window.wasmLoader) {
                    window.wasmLoader.clearAll();
                }
            });
            
            // Short delay to allow cleanup to complete
            await new Promise(resolve => setTimeout(resolve, 500));
            
        } catch (error) {
            log.warning(`Cleanup between benchmarks failed: ${error.message}`);
        }
    }

    /**
     * Cleanup resources with enhanced error handling
     */
    async cleanup() {
        log.info('Starting cleanup...');
        
        try {
            if (this.page && !this.page.isClosed()) {
                await this.page.close();
                log.info('Page closed');
            }
        } catch (error) {
            log.warning(`Failed to close page: ${error.message}`);
        }
        
        try {
            if (this.browser && this.browser.isConnected()) {
                await this.browser.close();
                log.info('Browser closed');
            }
        } catch (error) {
            log.warning(`Failed to close browser: ${error.message}`);
        }
        
        log.success('Cleanup completed');
    }

    /**
     * Run the complete benchmark process
     */
    async run() {
        try {
            await this.loadConfig();
            await this.initializeBrowser();
            await this.loadHarnessPage();
            
            const results = await this.runBenchmarkSuite();
            const outputDir = await this.saveResults(results);
            
            return {
                success: true,
                results: results,
                outputDirectory: outputDir
            };
            
        } catch (error) {
            log.error(`Benchmark run failed: ${error.message}`);
            throw error;
        } finally {
            await this.cleanup();
        }
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    const options = {
        headless: !args.includes('--headed'),
        devtools: args.includes('--devtools'),
        verbose: args.includes('--verbose'),
        timeout: parseInt(args.find(arg => arg.startsWith('--timeout='))?.split('=')[1]) || 300000
    };
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
Usage: node run_browser_bench.js [options]

Options:
  --headed          Run in headed mode (show browser)
  --devtools        Open browser DevTools
  --verbose         Enable verbose logging
  --timeout=<ms>    Set timeout in milliseconds (default: 300000)
  --help, -h        Show this help message

Examples:
  node run_browser_bench.js                    # Run headless
  node run_browser_bench.js --headed           # Run with visible browser
  node run_browser_bench.js --verbose          # Enable verbose output
        `);
        return;
    }
    
    const runner = new BrowserBenchmarkRunner(options);
    
    try {
        const result = await runner.run();
        log.section('Benchmark Process Completed Successfully');
        log.success(`Results directory: ${result.outputDirectory}`);
        log.success(`Total benchmarks: ${result.results.total}`);
        log.success(`Successful: ${result.results.completed}`);
        if (result.results.failed > 0) {
            log.warning(`Failed: ${result.results.failed}`);
        }
        
        process.exit(0);
    } catch (error) {
        log.error(`Process failed: ${error.message}`);
        process.exit(1);
    }
}

// Run if executed directly  
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export default BrowserBenchmarkRunner;