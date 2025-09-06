// Unit tests for configuration parsing logic
// Focus: Pure logic functions, data conversion, validation rules

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { optimizeConfig, validateConfig } from '../../scripts/build_config.js';
import DeterministicTestDataGenerator from '../utils/test-data-generator.js';

describe('Configuration Parser', () => {
  let testDataGen;

  beforeEach(() => {
    testDataGen = new DeterministicTestDataGenerator(12345);
  });

  describe('optimizeConfig', () => {
    test('should extract essential configuration for browser use', () => {
      const input = {
        experiment: { name: 'WASM Benchmark', version: '1.0' },
        environment: { 
          warmup_runs: 5, 
          measure_runs: 100,
          timeout_ms: 300000
        },
        tasks: { mandelbrot: { enabled: true } },
        languages: { rust: { enabled: true }, tinygo: { enabled: true } }
      };

      const result = optimizeConfig(input);

      expect(result.experiment).toEqual(input.experiment);
      expect(result.environment.warmupRuns).toBe(5);
      expect(result.environment.measureRuns).toBe(100);
      expect(result.environment.timeout).toBe(300000);
      expect(result.taskNames).toEqual(['mandelbrot']);
      expect(result.enabledLanguages).toEqual(['rust', 'tinygo']);
      expect(result.generated.timestamp).toBeDefined();
    });

    test('should apply default values for missing fields', () => {
      const input = {
        experiment: { name: 'Test' },
        environment: { warmup_runs: 3, measure_runs: 10 },
        tasks: {},
        languages: {}
      };

      const result = optimizeConfig(input);

      expect(result.environment.timeout).toBe(300000); // Default timeout
      expect(result.environment.gcThreshold).toBe(10); // Default GC threshold
      expect(result.environment.memoryMonitoring).toBe(true);
      expect(result.qc).toEqual({});
      expect(result.scales).toEqual(['small', 'medium', 'large']);
    });

    test('should handle empty languages correctly', () => {
      const input = {
        experiment: { name: 'Test' },
        environment: { warmup_runs: 1, measure_runs: 1 },
        tasks: {},
        languages: { rust: { enabled: false }, tinygo: { enabled: false } }
      };

      const result = optimizeConfig(input);
      expect(result.enabledLanguages).toEqual([]);
    });
  });

  describe('validateConfig', () => {
    test('should pass validation for complete configuration', () => {
      const validConfig = {
        experiment: { name: 'Valid Experiment' },
        environment: { warmupRuns: 3, measureRuns: 10 },
        tasks: { mandelbrot: {} },
        languages: { rust: {} },
        taskNames: ['mandelbrot'],
        enabledLanguages: ['rust']
      };

      expect(() => validateConfig(validConfig)).not.toThrow();
    });

    test('should fail validation for missing required sections', () => {
      const invalidConfig = {
        experiment: { name: 'Test' }
        // Missing environment, tasks, languages
      };

      expect(() => validateConfig(invalidConfig)).toThrow(/Missing required section/);
    });

    test('should fail validation for missing experiment name', () => {
      const invalidConfig = {
        experiment: {}, // No name
        environment: { warmupRuns: 1, measureRuns: 1 },
        tasks: { test: {} },
        languages: { rust: {} },
        taskNames: ['test'],
        enabledLanguages: ['rust']
      };

      expect(() => validateConfig(invalidConfig)).toThrow(/Missing experiment name/);
    });

    test('should fail validation for missing environment parameters', () => {
      const invalidConfig = {
        experiment: { name: 'Test' },
        environment: { warmupRuns: 1 }, // Missing measureRuns
        tasks: { test: {} },
        languages: { rust: {} },
        taskNames: ['test'],
        enabledLanguages: ['rust']
      };

      expect(() => validateConfig(invalidConfig)).toThrow(/Missing warmup_runs or measure_runs/);
    });

    test('should fail validation for no tasks', () => {
      const invalidConfig = {
        experiment: { name: 'Test' },
        environment: { warmupRuns: 1, measureRuns: 1 },
        tasks: {},
        languages: { rust: {} },
        taskNames: [], // No tasks
        enabledLanguages: ['rust']
      };

      expect(() => validateConfig(invalidConfig)).toThrow(/No tasks defined/);
    });

    test('should fail validation for no enabled languages', () => {
      const invalidConfig = {
        experiment: { name: 'Test' },
        environment: { warmupRuns: 1, measureRuns: 1 },
        tasks: { test: {} },
        languages: { rust: {} },
        taskNames: ['test'],
        enabledLanguages: [] // No enabled languages
      };

      expect(() => validateConfig(invalidConfig)).toThrow(/No languages enabled/);
    });
  });

  describe('Configuration Data Consistency', () => {
    test('should maintain data integrity through optimization process', () => {
      // Generate deterministic test configuration
      const testConfig = {
        experiment: { 
          name: 'Deterministic Test',
          version: '2.0',
          description: 'Test configuration'
        },
        environment: {
          warmup_runs: testDataGen.rng.nextInt(1, 10),
          measure_runs: testDataGen.rng.nextInt(10, 100),
          timeout_ms: testDataGen.rng.nextInt(10000, 600000)
        },
        tasks: {
          mandelbrot: { enabled: true, scale: 'small' },
          json_parse: { enabled: true, scale: 'medium' }
        },
        languages: {
          rust: { enabled: true },
          tinygo: { enabled: true }
        },
        qc: { outlier_threshold: 2.5 },
        statistics: { confidence_level: 0.95 }
      };

      const optimized = optimizeConfig(testConfig);

      // Verify data integrity
      expect(optimized.experiment.name).toBe(testConfig.experiment.name);
      expect(optimized.environment.warmupRuns).toBe(testConfig.environment.warmup_runs);
      expect(optimized.environment.measureRuns).toBe(testConfig.environment.measure_runs);
      expect(optimized.qc).toEqual(testConfig.qc);
      expect(optimized.statistics).toEqual(testConfig.statistics);
      
      // Verify computed fields
      expect(optimized.taskNames).toContain('mandelbrot');
      expect(optimized.taskNames).toContain('json_parse');
      expect(optimized.enabledLanguages).toContain('rust');
      expect(optimized.enabledLanguages).toContain('tinygo');
    });

    test('should generate consistent validation hash', () => {
      const config = {
        experiment: { name: 'Hash Test' },
        environment: { warmupRuns: 5, measureRuns: 20 },
        tasks: { test: {} },
        languages: { rust: {} },
        taskNames: ['test'],
        enabledLanguages: ['rust']
      };

      const hash1 = testDataGen.generateValidationHash(config);
      const hash2 = testDataGen.generateValidationHash(config);
      
      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('number');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle null/undefined configuration gracefully', () => {
      expect(() => validateConfig(null)).toThrow();
      expect(() => validateConfig(undefined)).toThrow();
      expect(() => validateConfig({})).toThrow();
    });

    test('should handle configuration with extra fields', () => {
      const configWithExtras = {
        experiment: { name: 'Test', extraField: 'should be ignored' },
        environment: { warmupRuns: 1, measureRuns: 1 },
        tasks: { test: {} },
        languages: { rust: {} },
        taskNames: ['test'],
        enabledLanguages: ['rust'],
        unknownSection: { data: 'should be preserved' }
      };

      const optimized = optimizeConfig(configWithExtras);
      expect(() => validateConfig(optimized)).not.toThrow();
    });

    test('should handle deeply nested configuration objects', () => {
      const deepConfig = {
        experiment: { name: 'Deep Test' },
        environment: { 
          warmup_runs: 1, 
          measure_runs: 1,
          nested: {
            level1: {
              level2: {
                value: 42
              }
            }
          }
        },
        tasks: { test: {} },
        languages: { rust: {} }
      };

      const optimized = optimizeConfig(deepConfig);
      expect(optimized.environment.nested.level1.level2.value).toBe(42);
    });
  });
});