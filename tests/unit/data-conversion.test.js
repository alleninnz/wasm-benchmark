// Unit tests for data conversion and transformation functions
// Focus: Data format conversions, serialization, type transformations

import { describe, test, expect, beforeEach, vi } from 'vitest';
import DeterministicTestDataGenerator from '../utils/test-data-generator.js';

// Mock browser APIs for testing data conversions
global.performance = {
  now: vi.fn(() => Date.now())
};

// Mock CSV serialization functions for testing
function serializeToCSV(data) {
  if (!Array.isArray(data) || data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header] || '';
        const stringValue = String(value);
        // Escape special characters
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(',')
    )
  ];
  
  return csvContent.join('\n');
}

function deserializeFromCSV(csvString) {
  if (!csvString.trim()) return [];
  
  const results = [];
  let headers = [];
  let currentRecord = [];
  let currentField = '';
  let inQuotes = false;
  let recordIndex = 0;
  
  for (let i = 0; i < csvString.length; i++) {
    const char = csvString[i];
    const nextChar = csvString[i + 1];
    
    if (char === '"' && !inQuotes) {
      inQuotes = true;
    } else if (char === '"' && inQuotes && nextChar === '"') {
      currentField += '"';
      i++; // Skip next quote
    } else if (char === '"' && inQuotes) {
      inQuotes = false;
    } else if (char === ',' && !inQuotes) {
      currentRecord.push(currentField);
      currentField = '';
    } else if (char === '\n' && !inQuotes) {
      currentRecord.push(currentField);
      
      if (recordIndex === 0) {
        headers = currentRecord.slice();
      } else {
        const row = {};
        headers.forEach((header, index) => {
          row[header.trim()] = currentRecord[index] || '';
        });
        results.push(row);
      }
      
      currentRecord = [];
      currentField = '';
      recordIndex++;
    } else {
      currentField += char;
    }
  }
  
  // Handle last field if no trailing newline
  if (currentField || currentRecord.length > 0) {
    currentRecord.push(currentField);
    if (recordIndex > 0) {
      const row = {};
      headers.forEach((header, index) => {
        row[header.trim()] = currentRecord[index] || '';
      });
      results.push(row);
    }
  }
  
  return results;
}

function convertYamlToJson(yamlConfig) {
  const converted = JSON.parse(JSON.stringify(yamlConfig));
  
  // Convert environment snake_case to camelCase
  if (converted.environment) {
    const env = converted.environment;
    if (env.warmup_runs !== undefined) {
      env.warmupRuns = env.warmup_runs;
      delete env.warmup_runs;
    }
    if (env.measure_runs !== undefined) {
      env.measureRuns = env.measure_runs;
      delete env.measure_runs;
    }
    if (env.timeout_ms !== undefined) {
      env.timeout = env.timeout_ms;
      delete env.timeout_ms;
    }
    if (env.gc_threshold_mb !== undefined) {
      env.gcThreshold = env.gc_threshold_mb;
      delete env.gc_threshold_mb;
    }
  }
  
  return converted;
}

