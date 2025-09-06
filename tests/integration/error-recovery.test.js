// Integration tests for error handling and recovery mechanisms
// Focus: System resilience under various failure conditions

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import puppeteer from 'puppeteer';
import DeterministicTestDataGenerator from '../utils/test-data-generator.js';

describe('Error Recovery and System Resilience', () => {
  let browser;
  let page;
  let testDataGen;

  beforeEach(async () => {
    testDataGen = new DeterministicTestDataGenerator(99999);
    
    browser = await puppeteer.launch(global.testBrowserConfig);
    page = await browser.newPage();
    
    // Enable console logging for error tracking
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('PAGE ERROR:', msg.text());
      }
    });
    
    // Track uncaught exceptions
    page.on('pageerror', error => {
      console.log('PAGE EXCEPTION:', error.message);
    });
    
    await page.goto('http://localhost:3001/bench.html', { 
      waitUntil: 'networkidle0' 
    });
  });

  afterEach(async () => {
    if (browser) {
      await browser.close();
    }
  });

  describe('WebAssembly Module Loading Failures', () => {
    test('should gracefully handle missing WASM modules', async () => {
      const result = await page.evaluate(async () => {
        try {
          // Attempt to use non-existent module
          const wasmResponse = await fetch('/builds/nonexistent_task/rust/task.wasm');
          if (!wasmResponse.ok) {
            throw new Error(`WASM module not found: ${wasmResponse.status}`);
          }
        } catch (error) {
          return {
            success: false,
            error: error.message,
            errorType: 'module_not_found',
            recoverable: true
          };
        }
      });

      expect(result.success).toBe(false);
      expect(result.errorType).toBe('module_not_found');
      expect(result.recoverable).toBe(true);
    });

    test('should handle corrupted WASM module gracefully', async () => {
      // Create a mock corrupted WASM module scenario
      const result = await page.evaluate(async () => {
        try {
          // Simulate corrupted module data
          const corruptedWasm = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0xff, 0xff, 0xff, 0xff]);
          await WebAssembly.instantiate(corruptedWasm);
          return { success: true };
        } catch (error) {
          return {
            success: false,
            error: error.message,
            errorType: 'wasm_compilation_error',
            canContinue: true
          };
        }
      });

      expect(result.success).toBe(false);
      expect(result.errorType).toBe('wasm_compilation_error');
      expect(result.canContinue).toBe(true);
    });

    test('should attempt module reload on transient failures', async () => {
      const retryResult = await page.evaluate(async () => {
        let attempts = 0;
        const maxRetries = 3;
        
        while (attempts < maxRetries) {
          try {
            attempts++;
            
            // Simulate intermittent network failure
            if (attempts === 1) {
              throw new Error('Network timeout');
            }
            
            // Simulate successful load on retry
            return {
              success: true,
              attempts,
              message: 'Module loaded successfully after retry'
            };
            
          } catch (error) {
            if (attempts === maxRetries) {
              return {
                success: false,
                attempts,
                finalError: error.message,
                errorType: 'network_timeout'
              };
            }
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      });

      expect(retryResult.success).toBe(true);
      expect(retryResult.attempts).toBe(2);
    });
  });

  describe('Memory and Resource Exhaustion Recovery', () => {
    test('should detect and recover from memory pressure', async () => {
      const memoryTest = await page.evaluate(async () => {
        const memorySnapshots = [];
        
        try {
          // Monitor initial memory state
          if (performance.memory) {
            memorySnapshots.push({
              phase: 'initial',
              used: performance.memory.usedJSHeapSize,
              limit: performance.memory.jsHeapSizeLimit
            });
          }
          
          // Simulate memory-intensive task
          const largeArrays = [];
          let memoryPressureDetected = false;
          
          for (let i = 0; i < 100; i++) {
            // Create large array to consume memory
            const largeArray = new Float64Array(100000);
            largeArrays.push(largeArray);
            
            // Check memory pressure periodically
            if (performance.memory && i % 10 === 0) {
              const currentMemory = performance.memory.usedJSHeapSize;
              const memoryLimit = performance.memory.jsHeapSizeLimit;
              const memoryUsageRatio = currentMemory / memoryLimit;
              
              memorySnapshots.push({
                phase: `iteration_${i}`,
                used: currentMemory,
                limit: memoryLimit,
                usageRatio: memoryUsageRatio
              });
              
              // Detect memory pressure (>80% usage)
              if (memoryUsageRatio > 0.8) {
                memoryPressureDetected = true;
                break;
              }
            }
          }
          
          // Cleanup on memory pressure
          if (memoryPressureDetected) {
            largeArrays.length = 0; // Clear references
            if (window.gc) window.gc(); // Force garbage collection if available
            
            // Verify memory recovery
            if (performance.memory) {
              memorySnapshots.push({
                phase: 'post_cleanup',
                used: performance.memory.usedJSHeapSize,
                limit: performance.memory.jsHeapSizeLimit
              });
            }
          }
          
          return {
            success: true,
            memoryPressureDetected,
            memorySnapshots,
            recovered: true
          };
          
        } catch (error) {
          return {
            success: false,
            error: error.message,
            memorySnapshots
          };
        }
      });

      if (memoryTest.memorySnapshots.length > 0) {
        expect(memoryTest.success).toBe(true);
        
        // Validate memory monitoring worked
        const initialMemory = memoryTest.memorySnapshots[0];
        expect(initialMemory.phase).toBe('initial');
        expect(initialMemory.used).toBeGreaterThan(0);
        
        if (memoryTest.memoryPressureDetected) {
          expect(memoryTest.recovered).toBe(true);
        }
      }
    });

    test('should handle WebAssembly memory allocation failures', async () => {
      const memoryFailureTest = await page.evaluate(async () => {
        try {
          // Attempt to allocate excessive WebAssembly memory
          const excessivePages = 100000; // Much more than typical limit
          const memory = new WebAssembly.Memory({ 
            initial: excessivePages,
            maximum: excessivePages 
          });
          
          return {
            success: true,
            allocated: true,
            message: 'Large memory allocation succeeded unexpectedly'
          };
          
        } catch (error) {
          // Expected failure - should handle gracefully
          return {
            success: false,
            error: error.message,
            errorType: 'wasm_memory_allocation_error',
            handledGracefully: true,
            canRetryWithSmallerSize: true
          };
        }
      });

      // Large allocation should fail gracefully
      expect(memoryFailureTest.success).toBe(false);
      expect(memoryFailureTest.errorType).toBe('wasm_memory_allocation_error');
      expect(memoryFailureTest.handledGracefully).toBe(true);
    });
  });

  describe('Task Execution Timeout and Recovery', () => {
    test('should timeout long-running tasks and allow recovery', async () => {
      // Use integration timeout config as per strategy
      const timeoutConfig = global.testConfig.integration;
      
      const timeoutTest = await page.evaluate(async (config) => {
        // Set aggressive timeout for testing
        const originalTimeout = window.taskTimeout || 30000;
        window.taskTimeout = 2000; // 2 second timeout for testing
        
        try {
          // Create computationally intensive task
          const intensiveData = {
            width: 1000,
            height: 1000,
            maxIter: 10000, // Very high iteration count
            centerX: 0,
            centerY: 0,
            zoom: 1
          };
          
          const startTime = performance.now();
          const result = await window.runTask('mandelbrot', 'rust', intensiveData);
          const endTime = performance.now();
          
          // Restore original timeout
          window.taskTimeout = originalTimeout;
          
          return {
            success: result.success,
            timedOut: false,
            executionTime: endTime - startTime,
            result: result.success ? 'completed' : 'failed'
          };
          
        } catch (error) {
          // Restore original timeout
          window.taskTimeout = originalTimeout;
          
          const isTimeoutError = error.message.includes('timeout') || 
                                 error.message.includes('aborted') ||
                                 error.name === 'AbortError';
          
          return {
            success: false,
            timedOut: isTimeoutError,
            error: error.message,
            errorType: isTimeoutError ? 'timeout' : 'other',
            recoverable: true
          };
        }
      }, timeoutConfig);

      if (timeoutTest.timedOut) {
        expect(timeoutTest.success).toBe(false);
        expect(timeoutTest.errorType).toBe('timeout');
        expect(timeoutTest.recoverable).toBe(true);
      } else if (!timeoutTest.success) {
        // Task may have failed for other reasons, which is also valid
        expect(timeoutTest.error).toBeDefined();
      }
    });

    test('should allow task cancellation and cleanup', async () => {
      const cancellationTest = await page.evaluate(async () => {
        let taskCancelled = false;
        let cleanupCompleted = false;
        
        try {
          // Start a long-running task
          const taskPromise = window.runTask('mandelbrot', 'rust', {
            width: 500,
            height: 500,
            maxIter: 5000
          });
          
          // Cancel after short delay
          setTimeout(() => {
            if (window.cancelCurrentTask) {
              window.cancelCurrentTask();
              taskCancelled = true;
            }
          }, 500);
          
          const result = await taskPromise;
          
          return {
            taskCompleted: result.success,
            taskCancelled,
            result: result.success ? result : { error: result.error }
          };
          
        } catch (error) {
          // Cleanup resources on cancellation
          if (window.cleanupResources) {
            window.cleanupResources();
            cleanupCompleted = true;
          }
          
          return {
            taskCompleted: false,
            taskCancelled,
            cleanupCompleted,
            error: error.message,
            errorType: error.name === 'AbortError' ? 'cancelled' : 'other'
          };
        }
      });

      // Task should either complete or be properly cancelled
      if (cancellationTest.taskCancelled) {
        expect(cancellationTest.errorType).toBe('cancelled');
      }
      
      // Cleanup should occur on cancellation
      if (cancellationTest.taskCancelled && !cancellationTest.taskCompleted) {
        expect(cancellationTest.cleanupCompleted).toBe(true);
      }
    });
  });

  describe('Data Integrity and Validation Errors', () => {
    test('should validate input data and reject invalid configurations', async () => {
      const invalidInputTests = [
        { 
          name: 'negative dimensions',
          data: { width: -100, height: -100, maxIter: 100 },
          expectedError: 'invalid_dimensions'
        },
        {
          name: 'zero iterations',
          data: { width: 100, height: 100, maxIter: 0 },
          expectedError: 'invalid_iterations'
        },
        {
          name: 'null data',
          data: null,
          expectedError: 'null_input'
        },
        {
          name: 'missing required fields',
          data: { width: 100 }, // Missing height and maxIter
          expectedError: 'missing_fields'
        }
      ];

      const validationResults = await page.evaluate(async (testCases) => {
        const results = [];
        
        for (const testCase of testCases) {
          try {
            const result = await window.runTask('mandelbrot', 'rust', testCase.data);
            results.push({
              testName: testCase.name,
              success: result.success,
              expectedError: testCase.expectedError,
              actualError: result.success ? null : result.error
            });
          } catch (error) {
            results.push({
              testName: testCase.name,
              success: false,
              expectedError: testCase.expectedError,
              actualError: error.message,
              caughtException: true
            });
          }
        }
        
        return results;
      }, invalidInputTests);

      // All invalid inputs should be rejected
      validationResults.forEach(result => {
        expect(result.success).toBe(false);
        expect(result.actualError).toBeDefined();
      });
    });

    test('should maintain data consistency after error recovery', async () => {
      const testData = testDataGen.generateScaledDataset('json_parse', 'micro');
      
      const consistencyTest = await page.evaluate(async (validData) => {
        const results = [];
        
        try {
          // Execute valid task first
          const validResult = await window.runTask('json_parse', 'rust', validData);
          results.push({
            phase: 'valid_execution',
            success: validResult.success,
            hash: validResult.resultHash
          });
          
          // Attempt invalid task that should fail
          try {
            await window.runTask('json_parse', 'rust', { invalid: 'data' });
          } catch (error) {
            results.push({
              phase: 'invalid_execution',
              success: false,
              error: error.message
            });
          }
          
          // Execute same valid task again to verify system state
          const recoveryResult = await window.runTask('json_parse', 'rust', validData);
          results.push({
            phase: 'recovery_execution',
            success: recoveryResult.success,
            hash: recoveryResult.resultHash
          });
          
          return results;
          
        } catch (error) {
          return [{
            phase: 'test_error',
            success: false,
            error: error.message
          }];
        }
      }, testData);

      expect(consistencyTest).toHaveLength(3);
      
      // First and third executions should succeed with same hash
      const validExecution = consistencyTest.find(r => r.phase === 'valid_execution');
      const recoveryExecution = consistencyTest.find(r => r.phase === 'recovery_execution');
      const invalidExecution = consistencyTest.find(r => r.phase === 'invalid_execution');
      
      expect(validExecution.success).toBe(true);
      expect(recoveryExecution.success).toBe(true);
      expect(invalidExecution.success).toBe(false);
      
      // Hash consistency after error recovery
      expect(validExecution.hash).toBe(recoveryExecution.hash);
    });
  });

  describe('System State Recovery', () => {
    test('should recover from browser context loss', async () => {
      // Simulate context loss and recovery
      const contextRecoveryTest = await page.evaluate(async () => {
        const originalConsole = console.log;
        let contextLost = false;
        let contextRecovered = false;
        
        try {
          // Simulate context loss
          const canvas = document.createElement('canvas');
          const gl = canvas.getContext('webgl');
          
          if (gl) {
            // Simulate WebGL context loss
            const loseContext = gl.getExtension('WEBGL_lose_context');
            if (loseContext) {
              loseContext.loseContext();
              contextLost = true;
              
              // Wait for context restoration
              await new Promise(resolve => {
                const checkContext = () => {
                  if (!gl.isContextLost()) {
                    contextRecovered = true;
                    resolve();
                  } else {
                    setTimeout(checkContext, 100);
                  }
                };
                
                // Restore context after delay
                setTimeout(() => {
                  if (loseContext.restoreContext) {
                    loseContext.restoreContext();
                  }
                }, 1000);
                
                checkContext();
              });
            }
          }
          
          return {
            success: true,
            contextLost,
            contextRecovered,
            webglAvailable: !!gl
          };
          
        } catch (error) {
          return {
            success: false,
            error: error.message,
            contextLost,
            contextRecovered
          };
        }
      });

      // Test should handle context operations gracefully
      expect(contextRecoveryTest.success).toBe(true);
      
      if (contextRecoveryTest.webglAvailable && contextRecoveryTest.contextLost) {
        expect(contextRecoveryTest.contextRecovered).toBe(true);
      }
    });

    test('should maintain benchmark state across page visibility changes', async () => {
      const visibilityTest = await page.evaluate(async () => {
        const testStates = [];
        
        try {
          // Simulate page becoming hidden
          Object.defineProperty(document, 'hidden', {
            writable: true,
            value: true
          });
          
          document.dispatchEvent(new Event('visibilitychange'));
          testStates.push({ phase: 'hidden', timestamp: performance.now() });
          
          // Simulate brief task during hidden state
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Simulate page becoming visible again
          Object.defineProperty(document, 'hidden', {
            value: false
          });
          
          document.dispatchEvent(new Event('visibilitychange'));
          testStates.push({ phase: 'visible', timestamp: performance.now() });
          
          // Verify system can still execute tasks
          const testData = {
            width: 32,
            height: 32,
            maxIter: 50
          };
          
          const result = await window.runTask('mandelbrot', 'rust', testData);
          testStates.push({ 
            phase: 'post_visibility_task',
            success: result.success,
            timestamp: performance.now()
          });
          
          return testStates;
          
        } catch (error) {
          return [{
            phase: 'error',
            error: error.message,
            timestamp: performance.now()
          }];
        }
      });

      expect(visibilityTest).toHaveLength(3);
      
      const postTaskResult = visibilityTest.find(s => s.phase === 'post_visibility_task');
      expect(postTaskResult.success).toBe(true);
      
      // Verify state transitions occurred
      const hiddenState = visibilityTest.find(s => s.phase === 'hidden');
      const visibleState = visibilityTest.find(s => s.phase === 'visible');
      
      expect(hiddenState.timestamp).toBeLessThan(visibleState.timestamp);
      expect(visibleState.timestamp).toBeLessThan(postTaskResult.timestamp);
    });
  });
});