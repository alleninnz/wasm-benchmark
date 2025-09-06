// Integration tests for parallel execution and concurrency control
// Focus: Validates concurrent benchmark execution and resource management

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import puppeteer from 'puppeteer';
import DeterministicTestDataGenerator from '../utils/test-data-generator.js';

describe('Parallel Execution and Concurrency Control', () => {
  let browser;
  let page;
  let testDataGen;

  beforeEach(async () => {
    testDataGen = new DeterministicTestDataGenerator(54321);
    
    browser = await puppeteer.launch({
      ...global.testBrowserConfig,
      args: [
        ...global.testBrowserConfig.args,
        '--max-concurrent-tasks=4',
        '--disable-background-timer-throttling'
      ]
    });
    
    page = await browser.newPage();
    
    // Increase memory limit for parallel tests
    await page.setDefaultTimeout(60000);
    await page.goto('http://localhost:3001/bench.html', { 
      waitUntil: 'networkidle0' 
    });
  });

  afterEach(async () => {
    if (browser) {
      await browser.close();
    }
  });

  describe('Concurrent Task Execution', () => {
    test('should execute multiple tasks in parallel without interference', async () => {
      const tasks = ['mandelbrot', 'json_parse'];
      const languages = ['rust', 'tinygo'];
      const testDataSets = {
        mandelbrot: testDataGen.generateScaledDataset('mandelbrot', 'micro'),
        json_parse: testDataGen.generateScaledDataset('json_parse', 'micro')
      };

      const startTime = Date.now();

      // Execute all task-language combinations concurrently
      const results = await page.evaluate(async (config) => {
        const promises = [];
        const startTimes = {};
        
        config.tasks.forEach(task => {
          config.languages.forEach(language => {
            const key = `${task}_${language}`;
            startTimes[key] = performance.now();
            
            promises.push(
              window.runTask(task, language, config.testData[task])
                .then(result => ({
                  task,
                  language,
                  startTime: startTimes[key],
                  endTime: performance.now(),
                  ...result
                }))
            );
          });
        });
        
        return await Promise.all(promises);
      }, { tasks, languages, testData: testDataSets });

      const totalTime = Date.now() - startTime;

      // Validate all tasks completed successfully
      expect(results).toHaveLength(4); // 2 tasks × 2 languages
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.executionTime).toBeGreaterThan(0);
        expect(result.resultHash).toBeDefined();
      });

      // Validate cross-language consistency despite parallel execution
      const mandelbrotResults = results.filter(r => r.task === 'mandelbrot');
      const jsonResults = results.filter(r => r.task === 'json_parse');
      
      expect(mandelbrotResults[0].resultHash).toBe(mandelbrotResults[1].resultHash);
      expect(jsonResults[0].resultHash).toBe(jsonResults[1].resultHash);

      // Parallel execution should be faster than sequential
      console.log(`Parallel execution completed in ${totalTime}ms`);
      expect(totalTime).toBeLessThan(30000); // Should complete within 30 seconds
    });

    test('should handle concurrent execution with different data scales', async () => {
      const testConfigs = [
        { task: 'mandelbrot', language: 'rust', scale: 'micro' },
        { task: 'mandelbrot', language: 'tinygo', scale: 'small' },
        { task: 'json_parse', language: 'rust', scale: 'micro' },
        { task: 'json_parse', language: 'tinygo', scale: 'small' }
      ];

      const testDataSets = testConfigs.reduce((acc, config) => {
        const key = `${config.task}_${config.scale}`;
        if (!acc[key]) {
          acc[key] = testDataGen.generateScaledDataset(config.task, config.scale);
        }
        return acc;
      }, {});

      const results = await page.evaluate(async (configs) => {
        const promises = configs.map(async (config) => {
          const dataKey = `${config.task}_${config.scale}`;
          const testData = configs.testDataSets[dataKey];
          
          const result = await window.runTask(config.task, config.language, testData);
          return { ...config, ...result };
        });
        
        return await Promise.all(promises);
      }, { ...testConfigs, testDataSets });

      // All executions should succeed despite different scales
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.resultHash).toBeDefined();
      });

      // Larger scale tasks should take longer
      const microResults = results.filter(r => r.scale === 'micro');
      const smallResults = results.filter(r => r.scale === 'small');
      
      microResults.forEach(microResult => {
        const correspondingSmall = smallResults.find(s => 
          s.task === microResult.task && s.language === microResult.language
        );
        if (correspondingSmall) {
          expect(correspondingSmall.executionTime).toBeGreaterThan(microResult.executionTime);
        }
      });
    });
  });

  describe('Resource Management and Throttling', () => {
    test('should manage memory usage effectively during parallel execution', async () => {
      const concurrentTasks = 4;
      const testData = testDataGen.generateScaledDataset('matrix_mul', 'small');

      // Monitor memory usage throughout parallel execution
      const memoryStats = await page.evaluate(async (config) => {
        const memorySnapshots = [];
        
        // Capture initial memory state
        if (performance.memory) {
          memorySnapshots.push({
            phase: 'initial',
            used: performance.memory.usedJSHeapSize,
            total: performance.memory.totalJSHeapSize
          });
        }

        // Execute multiple concurrent tasks
        const promises = [];
        for (let i = 0; i < config.concurrentTasks; i++) {
          promises.push(
            window.runTask('matrix_mul', 'rust', config.testData)
              .then(result => {
                // Capture memory after each task completion
                if (performance.memory) {
                  memorySnapshots.push({
                    phase: `task_${i}_complete`,
                    used: performance.memory.usedJSHeapSize,
                    total: performance.memory.totalJSHeapSize
                  });
                }
                return result;
              })
          );
        }
        
        const results = await Promise.all(promises);
        
        // Capture final memory state
        if (performance.memory) {
          memorySnapshots.push({
            phase: 'final',
            used: performance.memory.usedJSHeapSize,
            total: performance.memory.totalJSHeapSize
          });
        }
        
        return { results, memorySnapshots };
      }, { concurrentTasks, testData });

      // Validate all tasks completed successfully
      memoryStats.results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // Validate memory usage stayed within bounds
      if (memoryStats.memorySnapshots.length > 0) {
        const maxMemoryUsed = Math.max(...memoryStats.memorySnapshots.map(s => s.used));
        expect(maxMemoryUsed).toBeLessThan(global.validationRules.memoryUsage.max);

        // Memory should not grow unbounded
        const initialMemory = memoryStats.memorySnapshots[0].used;
        const finalMemory = memoryStats.memorySnapshots[memoryStats.memorySnapshots.length - 1].used;
        const memoryGrowth = (finalMemory - initialMemory) / initialMemory;
        
        expect(memoryGrowth).toBeLessThan(2.0); // Memory should not more than double
      }
    });

    test('should implement proper task queuing when exceeding concurrency limits', async () => {
      const maxConcurrency = 2;
      const totalTasks = 6;
      const testData = testDataGen.generateScaledDataset('json_parse', 'micro');

      // Configure concurrency limits
      await page.evaluate((limit) => {
        window.setMaxConcurrency(limit);
      }, maxConcurrency);

      const executionLog = await page.evaluate(async (config) => {
        const log = [];
        const promises = [];
        
        // Submit more tasks than concurrency limit
        for (let i = 0; i < config.totalTasks; i++) {
          const taskPromise = window.runTask('json_parse', 'rust', config.testData)
            .then(result => {
              log.push({
                taskId: i,
                completionTime: performance.now(),
                success: result.success,
                executionTime: result.executionTime
              });
              return result;
            });
          
          promises.push(taskPromise);
        }
        
        await Promise.all(promises);
        return log.sort((a, b) => a.completionTime - b.completionTime);
      }, { totalTasks, testData });

      // All tasks should complete successfully
      expect(executionLog).toHaveLength(totalTasks);
      executionLog.forEach(entry => {
        expect(entry.success).toBe(true);
      });

      // Tasks should complete in waves based on concurrency limit
      // First 'maxConcurrency' tasks should complete first
      const completionTimes = executionLog.map(e => e.completionTime);
      const firstWave = completionTimes.slice(0, maxConcurrency);
      const laterTasks = completionTimes.slice(maxConcurrency);

      if (laterTasks.length > 0) {
        const firstWaveMax = Math.max(...firstWave);
        const laterTasksMin = Math.min(...laterTasks);
        
        // Later tasks should start after first wave completes
        expect(laterTasksMin).toBeGreaterThanOrEqual(firstWaveMax);
      }
    });

    test('should handle CPU throttling gracefully', async () => {
      // Simulate CPU-intensive workload
      const intensiveConfig = testDataGen.generateScaledDataset('mandelbrot', 'medium');
      intensiveConfig.maxIter = 1000; // Very computationally intensive

      const concurrentTasks = 3;
      const startTime = Date.now();

      const results = await page.evaluate(async (config) => {
        const promises = [];
        const taskMetrics = [];
        
        for (let i = 0; i < config.concurrentTasks; i++) {
          const taskStart = performance.now();
          
          promises.push(
            window.runTask('mandelbrot', 'rust', config.testData)
              .then(result => {
                taskMetrics.push({
                  taskId: i,
                  executionTime: result.executionTime,
                  wallClockTime: performance.now() - taskStart,
                  success: result.success
                });
                return result;
              })
          );
        }
        
        await Promise.all(promises);
        return taskMetrics;
      }, { concurrentTasks, testData: intensiveConfig });

      const totalTime = Date.now() - startTime;

      // All tasks should complete despite CPU intensity
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.executionTime).toBeGreaterThan(0);
      });

      // Should complete within reasonable time even under CPU load
      expect(totalTime).toBeLessThan(180000); // 3 minutes max for intensive tasks

      // Wall clock time might be longer than execution time due to concurrency
      results.forEach(result => {
        expect(result.wallClockTime).toBeGreaterThanOrEqual(result.executionTime);
      });
    });
  });

  describe('Concurrent Data Collection and Aggregation', () => {
    test('should collect and aggregate results from parallel executions correctly', async () => {
      const testMatrix = {
        tasks: ['mandelbrot', 'json_parse'],
        languages: ['rust', 'tinygo'],
        runs: 3
      };

      const testDataSets = {
        mandelbrot: testDataGen.generateScaledDataset('mandelbrot', 'micro'),
        json_parse: testDataGen.generateScaledDataset('json_parse', 'micro')
      };

      const aggregatedResults = await page.evaluate(async (config) => {
        const allResults = [];
        const promises = [];
        
        // Generate all task-language-run combinations
        config.tasks.forEach(task => {
          config.languages.forEach(language => {
            for (let run = 0; run < config.runs; run++) {
              promises.push(
                window.runTask(task, language, config.testDataSets[task])
                  .then(result => ({
                    task,
                    language,
                    run,
                    ...result
                  }))
              );
            }
          });
        });
        
        const results = await Promise.all(promises);
        
        // Aggregate results by task and language
        const aggregated = {};
        results.forEach(result => {
          const key = `${result.task}_${result.language}`;
          if (!aggregated[key]) {
            aggregated[key] = {
              task: result.task,
              language: result.language,
              runs: [],
              hashes: [],
              executionTimes: []
            };
          }
          
          aggregated[key].runs.push(result.run);
          aggregated[key].hashes.push(result.resultHash);
          aggregated[key].executionTimes.push(result.executionTime);
        });
        
        return { individual: results, aggregated };
      }, { ...testMatrix, testDataSets });

      // Validate individual results
      expect(aggregatedResults.individual).toHaveLength(
        testMatrix.tasks.length * testMatrix.languages.length * testMatrix.runs
      );
      
      aggregatedResults.individual.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.task).toBeDefined();
        expect(result.language).toBeDefined();
        expect(result.run).toBeGreaterThanOrEqual(0);
      });

      // Validate aggregated data
      Object.values(aggregatedResults.aggregated).forEach(aggregated => {
        expect(aggregated.runs).toHaveLength(testMatrix.runs);
        expect(aggregated.hashes).toHaveLength(testMatrix.runs);
        expect(aggregated.executionTimes).toHaveLength(testMatrix.runs);
        
        // All hashes for same task-language should be identical
        const uniqueHashes = [...new Set(aggregated.hashes)];
        expect(uniqueHashes).toHaveLength(1);
        
        // Execution times should be reasonable
        aggregated.executionTimes.forEach(time => {
          expect(time).toBeGreaterThan(0);
          expect(time).toBeLessThan(30000);
        });
      });
    });

    test('should maintain result ordering and traceability in concurrent execution', async () => {
      const taskCount = 8;
      const testData = testDataGen.generateScaledDataset('json_parse', 'micro');

      const results = await page.evaluate(async (config) => {
        const taskPromises = [];
        
        // Create tasks with unique identifiers
        for (let i = 0; i < config.taskCount; i++) {
          const taskId = `task_${i}_${Math.random().toString(36).substr(2, 9)}`;
          
          taskPromises.push(
            window.runTask('json_parse', 'rust', {
              ...config.testData,
              metadata: { ...config.testData.metadata, taskId }
            }).then(result => ({
              originalTaskId: taskId,
              submissionIndex: i,
              completionTime: performance.now(),
              ...result
            }))
          );
        }
        
        return await Promise.all(taskPromises);
      }, { taskCount, testData });

      // All results should be traceable to their original submission
      expect(results).toHaveLength(taskCount);
      
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.originalTaskId).toBeDefined();
        expect(result.submissionIndex).toBeDefined();
        expect(result.completionTime).toBeGreaterThan(0);
      });

      // Each task should have unique identifier
      const taskIds = results.map(r => r.originalTaskId);
      const uniqueTaskIds = [...new Set(taskIds)];
      expect(uniqueTaskIds).toHaveLength(taskCount);

      // Submission indices should be preserved
      const submissionIndices = results.map(r => r.submissionIndex).sort((a, b) => a - b);
      expect(submissionIndices).toEqual(Array.from({ length: taskCount }, (_, i) => i));
    });
  });

  describe('Error Handling in Concurrent Environment', () => {
    test('should handle partial failures in parallel execution gracefully', async () => {
      const testConfigs = [
        { task: 'mandelbrot', language: 'rust', data: testDataGen.generateScaledDataset('mandelbrot', 'micro') },
        { task: 'invalid_task', language: 'rust', data: {} }, // This should fail
        { task: 'json_parse', language: 'tinygo', data: testDataGen.generateScaledDataset('json_parse', 'micro') },
        { task: 'mandelbrot', language: 'rust', data: { invalid: 'data' } } // This might fail
      ];

      const results = await page.evaluate(async (configs) => {
        const promises = configs.map(async (config, index) => {
          try {
            const result = await window.runTask(config.task, config.language, config.data);
            return { index, success: true, ...result };
          } catch (error) {
            return { 
              index, 
              success: false, 
              error: error.message,
              task: config.task,
              language: config.language 
            };
          }
        });
        
        return await Promise.all(promises);
      }, testConfigs);

      expect(results).toHaveLength(testConfigs.length);

      // Some tasks should succeed, some should fail
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      expect(successful.length).toBeGreaterThan(0);
      expect(failed.length).toBeGreaterThan(0);

      // Successful tasks should have valid results
      successful.forEach(result => {
        expect(result.resultHash).toBeDefined();
        expect(result.executionTime).toBeGreaterThan(0);
      });

      // Failed tasks should have error information
      failed.forEach(result => {
        expect(result.error).toBeDefined();
        expect(result.task).toBeDefined();
        expect(result.language).toBeDefined();
      });
    });

    test('should prevent resource exhaustion from concurrent task failures', async () => {
      const failingTaskCount = 10;
      
      // Create configuration that will likely cause resource issues
      const problematicConfig = {
        task: 'matrix_mul',
        language: 'rust',
        data: {
          size: 10000, // Very large matrix
          matrixA: Array(10000).fill().map(() => Array(10000).fill(1)),
          matrixB: Array(10000).fill().map(() => Array(10000).fill(1))
        }
      };

      const results = await page.evaluate(async (config) => {
        const promises = [];
        const startTime = performance.now();
        
        for (let i = 0; i < config.failingTaskCount; i++) {
          promises.push(
            window.runTask(config.problematicConfig.task, config.problematicConfig.language, config.problematicConfig.data)
              .then(result => ({ taskId: i, success: true, ...result }))
              .catch(error => ({ taskId: i, success: false, error: error.message }))
          );
        }
        
        const results = await Promise.all(promises);
        const endTime = performance.now();
        
        return { 
          results, 
          totalTime: endTime - startTime,
          memoryInfo: performance.memory ? {
            used: performance.memory.usedJSHeapSize,
            total: performance.memory.totalJSHeapSize
          } : null
        };
      }, { failingTaskCount, problematicConfig });

      // System should remain responsive
      expect(results.totalTime).toBeLessThan(300000); // Should not hang indefinitely

      // Memory should not be exhausted
      if (results.memoryInfo) {
        expect(results.memoryInfo.used).toBeLessThan(results.memoryInfo.total * 0.95);
      }

      // Should handle failures gracefully
      results.results.forEach(result => {
        expect(result.taskId).toBeDefined();
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });
    });
  });
});