describe('Data Conversion Functions', () => {
  let testDataGen;

  beforeEach(() => {
    testDataGen = new DeterministicTestDataGenerator(12345);
  });

  describe('YAML to JSON Configuration Conversion', () => {
    test('should convert YAML-style config to JSON format', () => {
      const yamlStyleConfig = {
        experiment: { name: 'Test', version: '1.0' },
        environment: {
          warmup_runs: 5,
          measure_runs: 100,
          timeout_ms: 300000,
          gc_threshold_mb: 10
        },
        tasks: {
          mandelbrot: { enabled: true },
          json_parse: { enabled: false }
        }
      };

      const converted = convertYamlToJson(yamlStyleConfig);

      expect(converted.environment.warmupRuns).toBe(5);
      expect(converted.environment.measureRuns).toBe(100);
      expect(converted.environment.timeout).toBe(300000);
      expect(converted.environment.gcThreshold).toBe(10);
    });

    test('should handle snake_case to camelCase conversion', () => {
      const snakeCaseData = {
        user_name: 'test_user',
        creation_date: '2024-01-01',
        is_active: true,
        nested_object: {
          sub_field: 'value',
          another_field: 42
        }
      };

      const converted = convertSnakeToCamel(snakeCaseData);

      expect(converted.userName).toBe('test_user');
      expect(converted.creationDate).toBe('2024-01-01');
      expect(converted.isActive).toBe(true);
      expect(converted.nestedObject.subField).toBe('value');
      expect(converted.nestedObject.anotherField).toBe(42);
    });
  });

  describe('Performance Data Transformation', () => {
    test('should normalize performance measurements', () => {
      const rawMeasurements = [
        { task: 'mandelbrot', language: 'rust', time: 10.5, memory: 1024000 },
        { task: 'mandelbrot', language: 'tinygo', time: 12.3, memory: 1536000 },
        { task: 'json_parse', language: 'rust', time: 5.2, memory: 512000 }
      ];

      const normalized = normalizeMeasurements(rawMeasurements);

      expect(normalized).toHaveLength(3);
      expect(normalized[0].time).toBe(10.5);
      expect(normalized[0].memoryMB).toBeCloseTo(1.0, 1); // 1024000 bytes ≈ 1MB
      expect(normalized[1].memoryMB).toBeCloseTo(1.5, 1); // 1536000 bytes ≈ 1.5MB
    });

    test('should aggregate measurements by task and language', () => {
      const measurements = [
        { task: 'mandelbrot', language: 'rust', time: 10 },
        { task: 'mandelbrot', language: 'rust', time: 12 },
        { task: 'mandelbrot', language: 'tinygo', time: 15 },
        { task: 'mandelbrot', language: 'tinygo', time: 18 }
      ];

      const aggregated = aggregateByTaskAndLanguage(measurements);

      expect(aggregated.mandelbrot.rust.mean).toBe(11);
      expect(aggregated.mandelbrot.rust.count).toBe(2);
      expect(aggregated.mandelbrot.tinygo.mean).toBe(16.5);
      expect(aggregated.mandelbrot.tinygo.count).toBe(2);
    });

    test('should calculate statistical summaries', () => {
      const data = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28];
      const summary = calculateStatisticalSummary(data);

      expect(summary.mean).toBe(19);
      expect(summary.median).toBe(19);
      expect(summary.min).toBe(10);
      expect(summary.max).toBe(28);
      expect(summary.count).toBe(10);
      expect(summary.standardDeviation).toBeCloseTo(6.055, 2);
    });

    test('should detect and flag outliers', () => {
      const normalData = [10, 11, 12, 13, 14];
      const dataWithOutlier = [...normalData, 100]; // Clear outlier

      const normalResult = detectOutliers(normalData);
      const outlierResult = detectOutliers(dataWithOutlier);

      expect(normalResult.outliers).toHaveLength(0);
      expect(outlierResult.outliers).toHaveLength(1);
      expect(outlierResult.outliers[0]).toBe(100);
    });
  });

  describe('JSON Data Generation and Parsing', () => {
    test('should generate valid JSON with deterministic structure', () => {
      const jsonData = testDataGen.generateScaledDataset('json_parse', 'small');
      const jsonString = JSON.stringify(jsonData);

      expect(() => JSON.parse(jsonString)).not.toThrow();
      
      const parsed = JSON.parse(jsonString);
      expect(parsed.data).toHaveLength(100);
      expect(parsed.metadata.count).toBe(100);
    });

    test('should handle nested JSON structures correctly', () => {
      const jsonData = testDataGen.generateScaledDataset('json_parse', 'micro');
      const record = jsonData.data[0];

      expect(record.nested.level1.level2.value).toBeDefined();
      expect(typeof record.nested.level1.level2.value).toBe('number');
    });

    test('should validate JSON schema compliance', () => {
      const jsonData = testDataGen.generateScaledDataset('json_parse', 'micro');
      const isValid = validateJsonSchema(jsonData, jsonData.expectedProperties);

      expect(isValid.valid).toBe(true);
      expect(isValid.errors).toHaveLength(0);
    });

    test('should detect schema violations', () => {
      const validData = { data: [{ id: 1, name: 'test', age: 25 }] };
      const invalidData = { data: [{ id: 1, name: 'test' }] }; // Missing age
      
      const schema = {
        requiredFields: ['id', 'name', 'age'],
        dataTypes: { id: 'number', name: 'string', age: 'number' }
      };

      const validResult = validateJsonSchema(validData, schema);
      const invalidResult = validateJsonSchema(invalidData, schema);

      expect(validResult.valid).toBe(true);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors).toContain('Missing required field: age');
    });
  });

  describe('Matrix Data Conversion', () => {
    test('should convert flat arrays to 2D matrices', () => {
      const flatArray = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      const matrix = convertFlatToMatrix(flatArray, 3, 3);

      expect(matrix).toHaveLength(3);
      expect(matrix[0]).toEqual([1, 2, 3]);
      expect(matrix[1]).toEqual([4, 5, 6]);
      expect(matrix[2]).toEqual([7, 8, 9]);
    });

    test('should convert 2D matrices to flat arrays', () => {
      const matrix = [[1, 2], [3, 4], [5, 6]];
      const flat = convertMatrixToFlat(matrix);

      expect(flat).toEqual([1, 2, 3, 4, 5, 6]);
    });

    test('should validate matrix dimensions', () => {
      const validMatrix = [[1, 2], [3, 4]]; // 2x2
      const invalidMatrix = [[1, 2], [3]];   // Irregular

      expect(validateMatrixDimensions(validMatrix)).toBe(true);
      expect(validateMatrixDimensions(invalidMatrix)).toBe(false);
    });
  });

  describe('Performance Data Serialization', () => {
    test('should serialize benchmark results to CSV format', () => {
      const results = [
        { task: 'mandelbrot', language: 'rust', time: 10.5, memory: 1024 },
        { task: 'json_parse', language: 'tinygo', time: 8.2, memory: 512 }
      ];

      const csv = serializeToCSV(results);
      const lines = csv.split('\n');

      expect(lines[0]).toBe('task,language,time,memory');
      expect(lines[1]).toBe('mandelbrot,rust,10.5,1024');
      expect(lines[2]).toBe('json_parse,tinygo,8.2,512');
    });

    test('should deserialize CSV data correctly', () => {
      const csv = 'task,language,time\nmandelbrot,rust,10.5\njson_parse,tinygo,8.2';
      const results = deserializeFromCSV(csv);

      expect(results).toHaveLength(2);
      expect(results[0].task).toBe('mandelbrot');
      expect(results[0].language).toBe('rust');
      expect(results[0].time).toBe('10.5'); // CSV values are strings
    });

    test('should handle special characters in CSV data', () => {
      const dataWithSpecialChars = [
        { name: 'Test, with comma', description: 'Has "quotes" and\nnewlines' }
      ];

      const csv = serializeToCSV(dataWithSpecialChars);
      const deserialized = deserializeFromCSV(csv);

      expect(deserialized[0].name).toBe('Test, with comma');
      expect(deserialized[0].description).toBe('Has "quotes" and\nnewlines');
    });
  });

  describe('Type Conversion and Validation', () => {
    test('should convert string numbers to appropriate types', () => {
      const stringData = {
        integerValue: '42',
        floatValue: '3.14159',
        booleanTrue: 'true',
        booleanFalse: 'false',
        stringValue: 'hello'
      };

      const converted = convertStringTypes(stringData);

      expect(converted.integerValue).toBe(42);
      expect(converted.floatValue).toBeCloseTo(3.14159, 5);
      expect(converted.booleanTrue).toBe(true);
      expect(converted.booleanFalse).toBe(false);
      expect(converted.stringValue).toBe('hello');
    });

    test('should validate data types match expected schema', () => {
      const data = { id: 1, name: 'test', active: true, score: 95.5 };
      const schema = {
        id: 'number',
        name: 'string',
        active: 'boolean',
        score: 'number'
      };

      const validation = validateTypes(data, schema);
      expect(validation.valid).toBe(true);
    });

    test('should detect type mismatches', () => {
      const data = { id: '1', name: 'test', active: 'yes' }; // Wrong types
      const schema = { id: 'number', name: 'string', active: 'boolean' };

      const validation = validateTypes(data, schema);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('id: expected number, got string');
      expect(validation.errors).toContain('active: expected boolean, got string');
    });
  });
});

