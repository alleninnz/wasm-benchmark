#!/usr/bin/env node

/**
 * Build-time YAML to JSON Configuration Converter
 * Converts bench.yaml to optimized JSON for browser consumption
 * Eliminates need for runtime YAML parsing service
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'yaml';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

// Configuration constants
const DEFAULT_TIMEOUT_MS = 300000;
const DEFAULT_GC_THRESHOLD_MB = 10;
const DEFAULT_REPETITIONS = 1;

// Environment detection
const EXCLUDED_ENV_KEYS = [
    'warmup_runs', 'measure_runs', 'warmupRuns', 'measureRuns', 
    'repetitions', 'timeout_ms', 'task_timeouts', 'gc_threshold_mb', 
    'memory_monitoring', 'gc_monitoring', 'timeout_as_data'
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Support both normal and quick configurations
const configType = process.argv.includes('--quick') ? 'quick' : 'normal';

const CONFIG_PATHS = {
    normal: {
        input: path.join(__dirname, '..', 'configs', 'bench.yaml'),
        output: path.join(__dirname, '..', 'configs', 'bench.json')
    },
    quick: {
        input: path.join(__dirname, '..', 'configs', 'bench-quick.yaml'),
        output: path.join(__dirname, '..', 'configs', 'bench-quick.json')
    }
};

const currentConfig = CONFIG_PATHS[configType];

/**
 * Load and parse YAML configuration
 */
async function loadYamlConfig() {
    try {
        console.log(chalk.blue('📖 Reading YAML config:'), currentConfig.input);
        const yamlContent = await fs.readFile(currentConfig.input, 'utf8');
        
        console.log(chalk.cyan('🔄 Parsing YAML content...'));
        const config = yaml.parse(yamlContent);
        
        console.log(chalk.green('✅ YAML parsed successfully:'), config.experiment?.name || 'Unknown');
        return config;
        
    } catch (error) {
        console.error(chalk.red('❌ Failed to load YAML config:'), error.message);
        throw error;
    }
}

/**
 * Check if running in test environment
 */
function isTestEnvironment() {
    return process.env.NODE_ENV === 'test' || process.env.VITEST;
}

/**
 * Create optimized environment configuration
 */
function createOptimizedEnvironment(config) {
    const env = config.environment || {};
    
    // Core environment settings with enhanced timeout support
    const optimizedEnv = {
        warmupRuns: env.warmup_runs || env.warmupRuns,
        measureRuns: env.measure_runs || env.measureRuns,
        repetitions: env.repetitions || DEFAULT_REPETITIONS,
        timeout: env.timeout_ms || DEFAULT_TIMEOUT_MS,
        taskTimeouts: env.task_timeouts || {},
        gcThreshold: env.gc_threshold_mb || DEFAULT_GC_THRESHOLD_MB,
        memoryMonitoring: env.memory_monitoring || true,
        gcMonitoring: env.gc_monitoring || true,
        timeoutAsData: env.timeout_as_data || false
    };
    
    // Preserve other environment settings not handled above
    const additionalEnvSettings = Object.fromEntries(
        Object.entries(env).filter(([key]) => !EXCLUDED_ENV_KEYS.includes(key))
    );
    
    return { ...optimizedEnv, ...additionalEnvSettings };
}

/**
 * Optimize configuration for browser use
 */
function optimizeConfig(config) {
    const isTestEnv = isTestEnvironment();
    
    if (!isTestEnv) {
        console.log(chalk.yellow('⚡ Optimizing configuration for browser use...'));
    }
    
    // Extract only essential data for browser
    const optimized = {
        // Basic experiment info
        experiment: config.experiment,
        
        // Environment settings with enhanced timeout support
        environment: createOptimizedEnvironment(config),
        
        // Task configurations
        tasks: config.tasks,
        
        // Language configurations
        languages: config.languages,
        
        // Quality control settings
        qc: config.qc || {},
        
        // Statistical analysis settings
        statistics: config.statistics || {},
        
        // Verification settings
        verification: config.verification || {},
        
        // Metadata
        generated: {
            timestamp: new Date().toISOString(),
            source: 'configs/bench.yaml',
            version: config.experiment?.version || '1.0'
        }
    };
    
    // Extract convenience arrays
    optimized.taskNames = Object.keys(optimized.tasks);
    optimized.enabledLanguages = Object.keys(optimized.languages).filter(lang => 
        optimized.languages[lang].enabled !== false
    );
    optimized.scales = ['small', 'medium', 'large'];
    
    if (!isTestEnv) {
        console.log(`📊 Optimization complete:`);
        console.log(`   Tasks: ${optimized.taskNames.join(', ')}`);
        console.log(`   Languages: ${optimized.enabledLanguages.join(', ')}`);
        console.log(`   Scales: ${optimized.scales.join(', ')}`);
    }
    
    return optimized;
}

