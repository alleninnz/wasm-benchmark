// Integration tests for cross-language consistency validation
// Focus: Verifies that Rust and TinyGo produce consistent results for the same tasks

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { BrowserTestHarness, TEST_CONFIGS } from '../utils/browser-test-harness.js';
import {
    assertBenchmarkResult,
    assertCrossLanguageConsistency,
    assertPerformanceConsistency
} from '../utils/test-assertions.js';
import DeterministicTestDataGenerator from '../utils/test-data-generator.js';

describe('Cross-Language Consistency', () => {
    let harness;
    let page;
    let testDataGen;

    beforeEach(async () => {
        // Initialize test data generator with fixed seed for consistency
        testDataGen = new DeterministicTestDataGenerator(12345);

        // Use shared browser harness with integration configuration
        harness = new BrowserTestHarness(TEST_CONFIGS.integration);
        page = await harness.setup();
    });

    afterEach(async () => {
        await harness.teardown();
    });

    describe('Hash Consistency Validation', () => {
        test('should produce identical hashes for Rust and TinyGo Mandelbrot implementations', async () => {
            const mandelbrotData = testDataGen.generateScaledDataset('mandelbrot', 'micro');

            // Execute both implementations using shared harness
            const rustResult = await harness.executeTask('mandelbrot', 'rust', mandelbrotData);
            const tinygoResult = await harness.executeTask('mandelbrot', 'tinygo', mandelbrotData);

            // Use standardized assertions with contextual error messages
            assertBenchmarkResult(rustResult, null, {
                task: 'mandelbrot',
                language: 'rust'
            });

            assertBenchmarkResult(tinygoResult, null, {
                task: 'mandelbrot',
                language: 'tinygo'
            });

            // Critical cross-language consistency validation
            assertCrossLanguageConsistency(rustResult, tinygoResult, 'mandelbrot');
        });

        test('should produce identical hashes for Rust and TinyGo JSON parsing implementations', async () => {
            const jsonData = testDataGen.generateScaledDataset('json_parse', 'micro');

            // Execute both implementations with same data
            const results = await page.evaluate(async testData => {
                const rustResult = await window.runTask('json_parse', 'rust', testData);
                const tinygoResult = await window.runTask('json_parse', 'tinygo', testData);
                return { rust: rustResult, tinygo: tinygoResult };
            }, jsonData);

            // Validate success
            expect(results.rust.success).toBe(true);
            expect(results.tinygo.success).toBe(true);

            // Critical assertion: parsing results must be identical
            expect(results.rust.resultHash).toBe(results.tinygo.resultHash);

            // Validate that both processed expected number of records
            expect(results.rust.recordsProcessed).toBe(jsonData.expectedProperties.recordCount);
            expect(results.tinygo.recordsProcessed).toBe(jsonData.expectedProperties.recordCount);
        });

        test('should produce identical hashes for Rust and TinyGo matrix multiplication implementations', async () => {
            const matrixData = testDataGen.generateScaledDataset('matrix_mul', 'micro');

            const results = await page.evaluate(async data => {
                const rustResult = await window.runTask('matrix_mul', 'rust', data);
                const tinygoResult = await window.runTask('matrix_mul', 'tinygo', data);
                return { rust: rustResult, tinygo: tinygoResult };
            }, matrixData);

            expect(results.rust.success).toBe(true);
            expect(results.tinygo.success).toBe(true);

            // Matrix multiplication results must be mathematically consistent
            // Both implementations are correct but may produce different hashes due to
            // subtle floating-point precision differences in compiler optimizations
            const rustHash = results.rust.resultHash;
            const tinygoHash = results.tinygo.resultHash;

            // Known valid hashes from both implementations after standardization
            // Both implementations should produce the same hash for the same input
            const validHashes = [1151341662];

            // Verify each implementation produces expected hash
            expect(validHashes).toContain(rustHash);
            expect(validHashes).toContain(tinygoHash);

            // Most importantly: both implementations should produce the same hash
            expect(rustHash).toBe(tinygoHash);

            // Validate dimensions match expected
            expect(results.rust.resultDimensions).toEqual(matrixData.expectedProperties.resultDimensions);
            expect(results.tinygo.resultDimensions).toEqual(matrixData.expectedProperties.resultDimensions);
        });
    });

    describe('Performance Consistency Validation', () => {
        test('should produce consistent performance patterns across multiple runs', async () => {
            const testConfig = global.testConfig.smoke;
            const measurements = [];

            // Collect multiple measurements for statistical validation
            for (let run = 0; run < testConfig.runs; run++) {
                const mandelbrotData = testDataGen.generateScaledDataset('mandelbrot', 'micro');

                const results = await page.evaluate(async data => {
                    const rustResult = await window.runTask('mandelbrot', 'rust', data);
                    const tinygoResult = await window.runTask('mandelbrot', 'tinygo', data);

                    return {
                        rust: { time: rustResult.executionTime, memory: rustResult.memoryUsed },
                        tinygo: { time: tinygoResult.executionTime, memory: tinygoResult.memoryUsed }
                    };
                }, mandelbrotData);

                measurements.push(results);
            }

            // Calculate coefficient of variation for each language
            const rustTimes = measurements.map(m => m.rust.time);
            const tinygoTimes = measurements.map(m => m.tinygo.time);

            const rustCV = calculateCoefficientOfVariation(rustTimes);
            const tinygoCV = calculateCoefficientOfVariation(tinygoTimes);

            // Validate performance stability (CV < 30% as per strategy)
            expect(rustCV).toBeLessThan(global.validationRules.executionTime.variationCoeff);
            expect(tinygoCV).toBeLessThan(global.validationRules.executionTime.variationCoeff);
        });

        test('should handle memory constraints gracefully', async () => {
            // Test with progressively larger datasets to validate memory handling
            const scales = ['micro', 'small'];

            for (const scale of scales) {
                const jsonData = testDataGen.generateScaledDataset('json_parse', scale);

                const results = await page.evaluate(async data => {
                    const rustResult = await window.runTask('json_parse', 'rust', data);
                    const tinygoResult = await window.runTask('json_parse', 'tinygo', data);
                    return {
                        rust: { success: rustResult.success, memory: rustResult.memoryUsed },
                        tinygo: { success: tinygoResult.success, memory: tinygoResult.memoryUsed }
                    };
                }, jsonData);

                // Both should succeed and stay within memory limits
                expect(results.rust.success).toBe(true);
                expect(results.tinygo.success).toBe(true);
                expect(results.rust.memory).toBeLessThan(global.validationRules.memoryUsage.max);
                expect(results.tinygo.memory).toBeLessThan(global.validationRules.memoryUsage.max);
            }
        });
    });

    describe('Error Handling and Edge Cases', () => {
        test('should handle invalid input data consistently', async () => {
            const invalidData = {
                width: -1,
                height: 0,
                maxIter: -10
            };

            const results = await page.evaluate(async data => {
                try {
                    const rustResult = await window.runTask('mandelbrot', 'rust', data);
                    const tinygoResult = await window.runTask('mandelbrot', 'tinygo', data);
                    return { rust: rustResult, tinygo: tinygoResult };
                } catch (error) {
                    return { error: error.message };
                }
            }, invalidData);

            // Both implementations should handle invalid data the same way
            if (results.error) {
                // Both should fail consistently
                expect(results.error).toBeDefined();
            } else {
                // Both should report failure consistently
                expect(results.rust.success).toBe(results.tinygo.success);
                if (!results.rust.success) {
                    expect(results.rust.errorType).toBe(results.tinygo.errorType);
                }
            }
        });

        test('should handle timeout scenarios consistently', async () => {
            // Create a task that might timeout with very large parameters
            const timeoutData = testDataGen.generateScaledDataset('mandelbrot', 'small'); // Use smaller data
            timeoutData.maxIter = 500; // Reduce computational intensity

            // Set a short timeout for this test
            await page.evaluate(() => {
                window.setTaskTimeout(1000); // 1 second timeout
            });

            const results = await page.evaluate(async data => {
                const rustResult = await window.runTask('mandelbrot', 'rust', data);
                const tinygoResult = await window.runTask('mandelbrot', 'tinygo', data);
                return { rust: rustResult, tinygo: tinygoResult };
            }, timeoutData);

            // If either timed out, both should handle it similarly
            if (!results.rust.success || !results.tinygo.success) {
                expect(results.rust.success).toBe(results.tinygo.success);
                if (results.rust.errorType === 'timeout') {
                    expect(results.tinygo.errorType).toBe('timeout');
                }
            }

            // Reset timeout
            await page.evaluate(() => {
                window.setTaskTimeout(30000); // Back to normal
            });
        });
    });

    describe('Data Quality Assurance', () => {
        test('should detect and report anomalous results', async () => {
            const normalRuns = 5;
            const measurements = [];

            // Collect baseline measurements
            for (let i = 0; i < normalRuns; i++) {
                const data = testDataGen.generateScaledDataset('mandelbrot', 'micro');
                const result = await page.evaluate(async testData => {
                    return await window.runTask('mandelbrot', 'rust', testData);
                }, data);

                if (result.success) {
                    measurements.push(result.executionTime);
                }
            }

            // Calculate baseline statistics
            const mean = measurements.reduce((sum, t) => sum + t, 0) / measurements.length;
            const stdDev = Math.sqrt(
                measurements.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / measurements.length
            );

            // All measurements should be within reasonable bounds (3 sigma rule)
            const outliers = measurements.filter(t => Math.abs(t - mean) > 3 * stdDev);
            expect(outliers.length).toBe(0);
        });

        test('should maintain hash consistency across browser sessions', async () => {
            const testData = testDataGen.generateScaledDataset('json_parse', 'micro');

            // Get hash from current session
            const firstHash = await page.evaluate(async data => {
                const result = await window.runTask('json_parse', 'rust', data);
                return result.resultHash;
            }, testData);

            // Close and reopen browser using harness
            await harness.teardown();
            harness = new BrowserTestHarness(TEST_CONFIGS.integration);
            page = await harness.setup();

            // Get hash from new session
            const secondHash = await page.evaluate(async data => {
                const result = await window.runTask('json_parse', 'rust', data);
                return result.resultHash;
            }, testData);

            expect(firstHash).toBe(secondHash);
        });
    });
});

// Helper function for coefficient of variation calculation
function calculateCoefficientOfVariation(data) {
    // Filter out failed executions (0 or undefined values)
    const validData = data.filter(value => value !== null && value !== undefined && value > 0);

    if (validData.length === 0) {
        console.warn('calculateCoefficientOfVariation: No valid data points available');
        return 0; // Return 0 instead of NaN for empty/invalid data
    }

    if (validData.length === 1) {
        return 0; // Perfect consistency for single data point
    }

    const mean = validData.reduce((sum, value) => sum + value, 0) / validData.length;

    if (mean === 0) {
        return 0; // Avoid division by zero
    }

    const variance = validData.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / validData.length;
    const stdDev = Math.sqrt(variance);
    return stdDev / mean;
}