function convertSnakeToCamel(obj) {
  const converted = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    converted[camelKey] = typeof value === 'object' && value !== null 
      ? convertSnakeToCamel(value) 
      : value;
  }
  return converted;
}

function normalizeMeasurements(measurements) {
  return measurements.map(m => ({
    ...m,
    memoryMB: m.memory / (1024 * 1024)
  }));
}

function aggregateByTaskAndLanguage(measurements) {
  const result = {};
  
  measurements.forEach(m => {
    if (!result[m.task]) result[m.task] = {};
    if (!result[m.task][m.language]) result[m.task][m.language] = [];
    result[m.task][m.language].push(m.time);
  });
  
  // Calculate means
  Object.keys(result).forEach(task => {
    Object.keys(result[task]).forEach(lang => {
      const times = result[task][lang];
      result[task][lang] = {
        mean: times.reduce((sum, t) => sum + t, 0) / times.length,
        count: times.length
      };
    });
  });
  
  return result;
}

function calculateStatisticalSummary(data) {
  const sorted = [...data].sort((a, b) => a - b);
  const sum = data.reduce((s, v) => s + v, 0);
  const mean = sum / data.length;
  const variance = data.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (data.length - 1);
  
  return {
    mean,
    median: data.length % 2 === 0 
      ? (sorted[data.length/2 - 1] + sorted[data.length/2]) / 2
      : sorted[Math.floor(data.length/2)],
    min: Math.min(...data),
    max: Math.max(...data),
    count: data.length,
    standardDeviation: Math.sqrt(variance)
  };
}