/**
 * Write optimized JSON configuration with DO NOT EDIT header
 */
async function writeJsonConfig(config) {
    try {
        console.log(chalk.blue('💾 Writing JSON config:'), currentConfig.output);
        
        // Ensure output directory exists
        const outputDir = path.dirname(currentConfig.output);
        await fs.mkdir(outputDir, { recursive: true });
        
        // Create JSON with DO NOT EDIT header
        const configWithHeader = {
            "//": "DO NOT EDIT: This file is auto-generated by scripts/build_config.js",
            "//2": "To modify configuration, edit configs/bench.yaml and run: npm run build:config",
            "//3": `Generated: ${new Date().toISOString()}`,
            ...config
        };
        
        // Write formatted JSON
        const jsonContent = JSON.stringify(configWithHeader, null, 2);
        await fs.writeFile(currentConfig.output, jsonContent, 'utf8');
        
        const stats = await fs.stat(currentConfig.output);
        console.log(chalk.green('✅ JSON config written:'), `${(stats.size / 1024).toFixed(1)}KB`);
        
    } catch (error) {
        console.error(chalk.red('❌ Failed to write JSON config:'), error.message);
        throw error;
    }
}

/**
 * Validate generated configuration
 */
function validateConfig(config) {
    const isTestEnv = isTestEnvironment();
    
    if (!isTestEnv) {
        console.log(`🔍 Validating generated configuration...`);
    }
    
    const errors = [];
    
    // Check required sections
    const requiredSections = ['experiment', 'environment', 'tasks', 'languages'];
    for (const section of requiredSections) {
        if (!config[section]) {
            errors.push(`Missing required section: ${section}`);
        }
    }
    
    // Check experiment info
    if (!config.experiment?.name) {
        errors.push('Missing experiment name');
    }
    
    // Check environment
    const env = config.environment;
    if (!env?.warmupRuns || !env?.measureRuns) {
        errors.push('Missing warmup_runs or measure_runs');
    }
    
    // Check tasks
    if (config.taskNames?.length === 0) {
        errors.push('No tasks defined');
    }
    
    // Check languages
    if (config.enabledLanguages?.length === 0) {
        errors.push('No languages enabled');
    }
    
    if (errors.length > 0) {
        if (!isTestEnv) {
            console.error(chalk.red('❌ Configuration validation failed:'));
            errors.forEach(error => console.error(chalk.red(`   - ${error}`)));
        }
        throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }
    
    if (!isTestEnv) {
        console.log(chalk.green('✅ Configuration validation passed'));
    }
}

/**
 * Main build process
 */
async function buildConfig() {
    console.log(`🏗️  Starting configuration build process...`);
    const startTime = performance.now();
    
    try {
        // Load and parse YAML
        const yamlConfig = await loadYamlConfig();
        
        // Optimize for browser use
        const optimizedConfig = optimizeConfig(yamlConfig);
        
        // Validate configuration
        validateConfig(optimizedConfig);
        
        // Write JSON output
        await writeJsonConfig(optimizedConfig);
        
        const duration = ((performance.now() - startTime) / 1000).toFixed(2);
        console.log(`🎉 Configuration build completed in ${duration}s`);
        console.log(`📁 Output: ${currentConfig.output}`);
        
        return optimizedConfig;
        
    } catch (error) {
        console.error(`💥 Configuration build failed: ${error.message}`);
        process.exit(1);
    }
}

/**
 * Watch mode for development
 */
async function watchMode() {
    console.log(`👀 Starting watch mode for: ${currentConfig.input}`);
    
    const watcher = fs.watch(currentConfig.input, { persistent: true });
    
    for await (const event of watcher) {
        if (event.eventType === 'change') {
            console.log(chalk.cyan('\n🔄 Config file changed, rebuilding...'));
            try {
                await buildConfig();
                console.log(chalk.green('✅ Rebuild completed\n'));
            } catch (error) {
                console.error(chalk.red('❌ Rebuild failed:'), error.message + '\n');
            }
        }
    }
}

// Handle CLI arguments
const args = process.argv.slice(2);
const isWatch = args.includes('--watch') || args.includes('-w');

// Run appropriate mode
if (isWatch) {
    // Initial build then watch
    await buildConfig();
    await watchMode();
} else {
    // Single build
    await buildConfig();
}

export { buildConfig, optimizeConfig, validateConfig };