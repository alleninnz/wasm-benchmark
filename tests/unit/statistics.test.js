// Unit tests for statistical calculation functions
// Focus: Pure mathematical functions, data processing, validation algorithms

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

    test('should generate different data with different seeds', () => {
      const gen1 = new DeterministicTestDataGenerator(11111);
      const gen2 = new DeterministicTestDataGenerator(22222);

      const data1 = gen1.generateScaledDataset('mandelbrot', 'micro');
      const data2 = gen2.generateScaledDataset('mandelbrot', 'micro');

      expect(data1.centerX).not.toBeCloseTo(data2.centerX, 5);
      expect(data1.centerY).not.toBeCloseTo(data2.centerY, 5);
    });

    test('should generate data matching scale configurations', () => {
      const microData = testDataGen.generateScaledDataset('json_parse', 'micro');
      const smallData = testDataGen.generateScaledDataset('json_parse', 'small');
      const mediumData = testDataGen.generateScaledDataset('json_parse', 'medium');

      expect(microData.data.length).toBe(10);  // micro scale
      expect(smallData.data.length).toBe(100); // small scale
      expect(mediumData.data.length).toBe(1000); // medium scale

      // Verify data structure consistency
      expect(microData.data[0]).toHaveProperty('id');
      expect(microData.data[0]).toHaveProperty('name');
      expect(microData.data[0]).toHaveProperty('age');
      expect(microData.data[0]).toHaveProperty('active');
      expect(microData.data[0]).toHaveProperty('balance');
    });

    test('should generate valid matrix data', () => {
      const matrixData = testDataGen.generateScaledDataset('matrix_mul', 'small');
      
      expect(matrixData.size).toBe(64); // small scale size
      expect(matrixData.matrixA).toHaveLength(64);
      expect(matrixData.matrixB).toHaveLength(64);
      expect(matrixData.matrixA[0]).toHaveLength(64);
      expect(matrixData.matrixB[0]).toHaveLength(64);

      // Verify values are within expected range
      const flatA = matrixData.matrixA.flat();
      const allInRange = flatA.every(val => val >= -100 && val <= 100);
      expect(allInRange).toBe(true);
    });

    test('should generate consistent validation hashes', () => {
      const data = { test: 'value', number: 42, array: [1, 2, 3] };
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

  describe('Statistical Power Analysis', () => {
    test('should calculate required sample size correctly', () => {
      // Test with known values
      const effectSize = 0.5; // Medium effect size
      const alpha = 0.05;
      const power = 0.8;
      
      const requiredN = powerAnalysis.calculateRequiredSampleSize(effectSize, alpha, power);
      
      // For medium effect size (d=0.5), should need ~64 samples per group
      expect(requiredN).toBeGreaterThan(50);
      expect(requiredN).toBeLessThan(100);
    });

    test('should calculate larger sample size for smaller effect', () => {
      const smallEffect = powerAnalysis.calculateRequiredSampleSize(0.2);
      const mediumEffect = powerAnalysis.calculateRequiredSampleSize(0.5);
      const largeEffect = powerAnalysis.calculateRequiredSampleSize(0.8);
      
      expect(smallEffect).toBeGreaterThan(mediumEffect);
      expect(mediumEffect).toBeGreaterThan(largeEffect);
    });

    test('should calculate effect size from sample data', () => {
      // Generate test data with known difference
      const group1 = [10, 12, 14, 16, 18]; // mean = 14, sd ≈ 2.83
      const group2 = [20, 22, 24, 26, 28]; // mean = 24, sd ≈ 2.83
      
      const effectSize = powerAnalysis.calculateEffectSize(group1, group2);
      
      // Effect size should be (24-14)/2.83 ≈ 3.54 (very large effect)
      expect(effectSize).toBeGreaterThan(3);
      expect(effectSize).toBeLessThan(4);
    });

    test('should calculate statistical significance correctly', () => {
      const group1 = [1, 2, 3, 4, 5];
      const group2 = [6, 7, 8, 9, 10];
      
      const significance = powerAnalysis.calculateSignificance(group1, group2);
      
      expect(significance.pValue).toBeDefined();
      expect(significance.tStatistic).toBeDefined();
      expect(significance.isSignificant).toBeDefined();
      expect(significance.meanDifference).toBe(5); // 7.5 - 2.5
      expect(significance.meanDifferencePercent).toBeCloseTo(166.67, 1); // (8-3)/3*100 = 166.67%
    });

    test('should provide experimental design recommendations', () => {
      const recommendations = powerAnalysis.generateExperimentRecommendations(0.3, 0.05, 0.8);
      
      expect(recommendations.sampleSize.minimum).toBeDefined();
      expect(recommendations.sampleSize.recommended).toBeDefined();
      expect(recommendations.designParameters.alpha).toBe(0.05);
      expect(recommendations.designParameters.power).toBe(0.8);
      expect(recommendations.qualityControls.warmupRuns).toBeDefined();
      expect(recommendations.qualityControls.measurementRuns).toBeDefined();
    });

    test('should validate pilot study data correctly', () => {
      const pilotData = {
        rust: [10.2, 9.8, 10.1, 9.9, 10.0, 10.3, 9.7, 10.2, 9.9, 10.1],
        tinygo: [12.1, 11.8, 12.3, 12.0, 11.9, 12.2, 11.7, 12.1, 12.0, 11.8]
      };
      
      const validation = powerAnalysis.validateCurrentDesign(pilotData);
      
      expect(validation.observedEffectSize).toBeDefined();
      expect(validation.currentSampleSize).toBe(10);
      expect(validation.currentPower).toBeDefined();
      expect(validation.recommendation).toBeDefined();
      expect(validation.interpretation).toBeDefined();
      expect(validation.statisticalSignificance.pValue).toBeDefined();
    });

    test('should handle insufficient pilot data gracefully', () => {
      const insufficientData = { rust: [1, 2] }; // Missing tinygo data
      
      const validation = powerAnalysis.validateCurrentDesign(insufficientData);
      
      expect(validation.status).toBe('insufficient_data');
      expect(validation.message).toBeDefined();
    });
  });

  describe('Mathematical Utilities', () => {
    test('should calculate mean correctly', () => {
      const data = [1, 2, 3, 4, 5];
      const mean = powerAnalysis.calculateMean(data);
      expect(mean).toBe(3);
    });

    test('should calculate standard deviation correctly', () => {
      const data = [2, 4, 4, 4, 5, 5, 7, 9]; // Known dataset
      const std = powerAnalysis.calculateStandardDeviation(data);
      expect(std).toBeCloseTo(2, 0); // Should be approximately 2
    });

    test('should handle edge cases in statistical calculations', () => {
      // Single value
      expect(powerAnalysis.calculateMean([5])).toBe(5);
      
      // Two identical values (zero variance)
      const identicalValues = [5, 5];
      expect(powerAnalysis.calculateStandardDeviation(identicalValues)).toBe(0);
      
      // Empty array should be handled gracefully
      expect(() => powerAnalysis.calculateMean([])).toThrow();
    });

    test('should calculate pooled standard deviation correctly', () => {
      const group1 = [1, 2, 3];
      const group2 = [4, 5, 6];
      
      const pooledStd = powerAnalysis.calculatePooledStandardDeviation(group1, group2);
      
      expect(pooledStd).toBeGreaterThan(0);
      expect(pooledStd).toBeLessThan(10);
    });
  });

  describe('Cross-language Validation Support', () => {
    test('should generate consistent test configurations for all scales', () => {
      const configs = testDataGen.generateTestConfigs();
      
      // Verify all test types are present
      expect(configs.smoke).toBeDefined();
      expect(configs.integration).toBeDefined();
      expect(configs.stress).toBeDefined();

      // Verify all tasks are present in each scale
      const tasks = ['mandelbrot', 'json_parse', 'matrix_mul'];
      tasks.forEach(task => {
        expect(configs.smoke[task]).toBeDefined();
        expect(configs.integration[task]).toBeDefined();
        expect(configs.stress[task]).toBeDefined();
      });
    });

    test('should support cross-language hash consistency validation', () => {
      const mandelbrotData = testDataGen.generateScaledDataset('mandelbrot', 'micro');
      const hash = testDataGen.generateValidationHash(mandelbrotData.expectedProperties);
      
      // The hash should be consistent across different invocations
      const hash2 = testDataGen.generateValidationHash(mandelbrotData.expectedProperties);
      expect(hash).toBe(hash2);
    });

    test('should handle floating point precision in hash generation', () => {
      const data1 = { value: 1.123456789 };
      const data2 = { value: 1.123456789 };
      const data3 = { value: 1.123456788 }; // Slightly different
      
      const hash1 = testDataGen.generateValidationHash(data1);
      const hash2 = testDataGen.generateValidationHash(data2);
      const hash3 = testDataGen.generateValidationHash(data3);
      
      expect(hash1).toBe(hash2); // Same data should have same hash
      expect(hash1).toBe(hash3); // Should be the same after rounding to 3 decimal places
    });
  });
});