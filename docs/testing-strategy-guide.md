# Testing Strategy Guide for WebAssembly Performance Experiment

## 📋 Strategic Questions & Answers

### **Testing Strategy Direction**

**Q: Preferred balance between granular unit tests with mocking and integration-heavy tests that validate real service interactions?**

**A: Integration-heavy tests (80%) + Selective unit tests (20%)**

**理由:**
- 实验核心价值在于测量**真实 WebAssembly 运行时性能**
- Mock 会破坏实验的科学性和有效性
- 集成测试能验证完整的数据采集链路：`Browser → WebAssembly → Performance Measurement → Data Collection`
- 单元测试仅用于纯逻辑函数（统计计算、数据转换、配置解析）

---

**Q: How important is test execution speed vs comprehensive coverage?**

**A: 分层平衡 - 快速验证 + 全面覆盖**

**策略:**
- **快速集成测试** (< 30s): 最小规模配置验证核心流程
- **全面覆盖测试** (< 5min): 所有任务×语言组合的完整验证  
- **压力测试** (可选): 大规模数据验证系统稳定性

**平衡点:**
```javascript
const testConfigs = {
  smoke: { scales: ['micro'], runs: 3 },    // 30秒快速验证
  integration: { scales: ['small'], runs: 10 }, // 3分钟全面测试
  stress: { scales: ['medium'], runs: 50 }   // 完整规模验证
};
```

---

**Q: Should tests focus on contract validation (ensuring interfaces work) or behavior validation (ensuring business logic works)?**

**A: 行为验证为主 + 关键契约验证**

**重点:**
- **行为验证**: 验证跨语言哈希一致性、性能测量准确性、数据质量控制
- **契约验证**: 仅对服务接口的输入输出格式进行验证
- **科学验证**: 确保实验结果的可重现性和统计有效性

---

### **Mock vs Real Dependencies**

**Q: For browser testing: Mock Puppeteer or use real browser instances?**

**A: 使用真实 Puppeteer + 真实浏览器实例**

**原因:**
- WebAssembly 性能高度依赖浏览器引擎的实现
- `performance.now()` 的精度和 V8 的 WebAssembly 优化无法模拟
- 实验价值就在于测量真实浏览器环境中的性能差异

**配置优化:**
```javascript
const testBrowserConfig = {
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  timeout: 30000 // 测试环境缩短超时
};
```

---

**Q: For file operations: Mock filesystem or use temporary directories?**

**A: 使用临时目录**

**实现:**
```javascript
// 每个测试套件使用独立临时目录
beforeEach(async () => {
  testTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wasm-bench-test-'));
});

afterEach(async () => {
  await fs.rm(testTempDir, { recursive: true, force: true });
});
```

**优势:**
- 真实的文件 I/O 性能特征
- 测试隔离性强
- 便于调试时查看实际文件内容

---

**Q: For configuration: Mock configs or test with real config files?**

**A: 分层配置策略**

**测试配置文件:**
```javascript
// configs/test-minimal.json - 快速验证用
{
  "tasks": ["mandelbrot"],
  "languages": ["rust"],
  "scales": ["micro"],
  "environment": { "warmupRuns": 1, "measureRuns": 3 }
}

// configs/test-cross-lang.json - 跨语言验证用  
{
  "tasks": ["mandelbrot", "json_parse"],
  "languages": ["rust", "tinygo"],
  "scales": ["small"],
  "environment": { "warmupRuns": 2, "measureRuns": 5 }
}
```

---

### **Test Data Strategy**

**Q: Should tests use fixed test fixtures or generated test data?**

**A: 确定性固定数据**

**策略:**
```javascript
// 使用固定种子确保可重现性
const testDataGenerator = {
  mandelbrot: { 
    seed: 12345,
    width: 64, height: 64, maxIter: 100 
  },
  jsonParse: {
    seed: 67890,
    records: 100,
    schema: 'fixed' // 固定字段结构
  }
};
```

**原因:**
- 确保测试结果可重现
- 便于跨语言结果对比验证
- 符合实验对确定性的要求

---

**Q: How should we handle benchmark result validation - exact matching or range validation?**

**A: 分类验证策略**

**验证规则:**
```javascript
const validationRules = {
  // 算法正确性 - 精确匹配
  hashConsistency: {
    rust_hash: tinygo_hash, // 必须完全相等
    tolerance: 0
  },
  
  // 性能指标 - 范围验证
  executionTime: {
    min: 0.1, // 最小合理执行时间
    max: 30000, // 测试环境最大超时
    variationCoeff: 0.3 // 变异系数 < 30%
  },
  
  // 内存使用 - 范围验证
  memoryUsage: {
    min: 0,
    max: 100 * 1024 * 1024, // 100MB 上限
    growth: 'bounded' // 内存增长受控
  }
};
```

