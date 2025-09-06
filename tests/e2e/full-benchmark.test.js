// End-to-end tests for complete benchmark suite
// Focus: Validates entire benchmark workflow from start to finish

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import DeterministicTestDataGenerator from '../utils/test-data-generator.js';
import PowerAnalysis from '../utils/statistical-power.js';

describe('Full Benchmark Suite E2E', () => {
  let browser;
  let page;
  let testDataGen;
  let powerAnalysis;

  beforeAll(async () => {
    testDataGen = new DeterministicTestDataGenerator(12345);
    powerAnalysis = new PowerAnalysis();
    
    // Launch browser for full benchmark testing
    browser = await puppeteer.launch({
      ...global.testBrowserConfig,
      devtools: false, // Disable devtools for pure performance
      args: [
        ...global.testBrowserConfig.args,
        '--disable-extensions',
        '--disable-plugins',
        '--disable-background-networking'
      ]
    });
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  describe('Complete Benchmark Execution', () => {
    test('should execute full benchmark suite successfully', async () => {
      page = await browser.newPage();
      
      // Navigate to benchmark page
      await page.goto('http://localhost:3001/bench.html', { 
        waitUntil: 'networkidle0',
        timeout: 60000 
      });

      // Wait for all WebAssembly modules to load
      await page.waitForFunction(() => {
        return window.wasmModulesLoaded && 
               window.wasmModulesLoaded.rust && 
               window.wasmModulesLoaded.tinygo;
      }, { timeout: 30000 });

      // Generate test configurations for all scales
      const testConfigs = testDataGen.generateTestConfigs();
      
      // Execute integration-level benchmark (small scale, 10 runs as per strategy)
      const benchmarkResults = await page.evaluate(async (configs) => {
        const results = {
          startTime: performance.now(),
          tasks: {},
          summary: {
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            crossLanguageConsistency: true,
            performanceMetrics: {}
          }
        };

        const tasks = ['mandelbrot', 'json_parse', 'matrix_mul'];
        const languages = ['rust', 'tinygo'];
        const runs = 10; // Integration test configuration

        for (const task of tasks) {
          results.tasks[task] = {};
          
          for (const language of languages) {
            results.tasks[task][language] = {
              executions: [],
              hashes: [],
              executionTimes: [],
              memoryUsages: []
            };

            // Execute multiple runs for statistical validity
            for (let run = 0; run < runs; run++) {
              try {
                const testData = configs.integration[task];
                const result = await window.runTask(task, language, testData);
                
                results.tasks[task][language].executions.push({
                  run,
                  success: result.success,
                  executionTime: result.executionTime,
                  memoryUsed: result.memoryUsed,
                  resultHash: result.resultHash
                });

                if (result.success) {
                  results.tasks[task][language].hashes.push(result.resultHash);
                  results.tasks[task][language].executionTimes.push(result.executionTime);
                  results.tasks[task][language].memoryUsages.push(result.memoryUsed);
                  results.summary.successfulExecutions++;
                } else {
                  results.summary.failedExecutions++;
                }
                
                results.summary.totalExecutions++;
                
                // Brief pause between runs to prevent throttling
                await new Promise(resolve => setTimeout(resolve, 50));
                
              } catch (error) {
                results.tasks[task][language].executions.push({
                  run,
                  success: false,
                  error: error.message
                });
                results.summary.failedExecutions++;
                results.summary.totalExecutions++;
              }
            }
          }
        }

        results.endTime = performance.now();
        results.totalDuration = results.endTime - results.startTime;
        
        return results;
      }, testConfigs);

      // Validate overall execution success
      expect(benchmarkResults.summary.totalExecutions).toBe(60); // 3 tasks × 2 languages × 10 runs
      expect(benchmarkResults.summary.successfulExecutions).toBeGreaterThan(54); // >90% success rate
      
      const successRate = benchmarkResults.summary.successfulExecutions / benchmarkResults.summary.totalExecutions;
      expect(successRate).toBeGreaterThan(0.9);

      // Validate cross-language hash consistency
      Object.keys(benchmarkResults.tasks).forEach(task => {
        const rustHashes = benchmarkResults.tasks[task].rust.hashes;
        const tinygoHashes = benchmarkResults.tasks[task].tinygo.hashes;
        
        if (rustHashes.length > 0 && tinygoHashes.length > 0) {
          // All rust hashes should be identical
          const uniqueRustHashes = [...new Set(rustHashes)];
          expect(uniqueRustHashes).toHaveLength(1);
          
          // All tinygo hashes should be identical
          const uniqueTinygoHashes = [...new Set(tinygoHashes)];
          expect(uniqueTinygoHashes).toHaveLength(1);
          
          // Rust and TinyGo hashes should match
          expect(uniqueRustHashes[0]).toBe(uniqueTinygoHashes[0]);
        }
      });

      // Validate performance data quality
      Object.keys(benchmarkResults.tasks).forEach(task => {
        Object.keys(benchmarkResults.tasks[task]).forEach(language => {
          const times = benchmarkResults.tasks[task][language].executionTimes;
          if (times.length > 0) {
            const mean = times.reduce((sum, t) => sum + t, 0) / times.length;
            const variance = times.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / times.length;
            const coefficientOfVariation = Math.sqrt(variance) / mean;
            
            // Coefficient of variation should be < 30% as per strategy
            expect(coefficientOfVariation).toBeLessThan(global.validationRules.executionTime.variationCoeff);
          }
        });
      });

      await page.close();
    }, 300000); // 5 minute timeout for full benchmark

    test('should generate comprehensive performance report', async () => {
      page = await browser.newPage();
      await page.goto('http://localhost:3001/bench.html', { waitUntil: 'networkidle0' });
      
      // Execute smoke test for rapid report generation
      const testData = testDataGen.generateTestConfigs().smoke;
      
      const performanceReport = await page.evaluate(async (smokeConfigs) => {
        const report = {
          metadata: {
            timestamp: new Date().toISOString(),
            browserInfo: {
              userAgent: navigator.userAgent,
              platform: navigator.platform,
              language: navigator.language,
              memory: performance.memory ? {
                limit: performance.memory.jsHeapSizeLimit,
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize
              } : null
            },
            testConfiguration: 'smoke'
          },
          results: {},
          analysis: {}
        };

        const tasks = ['mandelbrot', 'json_parse'];
        const languages = ['rust', 'tinygo'];
        
        for (const task of tasks) {
          report.results[task] = {};
          
          for (const language of languages) {
            const startTime = performance.now();
            const result = await window.runTask(task, language, smokeConfigs[task]);
            const endTime = performance.now();
            
            report.results[task][language] = {
              success: result.success,
              executionTime: result.executionTime,
              wallClockTime: endTime - startTime,
              memoryUsed: result.memoryUsed,
              resultHash: result.resultHash,
              timestamp: new Date().toISOString()
            };
          }
        }
        
        // Generate performance analysis
        report.analysis = {
          crossLanguageConsistency: {},
          performanceComparisons: {},
          qualityMetrics: {}
        };
        
        Object.keys(report.results).forEach(task => {
          const rust = report.results[task].rust;
          const tinygo = report.results[task].tinygo;
          
          if (rust.success && tinygo.success) {
            report.analysis.crossLanguageConsistency[task] = {
              hashMatch: rust.resultHash === tinygo.resultHash,
              rustHash: rust.resultHash,
              tinygoHash: tinygo.resultHash
            };
            
            report.analysis.performanceComparisons[task] = {
              rustTime: rust.executionTime,
              tinygoTime: tinygo.executionTime,
              speedupRatio: tinygo.executionTime / rust.executionTime,
              fasterLanguage: rust.executionTime < tinygo.executionTime ? 'rust' : 'tinygo'
            };
          }
        });
        
        return report;
      }, testData);

      // Validate report structure
      expect(performanceReport.metadata).toBeDefined();
      expect(performanceReport.results).toBeDefined();
      expect(performanceReport.analysis).toBeDefined();
      
      // Validate metadata completeness
      expect(performanceReport.metadata.timestamp).toBeDefined();
      expect(performanceReport.metadata.browserInfo.userAgent).toBeDefined();
      
      // Validate results for each task
      Object.keys(performanceReport.results).forEach(task => {
        expect(performanceReport.results[task].rust).toBeDefined();
        expect(performanceReport.results[task].tinygo).toBeDefined();
        
        if (performanceReport.results[task].rust.success) {
          expect(performanceReport.results[task].rust.executionTime).toBeGreaterThan(0);
          expect(performanceReport.results[task].rust.resultHash).toBeDefined();
        }
        
        if (performanceReport.results[task].tinygo.success) {
          expect(performanceReport.results[task].tinygo.executionTime).toBeGreaterThan(0);
          expect(performanceReport.results[task].tinygo.resultHash).toBeDefined();
        }
      });

      // Save performance report
      const reportPath = path.join(global.testTempDir, 'performance-report.json');
      await fs.writeFile(reportPath, JSON.stringify(performanceReport, null, 2));
      
      // Validate file was created
      const fileExists = await fs.access(reportPath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      await page.close();
    });
  });

  describe('Statistical Validation and Power Analysis', () => {
    test('should validate experimental design meets statistical requirements', async () => {
      page = await browser.newPage();
      await page.goto('http://localhost:3001/bench.html', { waitUntil: 'networkidle0' });
      
      const sampleSize = 20;
      const testData = testDataGen.generateScaledDataset('mandelbrot', 'small');
      
      // Collect performance data for power analysis
      const performanceData = await page.evaluate(async (config) => {
        const rustTimes = [];
        const tinygoTimes = [];
        
        for (let i = 0; i < config.sampleSize; i++) {
          const rustResult = await window.runTask('mandelbrot', 'rust', config.testData);
          const tinygoResult = await window.runTask('mandelbrot', 'tinygo', config.testData);
          
          if (rustResult.success) rustTimes.push(rustResult.executionTime);
          if (tinygoResult.success) tinygoTimes.push(tinygoResult.executionTime);
          
          // Brief pause to prevent throttling
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        return { rust: rustTimes, tinygo: tinygoTimes };
      }, { sampleSize, testData });

      // Perform statistical power analysis
      const powerAnalysisResult = powerAnalysis.validateCurrentDesign(performanceData, 0.2);
      
      expect(powerAnalysisResult.observedEffectSize).toBeDefined();
      expect(powerAnalysisResult.currentPower).toBeDefined();
      expect(powerAnalysisResult.statisticalSignificance).toBeDefined();
      
      // Log results for scientific validation
      console.log('Statistical Power Analysis Results:');
      console.log(`- Observed Effect Size: ${powerAnalysisResult.observedEffectSize.toFixed(3)}`);
      console.log(`- Current Power: ${(powerAnalysisResult.currentPower * 100).toFixed(1)}%`);
      console.log(`- Sample Size: ${performanceData.rust.length}`);
      console.log(`- Recommendation: ${powerAnalysisResult.recommendation}`);
      console.log(`- Effect Interpretation: ${powerAnalysisResult.interpretation}`);
      
      // Validate statistical significance
      const significance = powerAnalysisResult.statisticalSignificance;
      expect(significance.pValue).toBeDefined();
      expect(significance.tStatistic).toBeDefined();
      expect(significance.meanDifference).toBeDefined();
      
      if (significance.isSignificant) {
        console.log(`- Statistically significant difference detected (p=${significance.pValue.toFixed(4)})`);
        console.log(`- Mean difference: ${significance.meanDifference.toFixed(2)}ms (${significance.meanDifferencePercent.toFixed(1)}%)`);
      }

      await page.close();
    }, 120000); // 2 minute timeout for statistical analysis
  });

  describe('System Integration and Environment Validation', () => {
    test('should validate system meets experimental requirements', async () => {
      page = await browser.newPage();
      await page.goto('http://localhost:3001/bench.html', { waitUntil: 'networkidle0' });
      
      const systemValidation = await page.evaluate(async () => {
        const validation = {
          webassemblySupport: {
            supported: typeof WebAssembly !== 'undefined',
            instantiateSupported: typeof WebAssembly.instantiate === 'function',
            memorySupported: typeof WebAssembly.Memory === 'function'
          },
          performanceAPIs: {
            performanceNow: typeof performance !== 'undefined' && typeof performance.now === 'function',
            performanceMemory: typeof performance !== 'undefined' && typeof performance.memory === 'object',
            highResTimeStamp: performance && performance.now && performance.now() > 0
          },
          browserCapabilities: {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            cookieEnabled: navigator.cookieEnabled,
            onLine: navigator.onLine,
            language: navigator.language
          },
          memoryInfo: performance.memory ? {
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            memoryPressure: performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit
          } : null
        };
        
        // Test WebAssembly functionality
        try {
          const wasmModule = new Uint8Array([
            0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
            0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f,
            0x03, 0x02, 0x01, 0x00, 0x07, 0x07, 0x01, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00,
            0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b
          ]);
          
          const wasmInstance = await WebAssembly.instantiate(wasmModule);
          const addFunction = wasmInstance.instance.exports.add;
          const testResult = addFunction(2, 3);
          
          validation.webassemblySupport.functionalTest = {
            success: testResult === 5,
            result: testResult
          };
        } catch (error) {
          validation.webassemblySupport.functionalTest = {
            success: false,
            error: error.message
          };
        }
        
        return validation;
      });

      // Validate WebAssembly support
      expect(systemValidation.webassemblySupport.supported).toBe(true);
      expect(systemValidation.webassemblySupport.instantiateSupported).toBe(true);
      expect(systemValidation.webassemblySupport.memorySupported).toBe(true);
      expect(systemValidation.webassemblySupport.functionalTest.success).toBe(true);
      
      // Validate Performance APIs
      expect(systemValidation.performanceAPIs.performanceNow).toBe(true);
      expect(systemValidation.performanceAPIs.highResTimeStamp).toBe(true);
      
      // Validate Memory Conditions
      if (systemValidation.memoryInfo) {
        expect(systemValidation.memoryInfo.memoryPressure).toBeLessThan(0.8); // <80% memory usage
        expect(systemValidation.memoryInfo.jsHeapSizeLimit).toBeGreaterThan(100 * 1024 * 1024); // >100MB limit
      }
      
      console.log('System Validation Results:');
      console.log(`- WebAssembly Support: ${systemValidation.webassemblySupport.supported ? 'Yes' : 'No'}`);
      console.log(`- Performance APIs: ${systemValidation.performanceAPIs.performanceNow ? 'Available' : 'Missing'}`);
      console.log(`- Platform: ${systemValidation.browserCapabilities.platform}`);
      console.log(`- User Agent: ${systemValidation.browserCapabilities.userAgent}`);
      
      if (systemValidation.memoryInfo) {
        console.log(`- Memory Limit: ${(systemValidation.memoryInfo.jsHeapSizeLimit / (1024*1024)).toFixed(0)}MB`);
        console.log(`- Memory Usage: ${(systemValidation.memoryInfo.memoryPressure * 100).toFixed(1)}%`);
      }

      await page.close();
    });
  });
});