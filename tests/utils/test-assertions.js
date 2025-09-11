/**
 * Standardized Test Assertions
 * Provides consistent assertion patterns for benchmark testing
 * Includes domain-specific validation logic and error messaging
 *
 * This module provides specialized assertions for WebAssembly benchmark validation,
 * cross-language consistency checking, and statistical significance testing.
 * All assertions include detailed error messages for debugging and validation.
 *
 * @module TestAssertions
 * @requires vitest
 * @requires ./statistical-power.js
 */

import { expect } from 'vitest';
import PowerAnalysis from './statistical-power.js';

// Constants for validation limits
const VALIDATION_CONSTANTS = {
    MIN_EXECUTION_TIME: 0.1,
    MAX_EXECUTION_TIME: 30000,
    MAX_MEMORY_USAGE: 100 * 1024 * 1024 // 100MB
};

const powerAnalysis = new PowerAnalysis();

/**
 * Assert that a benchmark result meets all quality requirements
 * @param {Object} result - Benchmark execution result
 * @param {string} expectedHash - Expected result hash for consistency
 * @param {Object} options - Additional validation options
 */
export function assertBenchmarkResult(result, expectedHash = null, options = {}) {
    // Input validation
    if (!result || typeof result !== 'object') {
        throw new Error('assertBenchmarkResult: result must be a valid object');
    }

    if (expectedHash !== null && (typeof expectedHash !== 'string' && typeof expectedHash !== 'number')) {
        throw new Error('assertBenchmarkResult: expectedHash must be null, string, or number');
    }

    if (options && typeof options !== 'object') {
        throw new Error('assertBenchmarkResult: options must be an object');
    }

    const {
        expectSuccess = true,
        minExecutionTime = global.validationRules?.executionTime?.min || VALIDATION_CONSTANTS.MIN_EXECUTION_TIME,
        maxExecutionTime = global.validationRules?.executionTime?.max || VALIDATION_CONSTANTS.MAX_EXECUTION_TIME,
        maxMemoryUsage = global.validationRules?.memoryUsage?.max || VALIDATION_CONSTANTS.MAX_MEMORY_USAGE,
        task = 'unknown',
        language = 'unknown'
    } = options;

    // Validate option parameters
    if (typeof expectSuccess !== 'boolean') {
        throw new Error('assertBenchmarkResult: expectSuccess must be boolean');
    }

    if (typeof minExecutionTime !== 'number' || minExecutionTime < 0) {
        throw new Error('assertBenchmarkResult: minExecutionTime must be a positive number');
    }

    if (typeof maxExecutionTime !== 'number' || maxExecutionTime <= minExecutionTime) {
        throw new Error('assertBenchmarkResult: maxExecutionTime must be greater than minExecutionTime');
    }

    // Structure validation
    expect(result, `Benchmark result should have required structure for ${task}:${language}`)
        .toMatchObject({
            success: expect.any(Boolean),
            executionTime: expect.any(Number),
            memoryUsed: expect.any(Number)
        });

    if (expectSuccess) {
        expect(result.success,
            `Benchmark execution should succeed for ${task}:${language}. Error: ${result.error || 'unknown'}`
        ).toBe(true);

        // Performance bounds validation
        expect(result.executionTime,
            `Execution time ${result.executionTime}ms should be within bounds [${minExecutionTime}, ${maxExecutionTime}] for ${task}:${language}`
        ).toBeGreaterThan(minExecutionTime);

        expect(result.executionTime,
            `Execution time ${result.executionTime}ms exceeds maximum ${maxExecutionTime}ms for ${task}:${language}`
        ).toBeLessThan(maxExecutionTime);

        // Memory usage validation (allow zero for valid executions with minimal memory footprint)
        expect(result.memoryUsed,
            `Memory usage ${result.memoryUsed} bytes should be non-negative for ${task}:${language}`
        ).toBeGreaterThanOrEqual(0);

        expect(result.memoryUsed,
            `Memory usage ${result.memoryUsed} bytes exceeds limit ${maxMemoryUsage} bytes for ${task}:${language}`
        ).toBeLessThan(maxMemoryUsage);

        // Hash consistency validation
        if (expectedHash !== null) {
            expect(result.resultHash,
                `Result hash should be defined for ${task}:${language}`
            ).toBeDefined();

            expect(result.resultHash,
                `Hash mismatch for ${task}:${language}. Expected: ${expectedHash}, Got: ${result.resultHash}`
            ).toBe(expectedHash);
        }
    } else {
        expect(result.success,
            `Benchmark should fail as expected for ${task}:${language}`
        ).toBe(false);

        expect(result.error || result.errorType,
            `Failed benchmark should provide error information for ${task}:${language}`
        ).toBeDefined();
    }
}

/**
 * Assert cross-language consistency between two benchmark results
 * @param {Object} rustResult - Rust execution result
 * @param {Object} tinygoResult - TinyGo execution result
 * @param {string} task - Task name for context
 */
export function assertCrossLanguageConsistency(rustResult, tinygoResult, task) {
    // Input validation
    if (!rustResult || typeof rustResult !== 'object') {
        throw new Error('assertCrossLanguageConsistency: rustResult must be a valid object');
    }

    if (!tinygoResult || typeof tinygoResult !== 'object') {
        throw new Error('assertCrossLanguageConsistency: tinygoResult must be a valid object');
    }

    if (typeof task !== 'string' || !task.trim()) {
        throw new Error('assertCrossLanguageConsistency: task must be a non-empty string');
    }
    // Both should have same success status
    expect(rustResult.success,
        `Cross-language success consistency failed for ${task}. Rust: ${rustResult.success}, TinyGo: ${tinygoResult.success}`
    ).toBe(tinygoResult.success);

    if (rustResult.success && tinygoResult.success) {
    // Hash consistency is critical for algorithm correctness
        expect(rustResult.resultHash,
            `Cross-language hash consistency failed for ${task}. Rust: ${rustResult.resultHash}, TinyGo: ${tinygoResult.resultHash}`
        ).toBe(tinygoResult.resultHash);

        // Both should produce valid timing data
        expect(rustResult.executionTime).toBeGreaterThan(0);
        expect(tinygoResult.executionTime).toBeGreaterThan(0);

        // Memory usage should be reasonable for both
        expect(rustResult.memoryUsed).toBeGreaterThan(0);
        expect(tinygoResult.memoryUsed).toBeGreaterThan(0);
    } else if (!rustResult.success && !tinygoResult.success) {
    // Both failed - should have consistent error handling
        expect(rustResult.error || rustResult.errorType).toBeDefined();
        expect(tinygoResult.error || tinygoResult.errorType).toBeDefined();
    }
}






export default {
    assertBenchmarkResult,
    assertCrossLanguageConsistency
};