---

**Q: Recommended approach to testing async/timeout scenarios?**

**A: 分级超时 + 优雅降级测试**

**测试策略:**
```javascript
describe('异步和超时场景', () => {
  it('正常超时范围内完成', async () => {
    const result = await runBenchmark({ timeout: 30000 });
    expect(result.success).toBe(true);
  });
  
  it('超时后优雅降级', async () => {
    const result = await runBenchmark({ timeout: 100 }); // 极短超时
    expect(result.summary.failedTasks).toBeGreaterThan(0);
    expect(result.summary.failureReasons).toContain('timeout');
  });
  
  it('并发控制有效', async () => {
    const startTime = Date.now();
    const result = await runBenchmark({ 
      parallel: true, 
      maxParallel: 2,
      timeout: 45000 
    });
    const duration = Date.now() - startTime;
    
    // 验证并发确实提升了效率
    expect(duration).toBeLessThan(60000);
    expect(result.summary.successRate).toBeGreaterThan(0.8);
  });
});
```

---


## 🔧 Strategic Refinement Analysis

### **Testing Infrastructure 深度分析**


#### **Test Data Generator 工具设计**

**必需性：这是实验可重现性的关键基础设施**

**核心设计：**
```javascript
// utils/test-data-generator.js
class DeterministicTestDataGenerator {
  constructor(seed = 12345) {
    this.rng = new XorShift32(seed);
  }
  
  generateScaledDataset(task, scale, options = {}) {
    const scaleConfigs = {
      micro: { records: 10, size: 16, iterations: 5 },
      small: { records: 100, size: 64, iterations: 50 },
      medium: { records: 1000, size: 256, iterations: 500 },
      // 保持与实验计划中的规模一致
      large: { records: 50000, size: 1024, iterations: 2000 }
    };
    
    return this.generators[task](scaleConfigs[scale], options);
  }
  
  // 支持跨语言验证的确定性数据生成
  generators = {
    mandelbrot: (config) => this.generateMandelbrotParams(config),
    json_parse: (config) => this.generateJsonData(config),
    matrix_mul: (config) => this.generateMatrixData(config)
  };
}
```

**价值分析：**
- ✅ **跨环境一致性** - 开发与测试环境使用相同数据
- ✅ **规模可控性** - 快速生成不同规模的测试数据
- ✅ **哈希验证支持** - 确保跨语言实现的算法正确性验证
- ✅ **实验设计灵活性** - 支持添加新的测试场景

### **Scientific Validation 核心组件**

#### **Statistical Power Analysis 实施**

**重要性：确保实验科学严谨性的关键**ßßß

**核心问题解决：**
- 当前计划每个条件收集 100 个样本，但该样本量是否足以检测出具有实际意义的性能差异？
- 如果 Rust 比 TinyGo 快 10%，现有测试设计能否以 80% 的统计功效检测出该差异？

**实施方案：**
```javascript
// utils/statistical-power.js
class PowerAnalysis {
  calculateRequiredSampleSize(expectedEffectSize, alpha = 0.05, power = 0.8) {
    // 基于 Cohen's d 效应量计算
    // 使用 Welch's t-test 的样本量公式
    const za = this.getZScore(alpha/2);  // 双尾检验
    const zb = this.getZScore(1 - power);
    
    // 简化公式：n ≈ 2 * ((za + zb) / d)^2
    const n = 2 * Math.pow((za + zb) / expectedEffectSize, 2);
    return Math.ceil(n);
  }
  
  validateCurrentDesign(pilotData) {
    // 基于预试验数据评估当前设计的统计效力
    const observedEffect = this.calculateEffectSize(pilotData);
    const currentPower = this.calculatePower(
      pilotData.sampleSize, 
      observedEffect, 
      0.05
    );
    
    return {
      observedEffectSize: observedEffect,
      currentPower: currentPower,
      recommendation: currentPower >= 0.8 ? 'sufficient' : 'increase_sample_size',
      suggestedSampleSize: currentPower < 0.8 ? 
        this.calculateRequiredSampleSize(observedEffect) : null
    };
  }
}
```

**实际应用价值：**
- 避免"花费大量时间收集数据，最后发现样本量不足以得出可靠结论"
- 为实验设计提供科学依据
- 增强研究结果在学术界的可信度

#### **Environment Control 分层策略**

