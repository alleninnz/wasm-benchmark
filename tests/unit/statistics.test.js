// Unit tests for core statistical functions used in WASM benchmarking
// Focus: Essential data generation and validation functionality

import { describe, test, expect, beforeEach } from 'vitest';
import DeterministicTestDataGenerator from '../utils/test-data-generator.js';
import PowerAnalysis from '../utils/statistical-power.js';

describe('Statistical Functions', () => {
  let testDataGen;
  let powerAnalysis;

  beforeEach(() => {
    testDataGen = new DeterministicTestDataGenerator(12345);
    powerAnalysis = new PowerAnalysis();
  });

  describe('Test Data Generator', () => {
    test('should generate reproducible data with same seed', () => {
      const gen1 = new DeterministicTestDataGenerator(54321);
      const gen2 = new DeterministicTestDataGenerator(54321);

      const data1 = gen1.generateScaledDataset('mandelbrot', 'micro');
      const data2 = gen2.generateScaledDataset('mandelbrot', 'micro');

      expect(data1.width).toBe(data2.width);
      expect(data1.height).toBe(data2.height);
      expect(data1.centerX).toBeCloseTo(data2.centerX, 10);
      expect(data1.centerY).toBeCloseTo(data2.centerY, 10);
    });

    test('should generate data matching scale configurations', () => {
      const microData = testDataGen.generateScaledDataset('json_parse', 'micro');
      const smallData = testDataGen.generateScaledDataset('json_parse', 'small');

      expect(microData.data.length).toBe(10);
      expect(smallData.data.length).toBe(100);
      expect(microData.data[0]).toHaveProperty('id');
    });

    test('should generate consistent validation hashes', () => {
      const data = { test: 'value', number: 42 };
      const hash1 = testDataGen.generateValidationHash(data);
      const hash2 = testDataGen.generateValidationHash(data);
      
      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('number');
    });

    test('should generate different hashes for different data', () => {
      const data1 = { value: 1 };
      const data2 = { value: 2 };
      
      const hash1 = testDataGen.generateValidationHash(data1);
      const hash2 = testDataGen.generateValidationHash(data2);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Basic Statistical Analysis', () => {
    test('should calculate basic statistical measures', () => {
      const data = [10, 12, 14, 16, 18, 20];
      const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
      const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
      
      expect(mean).toBe(15);
      expect(variance).toBe(11.666666666666666);
    });

    test('should handle basic power analysis calculations', () => {
      const sampleSize = powerAnalysis.calculateRequiredSampleSize(0.5, 0.05, 0.8);
      expect(sampleSize).toBeGreaterThan(0);
      expect(typeof sampleSize).toBe('number');
    });
  });

  describe('Cross-language Support', () => {
    test('should support all WASM benchmark tasks', () => {
      const tasks = ['mandelbrot', 'json_parse', 'matrix_mul'];
      tasks.forEach(task => {
        const data = testDataGen.generateScaledDataset(task, 'micro');
        expect(data).toBeDefined();
        expect(data.expectedProperties).toBeDefined();
      });
    });

    test('should generate consistent test configurations', () => {
      const configs = testDataGen.generateTestConfigs();
      expect(configs.smoke).toBeDefined();
      expect(configs.integration).toBeDefined();
      expect(configs.smoke.mandelbrot).toBeDefined();
    });
  });

});