function detectOutliers(data) {
  const sorted = [...data].sort((a, b) => a - b);
  const q1Index = Math.floor(sorted.length * 0.25);
  const q3Index = Math.floor(sorted.length * 0.75);
  const q1 = sorted[q1Index];
  const q3 = sorted[q3Index];
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;
  
  return {
    outliers: data.filter(v => v < lowerBound || v > upperBound),
    lowerBound,
    upperBound
  };
}

function validateJsonSchema(data, schema) {
  const errors = [];
  
  if (data.data && schema.requiredFields) {
    data.data.forEach((record, index) => {
      schema.requiredFields.forEach(field => {
        if (!(field in record)) {
          errors.push(`Missing required field: ${field}`);
        }
      });
    });
  }
  
  return { valid: errors.length === 0, errors };
}

function convertFlatToMatrix(flat, rows, cols) {
  const matrix = [];
  for (let i = 0; i < rows; i++) {
    matrix[i] = flat.slice(i * cols, (i + 1) * cols);
  }
  return matrix;
}

function convertMatrixToFlat(matrix) {
  return matrix.flat();
}

function validateMatrixDimensions(matrix) {
  if (matrix.length === 0) return false;
  const expectedCols = matrix[0].length;
  return matrix.every(row => row.length === expectedCols);
}


function convertStringTypes(data) {
  const result = {};
  
  Object.entries(data).forEach(([key, value]) => {
    if (typeof value === 'string') {
      if (value === 'true') result[key] = true;
      else if (value === 'false') result[key] = false;
      else if (!isNaN(value) && !isNaN(parseFloat(value))) {
        result[key] = value.includes('.') ? parseFloat(value) : parseInt(value);
      }
      else result[key] = value;
    } else {
      result[key] = value;
    }
  });
  
  return result;
}

function validateTypes(data, schema) {
  const errors = [];
  
  Object.entries(schema).forEach(([field, expectedType]) => {
    const actualType = typeof data[field];
    if (actualType !== expectedType) {
      errors.push(`${field}: expected ${expectedType}, got ${actualType}`);
    }
  });
  
  return { valid: errors.length === 0, errors };
}