**实验环境控制策略（精确测量优先）：**
```javascript
const experimentConfig = {
  systemChecks: {
    cpuUsage: { max: 20, monitoring_duration: 30 },
    memoryUsage: { max: 80, available_gb: 12 },
    thermalState: 'normal',
    powerState: 'plugged_in',
    backgroundProcesses: 'minimized'
  },
  
  preTestActions: [
    'closeUnnecessaryApps',
    'disableSpotlight',
    'setHighPerformanceMode',
    'clearSystemCaches',
    'ensureThermalStability'
  ],
  
  continuousMonitoring: {
    systemLoad: true,
    thermalThrottling: true,
    memoryPressure: true,
    abortOnAnomalies: true
  }
};
```

**监控实施示例：**
```javascript
// utils/system-monitor.js
class ExperimentEnvironmentMonitor {
  async validateExperimentConditions() {
    const checks = await Promise.all([
      this.checkCPULoad(),
      this.checkMemoryAvailability(), 
      this.checkThermalState(),
      this.checkPowerState()
    ]);
    
    const failed = checks.filter(check => !check.passed);
    if (failed.length > 0) {
      throw new Error(`实验环境不符合要求: ${failed.map(f => f.reason).join(', ')}`);
    }
    
    return { ready: true, baseline: this.captureBaseline() };
  }
}
```

### **Implementation Priority Matrix**

**优先级分析：**

1. **🔥 高优先级** - Test Data Generator
   - 这是实验可重现性的基础
   - 直接影响跨语言验证的可靠性
   - 实施复杂度：中等

2. **🔥 高优先级** - Statistical Power Analysis  
   - 保证实验设计的科学性
   - 预试验阶段就应该实施
   - 实施复杂度：中等

3. **⚡ 中高优先级** - Environment Control for Experiments
   - 直接影响性能测量的准确性
   - 实施复杂度：高

   - 支持持续开发，但不影响核心实验
   - 实施复杂度：低

### **Execution Roadmap**

**Phase 1：Scientific Foundation (Week 1-2)**
- 实施 Test Data Generator
- 添加 Statistical Power Analysis
- 验证基础的跨语言一致性

**Phase 2：Measurement Precision (Week 3)**  
- 实施实验环境监控和控制
- 优化性能测量的准确性
- 建立测量基线

**Phase 3：Development Infrastructure (Week 4)**
- 建立持续验证机制
- 文档与内部使用指南

这些精进措施将显著提升WebAssembly 性能实验的科学严谨性和可信度，特别是 **Test Data Generator** 和 **Statistical Power Analysis**，它们是确保实验结果具有学术价值的关键基础设施。


## 🎯 综合建议

### **推荐测试架构**

```
tests/
├── unit/                           # 20% - 纯逻辑测试
│   ├── statistics.test.js         # 统计计算函数
│   ├── data-conversion.test.js    # 数据格式转换
│   └── config-parser.test.js      # 配置解析逻辑
│
├── integration/                    # 70% - 服务协调测试
│   ├── experiment-pipeline.test.js # 完整实验流程
│   ├── cross-language.test.js     # 跨语言一致性
│   ├── parallel-execution.test.js # 并发控制
│   └── error-recovery.test.js     # 异常处理
│
└── e2e/                           # 10% - 端到端验证
    ├── full-benchmark.test.js     # 完整基准测试
    └── data-quality.test.js       # 数据质量验证
```

### **测试执行策略**

```bash
# 日常开发 - 快速验证 (< 1分钟)
npm run test:smoke

# 代码提交前 - 全面验证 (< 5分钟)  
npm run test:integration

# 发布前 - 完整验证 (< 15分钟)
npm run test:full

# 实验前预检 - 科学验证 (< 10分钟)
npm run test:experiment-ready
```

### **关键测试指标**

1. **科学有效性指标**
   - ✅ 跨语言哈希一致性 = 100%
   - ✅ 数据采集成功率 ≥ 95%
   - ✅ 性能测量变异系数 ≤ 15%

2. **系统稳定性指标**  
   - ✅ 异常恢复成功率 ≥ 90%
   - ✅ 并发控制有效性 = 100%
   - ✅ 内存泄漏检测通过

3. **数据质量指标**
   - ✅ 异常值检测准确率 ≥ 95%
   - ✅ 统计分析 pipeline 无错误
   - ✅ 结果文件格式规范性 = 100%

---

## 🚀 实施建议

### **第一阶段：核心集成测试**
优先实现跨语言一致性验证和基本流程测试，确保实验的科学基础。

### **第二阶段：稳定性测试**  
添加异常处理、并发控制、超时恢复等测试，保证系统在各种条件下的可靠性。

### **第三阶段：性能优化**
基于测试反馈优化测试执行速度，建立快速反馈循环。

---