#!/usr/bin/env node

/**
 * Build-time YAML to JSON Configuration Converter
 * Converts bench.yaml to optimized JSON for browser consumption
 * Eliminates need for runtime YAML parsing service
 */

import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'yaml';

// Configuration constants
const DEFAULT_TIMEOUT_MS = 90000;
const DEFAULT_REPETITIONS = 3;

// Environment detection
const EXCLUDED_ENV_KEYS = [
    'warmup_runs', 'measure_runs', 'repetitions', 'timeout_ms'
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
 * Convert snake_case to camelCase recursively
 */
function toCamelCase(str) {
    return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
}

/**
 * Recursively convert object keys from snake_case to camelCase
 */
function convertKeysToCamelCase(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(convertKeysToCamelCase);
    }

    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
        const camelKey = toCamelCase(key);
        converted[camelKey] = convertKeysToCamelCase(value);
    }

    return converted;
}

/**
 * Create optimized environment configuration with camelCase keys
 */
function createOptimizedEnvironment(config) {
    const env = config.environment || {};

    // Core environment settings - convert snake_case to camelCase
    const optimizedEnv = {
        warmupRuns: env.warmup_runs !== undefined ? env.warmup_runs : env.warmupRuns || 20,
        measureRuns: env.measure_runs !== undefined ? env.measure_runs : env.measureRuns || 100,
        repetitions: env.repetitions !== undefined ? env.repetitions : DEFAULT_REPETITIONS,
        timeout: env.timeout_ms !== undefined ? env.timeout_ms : DEFAULT_TIMEOUT_MS
    };

    // Convert additional environment settings to camelCase
    const additionalEnvSettings = Object.fromEntries(
        Object.entries(env)
            .filter(([key]) => !EXCLUDED_ENV_KEYS.includes(key))
            .map(([key, value]) => [toCamelCase(key), convertKeysToCamelCase(value)])
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

    // Extract only essential data for browser and convert to camelCase
    const optimized = {
        // Basic experiment info
        experiment: convertKeysToCamelCase(config.experiment),

        // Environment settings with enhanced timeout support
        environment: createOptimizedEnvironment(config),

        // Task configurations - convert nested structures to camelCase
        tasks: convertKeysToCamelCase(config.tasks),

        // Language configurations
        languages: convertKeysToCamelCase(config.languages),

        // Quality control settings
        qc: convertKeysToCamelCase(config.qc || {}),

        // Statistical analysis settings
        statistics: convertKeysToCamelCase(config.statistics || {}),

        // Verification settings
        verification: convertKeysToCamelCase(config.verification || {}),

        // Metadata
        generated: {
            timestamp: new Date().toISOString(),
            source: 'configs/bench.yaml',
            version: config.experiment?.version || '1.0'
        }
    };

    // Extract convenience arrays
    optimized.taskNames = Object.keys(optimized.tasks).filter(task =>
        optimized.tasks[task].enabled !== false
    );
    optimized.enabledLanguages = Object.keys(optimized.languages).filter(lang =>
        optimized.languages[lang].enabled !== false
    );
    // Extract actual scales from tasks instead of hardcoding
    const actualScales = new Set();
    Object.values(optimized.tasks).forEach(task => {
        if (task.scales) {
            Object.keys(task.scales).forEach(scale => actualScales.add(scale));
        }
    });
    optimized.scales = Array.from(actualScales);

    // Generate benchmarks for all task-scale-language combinations
    optimized.benchmarks = [];
    optimized.taskNames.forEach(taskName => {
        const task = optimized.tasks[taskName];
        const taskScales = task.scales ? Object.keys(task.scales) : ['small'];
        
        taskScales.forEach(scale => {
            optimized.enabledLanguages.forEach(lang => {
                optimized.benchmarks.push({
                    name: `${taskName}_${scale}_${lang}`,
                    task: taskName,
                    scale: scale,
                    language: lang,
                    implementations: [{
                        name: `${taskName}_${lang}`,
                        path: `/builds/${lang}/${taskName}-${lang}-o3.wasm`
                    }]
                });
            });
        });
    });

    // Add required output configuration
    optimized.output = {
        directory: 'results',
        format: 'json',
        timestamp: true,
        metadata: true
    };

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
            '//': 'DO NOT EDIT: This file is auto-generated by scripts/build_config.js',
            '//2': 'To modify configuration, edit configs/bench.yaml and run: npm run build:config',
            '//3': `Generated: ${new Date().toISOString()}`,
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

    // Check environment - use camelCase field names
    const env = config.environment;
    if (!env?.warmupRuns || !env?.measureRuns) {
        errors.push('Missing warmupRuns or measureRuns');
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
                console.error(chalk.red('❌ Rebuild failed:'), `${error.message}\n`);
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
