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

// Constants for validation limits and defaults
const VALIDATION_CONSTANTS = {
  MIN_EXECUTION_TIME: 0.1,
  MAX_EXECUTION_TIME: 30000,
  MAX_MEMORY_USAGE: 100 * 1024 * 1024, // 100MB
  MAX_COEFFICIENT_OF_VARIATION: 0.3,
  MIN_MEASUREMENTS: 3,
  DEFAULT_ALPHA: 0.05,
  DEFAULT_TARGET_EFFECT_SIZE: 0.2,
  DEFAULT_TARGET_POWER: 0.8,
  MAX_MEMORY_PRESSURE: 0.8,
  MIN_MEMORY_LIMIT: 100 * 1024 * 1024 // 100MB
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

/**
 * Assert performance measurement consistency and quality
 * @param {Array<number>} measurements - Array of execution times
 * @param {Object} options - Validation options
 */
export function assertPerformanceConsistency(measurements, options = {}) {
  // Input validation
  if (!Array.isArray(measurements)) {
    throw new Error('assertPerformanceConsistency: measurements must be an array');
  }
  
  if (options && typeof options !== 'object') {
    throw new Error('assertPerformanceConsistency: options must be an object');
  }

  const {
    maxCoefficientOfVariation = global.validationRules?.executionTime?.variationCoeff || VALIDATION_CONSTANTS.MAX_COEFFICIENT_OF_VARIATION,
    minMeasurements = VALIDATION_CONSTANTS.MIN_MEASUREMENTS,
    task = 'unknown',
    language = 'unknown'
  } = options;
  
  // Validate option parameters
  if (typeof maxCoefficientOfVariation !== 'number' || maxCoefficientOfVariation <= 0) {
    throw new Error('assertPerformanceConsistency: maxCoefficientOfVariation must be a positive number');
  }
  
  if (typeof minMeasurements !== 'number' || minMeasurements < 1) {
    throw new Error('assertPerformanceConsistency: minMeasurements must be at least 1');
  }

  expect(measurements,
    `Performance measurements should be an array for ${task}:${language}`
  ).toBeInstanceOf(Array);
  
  expect(measurements.length,
    `Insufficient measurements for ${task}:${language}. Need at least ${minMeasurements}, got ${measurements.length}`
  ).toBeGreaterThanOrEqual(minMeasurements);

  // All measurements should be positive
  measurements.forEach((time, index) => {
    expect(time,
      `Measurement ${index} should be positive for ${task}:${language}. Got: ${time}`
    ).toBeGreaterThan(0);
  });

  // Calculate coefficient of variation for stability
  const mean = measurements.reduce((sum, t) => sum + t, 0) / measurements.length;
  const variance = measurements.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / measurements.length;
  const coefficientOfVariation = Math.sqrt(variance) / mean;

  expect(coefficientOfVariation,
    `Performance inconsistency detected for ${task}:${language}. CV: ${coefficientOfVariation.toFixed(3)}, max allowed: ${maxCoefficientOfVariation}`
  ).toBeLessThan(maxCoefficientOfVariation);

  return {
    mean,
    standardDeviation: Math.sqrt(variance),
    coefficientOfVariation,
    count: measurements.length,
    min: Math.min(...measurements),
    max: Math.max(...measurements)
  };
}

/**
 * Assert statistical significance between two groups
 * @param {Array<number>} group1 - First group measurements
 * @param {Array<number>} group2 - Second group measurements  
 * @param {Object} options - Test options
 */
export function assertStatisticalSignificance(group1, group2, options = {}) {
  const {
    alpha = 0.05,
    expectSignificant = null, // null = no expectation, true/false = expect specific result
    group1Name = 'Group 1',
    group2Name = 'Group 2'
  } = options;

  expect(group1.length,
    `${group1Name} should have measurements`
  ).toBeGreaterThan(0);
  
  expect(group2.length,
    `${group2Name} should have measurements`
  ).toBeGreaterThan(0);

  const significance = powerAnalysis.calculateSignificance(group1, group2, alpha);

  expect(significance.pValue,
    `P-value should be calculated for ${group1Name} vs ${group2Name}`
  ).toBeDefined();
  
  expect(significance.tStatistic,
    `T-statistic should be calculated for ${group1Name} vs ${group2Name}`
  ).toBeDefined();

  if (expectSignificant !== null) {
    expect(significance.isSignificant,
      `Statistical significance expectation failed for ${group1Name} vs ${group2Name}. ` +
      `Expected significant: ${expectSignificant}, Got: ${significance.isSignificant}, ` +
      `p-value: ${significance.pValue.toFixed(4)}, alpha: ${alpha}`
    ).toBe(expectSignificant);
  }

  return {
    ...significance,
    group1Stats: {
      count: group1.length,
      mean: powerAnalysis.calculateMean(group1),
      std: powerAnalysis.calculateStandardDeviation(group1)
    },
    group2Stats: {
      count: group2.length,
      mean: powerAnalysis.calculateMean(group2),
      std: powerAnalysis.calculateStandardDeviation(group2)
    }
  };
}

/**
 * Assert power analysis requirements are met
 * @param {Object} pilotData - Pilot study data {rust: Array, tinygo: Array}
 * @param {Object} options - Analysis options
 */
export function assertStatisticalPower(pilotData, options = {}) {
  const {
    targetEffectSize = 0.2,
    targetPower = 0.8,
    alpha = 0.05,
    requireSufficientPower = false
  } = options;

  expect(pilotData,
    'Pilot data should be provided for power analysis'
  ).toBeDefined();
  
  expect(pilotData.rust,
    'Pilot data should contain rust measurements'
  ).toBeInstanceOf(Array);
  
  expect(pilotData.tinygo,
    'Pilot data should contain tinygo measurements'
  ).toBeInstanceOf(Array);

  const analysis = powerAnalysis.validateCurrentDesign(pilotData, targetEffectSize);

  expect(analysis.observedEffectSize,
    'Observed effect size should be calculated'
  ).toBeDefined();
  
  expect(analysis.currentPower,
    'Current statistical power should be calculated'
  ).toBeDefined();

  if (requireSufficientPower) {
    expect(analysis.currentPower,
      `Statistical power ${(analysis.currentPower * 100).toFixed(1)}% is insufficient. ` +
      `Target: ${(targetPower * 100).toFixed(1)}%. ` +
      `Consider increasing sample size to ${analysis.suggestedSampleSize || 'unknown'}`
    ).toBeGreaterThanOrEqual(targetPower);
  }

  return analysis;
}

/**
 * Assert system meets experimental requirements
 * @param {Object} systemMetrics - System metrics from browser
 * @param {Object} options - Validation options
 */
export function assertExperimentalEnvironment(systemMetrics, options = {}) {
  const {
    maxMemoryPressure = 0.8,
    requirePerformanceAPI = true,
    requireWebAssembly = true,
    minMemoryLimit = 100 * 1024 * 1024 // 100MB
  } = options;

  expect(systemMetrics,
    'System metrics should be provided'
  ).toBeDefined();

  if (requireWebAssembly) {
    expect(systemMetrics.webassembly || systemMetrics.webAssemblySupport,
      'WebAssembly support is required for experiments'
    ).toBe(true);
  }

  if (requirePerformanceAPI) {
    expect(systemMetrics.performanceAPI || systemMetrics.performanceNow,
      'Performance API is required for accurate timing'
    ).toBe(true);
  }

  if (systemMetrics.memory) {
    expect(systemMetrics.memory.pressure,
      `Memory pressure ${(systemMetrics.memory.pressure * 100).toFixed(1)}% exceeds maximum ${(maxMemoryPressure * 100).toFixed(1)}%`
    ).toBeLessThan(maxMemoryPressure);

    expect(systemMetrics.memory.limit,
      `Memory limit ${systemMetrics.memory.limit} bytes is below minimum ${minMemoryLimit} bytes`
    ).toBeGreaterThan(minMemoryLimit);
  }
}

/**
 * Assert timeout behavior is handled correctly
 * @param {Object} result - Result that may have timed out
 * @param {Object} options - Timeout validation options
 */
export function assertTimeoutHandling(result, options = {}) {
  const {
    expectTimeout = false,
    task = 'unknown',
    language = 'unknown',
    timeoutDuration = 'unknown'
  } = options;

  if (expectTimeout) {
    expect(result.success,
      `Task ${task}:${language} should timeout and fail within ${timeoutDuration}ms`
    ).toBe(false);
    
    const errorIndicatesTimeout = result.error?.includes('timeout') || 
                                 result.error?.includes('aborted') ||
                                 result.errorType === 'timeout';
    
    expect(errorIndicatesTimeout,
      `Timeout error should be properly identified for ${task}:${language}. Error: ${result.error}, ErrorType: ${result.errorType}`
    ).toBe(true);
  } else {
    // If not expecting timeout, result should either succeed or fail for other reasons
    if (!result.success) {
      const errorIndicatesTimeout = result.error?.includes('timeout') || 
                                   result.error?.includes('aborted') ||
                                   result.errorType === 'timeout';
      
      expect(errorIndicatesTimeout,
        `Unexpected timeout detected for ${task}:${language}. This might indicate system performance issues.`
      ).toBe(false);
    }
  }
}

export default {
  assertBenchmarkResult,
  assertCrossLanguageConsistency,
  assertPerformanceConsistency,
  assertStatisticalSignificance,
  assertStatisticalPower,
  assertExperimentalEnvironment,
  assertTimeoutHandling
};