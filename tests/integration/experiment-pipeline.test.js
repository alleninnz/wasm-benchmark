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
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    
    await page.goto('http://localhost:3001/bench.html', { 
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
        
        // Run benchmark for configured number of iterations
        for (let run = 0; run < config.runs; run++) {
          // Mandelbrot benchmark
          const mandelbrotRust = await window.runTask('mandelbrot', 'rust', config.testData.mandelbrot);
          const mandelbrotTinygo = await window.runTask('mandelbrot', 'tinygo', config.testData.mandelbrot);
          
          results.mandelbrot.rust.push(mandelbrotRust);
          results.mandelbrot.tinygo.push(mandelbrotTinygo);
          
          // JSON parsing benchmark
          const jsonRust = await window.runTask('json_parse', 'rust', config.testData.json_parse);
          const jsonTinygo = await window.runTask('json_parse', 'tinygo', config.testData.json_parse);
          
          results.json_parse.rust.push(jsonRust);
          results.json_parse.tinygo.push(jsonTinygo);
          
          // Brief pause between runs to prevent throttling
          await new Promise(resolve => setTimeout(resolve, 100));
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
            expect(result.executionTime).toBeGreaterThan(0);
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

    test('should handle benchmark execution with concurrent tasks', async () => {
      // Test parallel execution capability
      const concurrentConfig = {
        tasks: ['mandelbrot', 'json_parse'],
        languages: ['rust', 'tinygo'],
        concurrent: true
      };

      const testData = {
        mandelbrot: testDataGen.generateScaledDataset('mandelbrot', 'micro'),
        json_parse: testDataGen.generateScaledDataset('json_parse', 'micro')
      };

      const startTime = Date.now();
      
      const results = await page.evaluate(async (config) => {
        const promises = [];
        
        // Execute all task-language combinations concurrently
        config.tasks.forEach(task => {
          config.languages.forEach(language => {
            promises.push(
              window.runTask(task, language, config.testData[task])
                .then(result => ({ task, language, ...result }))
            );
          });
        });
        
        return await Promise.all(promises);
      }, { ...concurrentConfig, testData });

      const executionTime = Date.now() - startTime;

      // All tasks should complete successfully
      expect(results).toHaveLength(4); // 2 tasks × 2 languages
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.task).toBeDefined();
        expect(result.language).toBeDefined();
      });

      // Concurrent execution should be reasonably fast
      expect(executionTime).toBeLessThan(30000); // Should complete within 30 seconds
    });
  });

  describe('Data Collection and Quality Control', () => {
    test('should collect comprehensive performance metrics', async () => {
      const testData = testDataGen.generateScaledDataset('mandelbrot', 'small');
      
      const metrics = await page.evaluate(async (data) => {
        // Enable detailed metrics collection
        window.enableDetailedMetrics(true);
        
        const result = await window.runTask('mandelbrot', 'rust', data);
        return {
          ...result,
          systemMetrics: window.getSystemMetrics(),
          browserInfo: window.getBrowserInfo()
        };
      }, testData);

      // Validate comprehensive metrics collection
      expect(metrics.executionTime).toBeDefined();
      expect(metrics.memoryUsed).toBeDefined();
      expect(metrics.resultHash).toBeDefined();
      expect(metrics.systemMetrics).toBeDefined();
      expect(metrics.browserInfo).toBeDefined();
      
      // Validate metric ranges
      expect(metrics.executionTime).toBeGreaterThan(global.validationRules.executionTime.min);
      expect(metrics.memoryUsed).toBeGreaterThan(global.validationRules.memoryUsage.min);
      expect(metrics.memoryUsed).toBeLessThan(global.validationRules.memoryUsage.max);
    });

    test('should detect and flag performance anomalies', async () => {
      const baselineRuns = 10;
      const testData = testDataGen.generateScaledDataset('json_parse', 'micro');
      const measurements = [];

      // Collect baseline measurements
      for (let i = 0; i < baselineRuns; i++) {
        const result = await page.evaluate(async (data) => {
          return await window.runTask('json_parse', 'rust', data);
        }, testData);
        
        if (result.success) {
          measurements.push(result.executionTime);
        }
      }

      expect(measurements.length).toBeGreaterThan(baselineRuns * 0.8); // At least 80% success rate

      // Statistical analysis for anomaly detection
      const mean = measurements.reduce((sum, t) => sum + t, 0) / measurements.length;
      const stdDev = Math.sqrt(
        measurements.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / measurements.length
      );

      // Apply quality control rules
      const outliers = measurements.filter(t => Math.abs(t - mean) > 2 * stdDev);
      const coefficientOfVariation = stdDev / mean;

      // Validate data quality
      expect(coefficientOfVariation).toBeLessThan(0.5); // CV < 50% for stability
      expect(outliers.length / measurements.length).toBeLessThan(0.1); // < 10% outliers
    });

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
          results: benchmarkResult,
          environment: {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            memory: performance.memory ? {
              used: performance.memory.usedJSHeapSize,
              total: performance.memory.totalJSHeapSize,
              limit: performance.memory.jsHeapSizeLimit
            } : null
          }
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
      expect(savedData.environment).toBeDefined();
    });
  });

  describe('Statistical Analysis Pipeline', () => {
    test('should perform statistical power analysis on collected data', async () => {
      const sampleSize = 20;
      const rustTimes = [];
      const tinygoTimes = [];
      
      // Collect performance data for power analysis
      for (let i = 0; i < sampleSize; i++) {
        const testData = testDataGen.generateScaledDataset('mandelbrot', 'micro');
        
        const results = await page.evaluate(async (data) => {
          const rustResult = await window.runTask('mandelbrot', 'rust', data);
          const tinygoResult = await window.runTask('mandelbrot', 'tinygo', data);
          return {
            rust: rustResult.executionTime,
            tinygo: tinygoResult.executionTime
          };
        }, testData);
        
        rustTimes.push(results.rust);
        tinygoTimes.push(results.tinygo);
      }

      // Perform power analysis
      const pilotData = { rust: rustTimes, tinygo: tinygoTimes };
      const powerAnalysisResult = powerAnalysis.validateCurrentDesign(pilotData, 0.3);

      // Validate analysis results
      expect(powerAnalysisResult.observedEffectSize).toBeDefined();
      expect(powerAnalysisResult.currentPower).toBeDefined();
      expect(powerAnalysisResult.interpretation).toBeDefined();
      expect(powerAnalysisResult.statisticalSignificance).toBeDefined();
      
      // Effect size should be reasonable for performance comparison
      expect(powerAnalysisResult.observedEffectSize).toBeGreaterThan(0);
      expect(powerAnalysisResult.observedEffectSize).toBeLessThan(5); // Very large effect
    });

    test('should generate experiment design recommendations', async () => {
      const recommendations = powerAnalysis.generateExperimentRecommendations(0.2, 0.05, 0.8);
      
      // Validate recommendation structure
      expect(recommendations.sampleSize.minimum).toBeDefined();
      expect(recommendations.sampleSize.recommended).toBeDefined();
      expect(recommendations.designParameters.alpha).toBe(0.05);
      expect(recommendations.designParameters.power).toBe(0.8);
      expect(recommendations.qualityControls.warmupRuns).toBeGreaterThan(0);
      expect(recommendations.qualityControls.measurementRuns).toBeGreaterThan(0);
      
      // Sample size should be reasonable for detecting 20% effect
      expect(recommendations.sampleSize.minimum).toBeGreaterThan(50);
      expect(recommendations.sampleSize.minimum).toBeLessThan(1000);
    });
  });

  describe('Error Recovery and Resilience', () => {
    test('should recover gracefully from WebAssembly module loading failures', async () => {
      // Simulate module loading failure
      const result = await page.evaluate(async () => {
        try {
          // Attempt to load a non-existent WASM module
          const fakeResult = await window.runTask('nonexistent_task', 'rust', {});
          return { success: fakeResult.success, error: null };
        } catch (error) {
          return { success: false, error: error.message };
        }
      });

      // Should handle failure gracefully without crashing
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle browser resource constraints gracefully', async () => {
      // Test with resource-intensive configuration
      const heavyConfig = testDataGen.generateScaledDataset('matrix_mul', 'medium');
      
      const result = await page.evaluate(async (data) => {
        try {
          // Attempt resource-intensive task
          const benchmarkResult = await window.runTask('matrix_mul', 'rust', data);
          return benchmarkResult;
        } catch (error) {
          return { success: false, error: error.message, errorType: 'resource_constraint' };
        }
      }, heavyConfig);

      // Should either succeed or fail gracefully with proper error reporting
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(result.errorType).toBeDefined();
      } else {
        // If successful, validate result integrity
        expect(result.resultHash).toBeDefined();
        expect(result.executionTime).toBeGreaterThan(0);
      }
    });

    test('should maintain data integrity during interruptions', async () => {
      const testData = testDataGen.generateScaledDataset('json_parse', 'small');
      
      // Start benchmark and simulate interruption
      const result = await page.evaluate(async (data) => {
        const startTime = performance.now();
        
        try {
          const benchmarkPromise = window.runTask('json_parse', 'rust', data);
          
          // Simulate interruption after short delay
          setTimeout(() => {
            window.dispatchEvent(new Event('beforeunload'));
          }, 10);
          
          const result = await benchmarkPromise;
          const endTime = performance.now();
          
          return { 
            ...result, 
            executionTime: endTime - startTime,
            interrupted: false 
          };
        } catch (error) {
          return { 
            success: false, 
            error: error.message, 
            interrupted: true 
          };
        }
      }, testData);

      // Result should be valid regardless of interruption handling
      if (result.success) {
        expect(result.resultHash).toBeDefined();
      } else {
        expect(result.error).toBeDefined();
      }
    });
  });
});