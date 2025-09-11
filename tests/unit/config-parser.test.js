// Unit tests for configuration parsing logic
// Focus: Core configuration processing for WASM benchmarks

import { describe, test, expect, beforeEach } from 'vitest';
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
        tasks: { mandelbrot: { enabled: true }, json_parse: { enabled: true } },
        languages: { rust: { enabled: true }, tinygo: { enabled: true } }
      };

      const result = optimizeConfig(input);

      expect(result.experiment).toEqual(input.experiment);
      expect(result.environment.warmupRuns).toBe(5);
      expect(result.environment.measureRuns).toBe(100);
      expect(result.environment.timeout).toBe(300000);
      expect(result.taskNames).toEqual(['mandelbrot', 'json_parse']);
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

      expect(result.environment.timeout).toBe(300000);
      expect(result.environment.gcThreshold).toBe(10);
      expect(result.enabledLanguages).toEqual([]);
    });

    test('should handle disabled languages correctly', () => {
      const input = {
        experiment: { name: 'Test' },
        environment: { warmup_runs: 1, measure_runs: 1 },
        tasks: { mandelbrot: { enabled: true } },
        languages: { rust: { enabled: false }, tinygo: { enabled: true } }
      };

      const result = optimizeConfig(input);
      expect(result.enabledLanguages).toEqual(['tinygo']);
      expect(result.taskNames).toEqual(['mandelbrot']);
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
      const invalidConfig = {};

      expect(() => validateConfig(invalidConfig)).toThrow();
    });

    test('should fail validation for missing experiment name', () => {
      const invalidConfig = {
        experiment: {},
        environment: { warmupRuns: 3, measureRuns: 10 },
        tasks: {},
        languages: {},
        taskNames: [],
        enabledLanguages: []
      };

      expect(() => validateConfig(invalidConfig)).toThrow();
    });

    test('should fail validation for invalid environment parameters', () => {
      const invalidConfig = {
        experiment: { name: 'Test' },
        environment: { warmupRuns: -1 }, // Invalid negative value
        tasks: {},
        languages: {},
        taskNames: [],
        enabledLanguages: []
      };

      expect(() => validateConfig(invalidConfig)).toThrow();
    });
  });

  describe('Configuration Data Consistency', () => {
    test('should maintain data integrity through optimization process', () => {
      const originalConfig = {
        experiment: { name: 'Consistency Test', version: '2.0' },
        environment: { warmup_runs: 10, measure_runs: 50 },
        tasks: { 
          mandelbrot: { enabled: true }, 
          json_parse: { enabled: true },
          matrix_mul: { enabled: false }
        },
        languages: { rust: { enabled: true }, tinygo: { enabled: true } }
      };

      const optimized = optimizeConfig(originalConfig);
      
      expect(optimized.taskNames).toHaveLength(2);
      expect(optimized.taskNames).toContain('mandelbrot');
      expect(optimized.taskNames).toContain('json_parse');
      expect(optimized.taskNames).not.toContain('matrix_mul');
      
      expect(optimized.enabledLanguages).toEqual(['rust', 'tinygo']);
      expect(optimized.experiment.name).toBe('Consistency Test');
    });

    test('should handle edge cases gracefully', () => {
      const edgeConfig = {
        experiment: { name: 'Edge Test' },
        environment: { warmup_runs: 0, measure_runs: 1 }, // Minimal runs
        tasks: {},
        languages: {}
      };

      const result = optimizeConfig(edgeConfig);
      
      expect(result.taskNames).toEqual([]);
      expect(result.enabledLanguages).toEqual([]);
      expect(result.environment.warmupRuns).toBe(0);
      expect(result.environment.measureRuns).toBe(1);
    });
  });

});