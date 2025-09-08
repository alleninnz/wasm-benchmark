// Deterministic test data generator for WebAssembly performance experiments
// Based on testing strategy requirements for reproducible cross-language validation

class XorShift32 {
  constructor(seed = 12345) {
    this.state = seed;
  }
  
  next() {
    this.state ^= this.state << 13;
    this.state ^= this.state >>> 17;
    this.state ^= this.state << 5;
    return (this.state >>> 0) / 0x100000000; // Convert to [0, 1)
  }
  
  nextInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  
  nextFloat(min, max) {
    return this.next() * (max - min) + min;
  }
}

export class DeterministicTestDataGenerator {
  constructor(seed = 12345) {
    // Input validation
    if (typeof seed !== 'number' || seed < 0 || seed > 0xFFFFFFFF || !Number.isInteger(seed)) {
      throw new Error('DeterministicTestDataGenerator: seed must be a positive integer within 32-bit range');
    }

    // Constants for validation and limits
    this.MIN_RECORDS = 1;
    this.MAX_RECORDS = 1000000;
    this.MIN_SIZE = 1;
    this.MAX_SIZE = 4096;
    this.MIN_ITERATIONS = 1;
    this.MAX_ITERATIONS = 100000;
    this.VALID_SCALES = ['micro', 'small', 'medium', 'large'];
    this.VALID_TASKS = ['mandelbrot', 'json_parse', 'matrix_mul'];

    this.rng = new XorShift32(seed);
    this.scaleConfigs = {
      micro: { records: 10, size: 64, iterations: 100 },   // Minimal scale for unit tests
      small: { records: 100, size: 64, iterations: 200 },  // Small scale for quick tests  
      medium: { records: 1000, size: 256, iterations: 500 },
      large: { records: 50000, size: 1024, iterations: 2000 }
    };

    // Validate scale configurations
    this._validateScaleConfigs();
  }

  /**
   * Validate scale configurations for safety
   * @private
   */
  _validateScaleConfigs() {
    for (const [scale, config] of Object.entries(this.scaleConfigs)) {
      if (!this.VALID_SCALES.includes(scale)) {
        throw new Error(`Invalid scale: ${scale}`);
      }
      
      if (typeof config.records !== 'number' || 
          config.records < this.MIN_RECORDS || 
          config.records > this.MAX_RECORDS) {
        throw new Error(`Scale ${scale}: records must be between ${this.MIN_RECORDS} and ${this.MAX_RECORDS}`);
      }
      
      if (typeof config.size !== 'number' || 
          config.size < this.MIN_SIZE || 
          config.size > this.MAX_SIZE) {
        throw new Error(`Scale ${scale}: size must be between ${this.MIN_SIZE} and ${this.MAX_SIZE}`);
      }
      
      if (typeof config.iterations !== 'number' || 
          config.iterations < this.MIN_ITERATIONS || 
          config.iterations > this.MAX_ITERATIONS) {
        throw new Error(`Scale ${scale}: iterations must be between ${this.MIN_ITERATIONS} and ${this.MAX_ITERATIONS}`);
      }
    }
  }
  
  generateScaledDataset(task, scale, options = {}) {
    // Input validation
    if (typeof task !== 'string' || !this.VALID_TASKS.includes(task)) {
      throw new Error(`generateScaledDataset: invalid task "${task}". Valid tasks: ${this.VALID_TASKS.join(', ')}`);
    }
    
    if (typeof scale !== 'string' || !this.VALID_SCALES.includes(scale)) {
      throw new Error(`generateScaledDataset: invalid scale "${scale}". Valid scales: ${this.VALID_SCALES.join(', ')}`);
    }
    
    if (options && typeof options !== 'object') {
      throw new Error('generateScaledDataset: options must be an object or undefined');
    }

    try {
      const config = { ...this.scaleConfigs[scale], ...options };
      
      // Validate merged configuration
      this._validateGeneratorConfig(config);
      
      return this.generators[task](config);
    } catch (error) {
      throw new Error(`generateScaledDataset: failed to generate ${task} data for ${scale} scale - ${error.message}`);
    }
  }

  /**
   * Validate generator configuration
   * @private
   */
  _validateGeneratorConfig(config) {
    if (typeof config.records !== 'number' || 
        config.records < this.MIN_RECORDS || 
        config.records > this.MAX_RECORDS) {
      throw new Error(`records must be between ${this.MIN_RECORDS} and ${this.MAX_RECORDS}`);
    }
    
    if (typeof config.size !== 'number' || 
        config.size < this.MIN_SIZE || 
        config.size > this.MAX_SIZE) {
      throw new Error(`size must be between ${this.MIN_SIZE} and ${this.MAX_SIZE}`);
    }
    
    if (typeof config.iterations !== 'number' || 
        config.iterations < this.MIN_ITERATIONS || 
        config.iterations > this.MAX_ITERATIONS) {
      throw new Error(`iterations must be between ${this.MIN_ITERATIONS} and ${this.MAX_ITERATIONS}`);
    }
  }
  
