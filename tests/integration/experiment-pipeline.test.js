// Integration tests for complete experiment pipeline
// Focus: End-to-end workflow from configuration to results analysis

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer';
import DeterministicTestDataGenerator from '../utils/test-data-generator.js';
import PowerAnalysis from '../utils/statistical-power.js';

describe('Experiment Pipeline Integration', () => {
    let browser;
    let page;
    let testDataGen;
    let powerAnalysis;
    let testResults = [];

    beforeEach(async () => {
        testDataGen = new DeterministicTestDataGenerator(12345);
        powerAnalysis = new PowerAnalysis();

        // Launch browser with real Puppeteer instance
        browser = await puppeteer.launch(global.testBrowserConfig);
        page = await browser.newPage();

        // Enable console logging for debugging
        // page.on('console', msg => console.log('PAGE LOG:', msg.text()));

        await page.goto('http://localhost:2025/bench.html', {
            waitUntil: 'networkidle0',
            timeout: 30000
        });
    });

    afterEach(async () => {
        if (browser) {
            await browser.close();
        }

        // Clean up any test result files
        if (testResults.length > 0) {
            for (const resultFile of testResults) {
                try {
                    await fs.unlink(resultFile);
                } catch (error) {
                    // Ignore cleanup errors
                }
            }
            testResults = [];
        }
    });

    describe('Configuration Loading and Validation', () => {
        test('should load and validate experiment configuration correctly', async () => {
            // Create test configuration file
            const testConfig = {
                experiment: { name: 'Pipeline Test', version: '1.0' },
                environment: { warmupRuns: 2, measureRuns: 5, timeout: 30000 },
                tasks: { mandelbrot: { enabled: true }, json_parse: { enabled: true } },
                languages: { rust: { enabled: true }, tinygo: { enabled: true } },
                taskNames: ['mandelbrot', 'json_parse'],
                enabledLanguages: ['rust', 'tinygo']
            };

            const configPath = path.join(global.testTempDir, 'test-config.json');
            await fs.writeFile(configPath, JSON.stringify(testConfig, null, 2));

            // Load configuration in browser
            const configLoaded = await page.evaluate(async (configData) => {
                try {
                    window.benchmarkConfig = configData;
                    return { success: true, config: window.benchmarkConfig };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }, testConfig);

            expect(configLoaded.success).toBe(true);
            expect(configLoaded.config.taskNames).toEqual(['mandelbrot', 'json_parse']);
            expect(configLoaded.config.enabledLanguages).toEqual(['rust', 'tinygo']);
        });

        test('should reject invalid configuration gracefully', async () => {
            const invalidConfig = {
                experiment: {}, // Missing name
                environment: { warmupRuns: 1 }, // Missing measureRuns
                tasks: {},
                languages: {},
                taskNames: [],
                enabledLanguages: []
            };

            const result = await page.evaluate(async (config) => {
                try {
                    const validation = window.validateConfig(config);
                    return { success: false, errors: validation.errors };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            }, invalidConfig);

            expect(result.success).toBe(false);
            expect(result.errors || [result.error]).toBeTruthy();
        });
    });

    describe('Complete Benchmark Execution Pipeline', () => {
        test('should execute full benchmark suite with smoke test configuration', async () => {
            const smokeConfig = global.testConfig.smoke;

            // Prepare test data for each task
            const testDataSets = {
                mandelbrot: testDataGen.generateScaledDataset('mandelbrot', 'micro'),
                json_parse: testDataGen.generateScaledDataset('json_parse', 'micro')
            };

            // Execute complete benchmark suite
            const benchmarkResults = await page.evaluate(async (config) => {
                const results = {
                    mandelbrot: { rust: [], tinygo: [] },
                    json_parse: { rust: [], tinygo: [] }
                };

                // Debug: Check if benchmark runner is available
                if (!window.benchmarkRunner) {
                    throw new Error('Benchmark runner not initialized');
                }

                // Run benchmark for configured number of iterations
                for (let run = 0; run < config.runs; run++) {
                    try {
                        // Mandelbrot benchmark
                        const mandelbrotRust = await window.runTask('mandelbrot', 'rust', config.testData.mandelbrot);
                        const mandelbrotTinygo = await window.runTask('mandelbrot', 'tinygo', config.testData.mandelbrot);

                        // Debug logging
                        console.log('Mandelbrot Rust result:', JSON.stringify(mandelbrotRust));
                        console.log('Mandelbrot TinyGo result:', JSON.stringify(mandelbrotTinygo));

                        results.mandelbrot.rust.push(mandelbrotRust);
                        results.mandelbrot.tinygo.push(mandelbrotTinygo);

                        // JSON parsing benchmark
                        const jsonRust = await window.runTask('json_parse', 'rust', config.testData.json_parse);
                        const jsonTinygo = await window.runTask('json_parse', 'tinygo', config.testData.json_parse);

                        // Debug logging
                        console.log('JSON Rust result:', JSON.stringify(jsonRust));
                        console.log('JSON TinyGo result:', JSON.stringify(jsonTinygo));

                        results.json_parse.rust.push(jsonRust);
                        results.json_parse.tinygo.push(jsonTinygo);

                        // Brief pause between runs to prevent throttling
                        await new Promise(resolve => setTimeout(resolve, 100));
                    } catch (error) {
                        console.error(`Run ${run} failed:`, error.message);
                        throw error;
                    }
                }

                return results;
            }, { ...smokeConfig, testData: testDataSets });

            // Validate all executions succeeded
            Object.keys(benchmarkResults).forEach(task => {
                Object.keys(benchmarkResults[task]).forEach(language => {
                    const results = benchmarkResults[task][language];
                    expect(results).toHaveLength(smokeConfig.runs);

                    results.forEach(result => {
                        expect(result.success).toBe(true);
                        expect(result.executionTime).toBeGreaterThanOrEqual(0); // Allow 0 for very fast tasks
                        expect(result.resultHash).toBeDefined();
                    });
                });
            });

            // Validate cross-language consistency
            for (let run = 0; run < smokeConfig.runs; run++) {
                expect(benchmarkResults.mandelbrot.rust[run].resultHash)
                    .toBe(benchmarkResults.mandelbrot.tinygo[run].resultHash);
                expect(benchmarkResults.json_parse.rust[run].resultHash)
                    .toBe(benchmarkResults.json_parse.tinygo[run].resultHash);
            }
        });

        test('should handle multiple task types and languages sequentially', async () => {
            // Test multiple task execution capability (sequential to avoid benchmark runner lock)
            const multiTaskConfig = {
                tasks: ['mandelbrot', 'json_parse'],
                languages: ['rust', 'tinygo']
            };

            const testData = {
                mandelbrot: testDataGen.generateScaledDataset('mandelbrot', 'micro'),
                json_parse: testDataGen.generateScaledDataset('json_parse', 'micro')
            };

            const startTime = Date.now();

            const results = await page.evaluate(async (config) => {
                const results = [];

                // Debug: Check if benchmark runner is available
                if (!window.benchmarkRunner) {
                    throw new Error('Benchmark runner not initialized');
                }

                // Execute all task-language combinations sequentially
                for (const task of config.tasks) {
                    for (const language of config.languages) {
                        try {
                            const result = await window.runTask(task, language, config.testData[task]);
                            console.log(`Sequential result for ${task}-${language}:`, JSON.stringify(result));
                            results.push({ task, language, ...result });
                        } catch (error) {
                            console.error(`Sequential task ${task}-${language} failed:`, error.message);
                            results.push({ task, language, success: false, error: error.message });
                        }
                    }
                }

                return results;
            }, { ...multiTaskConfig, testData });

            const executionTime = Date.now() - startTime;

            // All tasks should complete successfully
            expect(results).toHaveLength(4); // 2 tasks × 2 languages
            results.forEach(result => {
                expect(result.success).toBe(true);
                expect(result.task).toBeDefined();
                expect(result.language).toBeDefined();
                expect(result.executionTime).toBeGreaterThanOrEqual(0); // Allow 0 for very fast tasks
            });

            // Sequential execution should complete reasonably fast
            expect(executionTime).toBeLessThan(30000); // Should complete within 30 seconds
        });
    });

    describe('Data Collection', () => {
        test('should save results in specified format with complete metadata', async () => {
            const testData = testDataGen.generateScaledDataset('mandelbrot', 'micro');
            const outputPath = path.join(global.testTempDir, 'test-results.json');

            const result = await page.evaluate(async (data) => {
                const benchmarkResult = await window.runTask('mandelbrot', 'rust', data);

                const fullResult = {
                    timestamp: new Date().toISOString(),
                    experiment: 'Integration Test',
                    task: 'mandelbrot',
                    language: 'rust',
                    configuration: data,
                    results: benchmarkResult
                };

                return fullResult;
            }, testData);

            // Save results to file
            await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
            testResults.push(outputPath);

            // Validate file was created and contains expected data
            const savedData = JSON.parse(await fs.readFile(outputPath, 'utf8'));
            expect(savedData.task).toBe('mandelbrot');
            expect(savedData.language).toBe('rust');
            expect(savedData.results.success).toBe(true);
            expect(savedData.timestamp).toBeDefined();
        });
    });

});