  generators = {
    mandelbrot: (config) => this.generateMandelbrotParams(config),
    json_parse: (config) => this.generateJsonData(config),
    matrix_mul: (config) => this.generateMatrixData(config)
  };
  
  generateMandelbrotParams(config) {
    return {
      width: config.size,
      height: config.size,
      maxIter: config.iterations,
      centerX: this.rng.nextFloat(-2, 1),
      centerY: this.rng.nextFloat(-1, 1),
      zoom: this.rng.nextFloat(0.5, 2.0),
      // Generate expected hash for cross-language validation
      expectedProperties: {
        totalPixels: config.size * config.size,
        iterationBounds: [1, config.iterations]
      }
    };
  }
  
  generateJsonData(config) {
    const records = [];
    for (let i = 0; i < config.records; i++) {
      records.push({
        id: i,
        name: `user_${i}`,
        age: this.rng.nextInt(18, 80),
        active: this.rng.next() > 0.5,
        balance: parseFloat(this.rng.nextFloat(0, 10000).toFixed(2)),
        tags: this.generateTags(),
        nested: {
          level1: {
            level2: {
              value: this.rng.nextInt(1, 1000)
            }
          }
        }
      });
    }
    
    return {
      metadata: {
        version: '1.0',
        generated: new Date(2024, 0, 1).toISOString(), // Fixed date for reproducibility
        count: records.length
      },
      data: records,
      // Expected validation data
      expectedProperties: {
        recordCount: config.records,
        requiredFields: ['id', 'name', 'age', 'active', 'balance'],
        dataTypes: {
          id: 'number',
          name: 'string',
          age: 'number',
          active: 'boolean',
          balance: 'number'
        }
      }
    };
  }
  
  generateTags() {
    const tagCount = this.rng.nextInt(1, 5);
    const possibleTags = ['premium', 'basic', 'student', 'enterprise', 'trial', 'vip'];
    const tags = [];
    for (let i = 0; i < tagCount; i++) {
      const tag = possibleTags[this.rng.nextInt(0, possibleTags.length - 1)];
      if (!tags.includes(tag)) {
        tags.push(tag);
      }
    }
    return tags;
  }
  
  generateMatrixData(config) {
    const size = config.size;
    const matrixA = [];
    const matrixB = [];
    
    // Generate deterministic matrices
    for (let i = 0; i < size; i++) {
      matrixA[i] = [];
      matrixB[i] = [];
      for (let j = 0; j < size; j++) {
        matrixA[i][j] = this.rng.nextFloat(-100, 100);
        matrixB[i][j] = this.rng.nextFloat(-100, 100);
      }
    }
    
    return {
      matrixA,
      matrixB,
      size,
      expectedProperties: {
        dimensions: [size, size],
        valueRange: [-100, 100],
        resultDimensions: [size, size]
      }
    };
  }
  
  // Cross-language hash validation helper
  generateValidationHash(data) {
    // Simple hash function for cross-language validation
    // Using string representation to ensure consistency
    const str = JSON.stringify(data, (key, val) => {
      // Round numbers to avoid floating point precision issues
      return typeof val === 'number' ? Math.round(val * 1000) / 1000 : val;
    });
    
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }
  
  // Generate test configurations based on strategy scales
  generateTestConfigs() {
    return {
      smoke: {
        mandelbrot: this.generateScaledDataset('mandelbrot', 'micro'),
        json_parse: this.generateScaledDataset('json_parse', 'micro'),
        matrix_mul: this.generateScaledDataset('matrix_mul', 'micro')
      },
      integration: {
        mandelbrot: this.generateScaledDataset('mandelbrot', 'small'),
        json_parse: this.generateScaledDataset('json_parse', 'small'),
        matrix_mul: this.generateScaledDataset('matrix_mul', 'small')
      },
      stress: {
        mandelbrot: this.generateScaledDataset('mandelbrot', 'medium'),
        json_parse: this.generateScaledDataset('json_parse', 'medium'),
        matrix_mul: this.generateScaledDataset('matrix_mul', 'medium')
      }
    };
  }
}

export default DeterministicTestDataGenerator;