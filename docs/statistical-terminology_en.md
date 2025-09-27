# 📊 WebAssembly Benchmark Project Statistical Terminology Guide

> **Document Version**: v2.0 (Optimized based on actual implementation)
> **Last Updated**: 2025-09-26
> **Target Audience**: Development team, data analysts, decision makers
> **Project Scope**: WebAssembly Rust vs TinyGo performance comparison

---

## 🎯 **Document Objectives**

This document comprehensively analyzes the statistical terminology used in the WebAssembly benchmark project, explaining the meaning, function, and specific application of each concept in the project, providing statistical knowledge support for team members.

---

## 📋 **Statistical Terminology Distribution Overview**

Categories of statistical concepts actually implemented in the project:

| Category | Number of Terms | Implementation Status | Main Files |
|----------|-----------------|----------------------|------------|
| Descriptive Statistics | 10 terms | ✅ Fully Implemented | `analysis/statistics.py`, `analysis/qc.py` |
| Inferential Statistics | 6 terms | ✅ Fully Implemented | `analysis/statistics.py` (Welch's t-test, Cohen's d) |
| Quality Control | 4 terms | ✅ Fully Implemented | `analysis/qc.py` (IQR outlier detection, CV validation) |
| Visualization Support | 4 terms | ✅ Fully Implemented | `analysis/plots.py` |

---

## 🔢 **Descriptive Statistics**

Descriptive statistics are used to summarize and describe basic data characteristics, mainly for fundamental analysis of performance data in this project.

### **1. Measures of Central Tendency**

#### **Mean/Average**

- **Definition**: The arithmetic average of all values
- **Formula**: `μ = Σx / n`
- **Project Role**: Measure typical performance levels of Rust and TinyGo
- **Implementation Location**:

  ```python
  # analysis/statistics.py:296-306 (Welford algorithm)
  mean = 0.0
  for i, x in enumerate(data, 1):
      delta = x - mean
      mean += delta / i  # Running average update
  ```

- **Application Scenarios**: Calculate average execution time of benchmarks, provide performance reference for developers

#### **Median**

- **Definition**: The middle value after sorting the data
- **Characteristics**: Insensitive to outliers, provides more robust central tendency estimation
- **Project Role**: Provide more reliable performance indicators, avoid interference from extreme values
- **Implementation Location**:

  ```python
  # analysis/statistics.py:268-272
  def _calculate_median_from_sorted(self, sorted_data: list[float]) -> float:
      n = len(sorted_data)
      if n % 2 == 0:
          return (sorted_data[n // 2 - 1] + sorted_data[n // 2]) / 2
      else:
          return sorted_data[n // 2]
  ```

- **Application Scenarios**: Provide more accurate typical performance when outliers exist

### **2. Measures of Variability**

#### **Standard Deviation**

- **Definition**: A measure of data dispersion
- **Formula**: `σ = √(Σ(x - μ)² / n)`
- **Project Role**: Evaluate stability and consistency of benchmark results
- **Implementation Location**: Statistical validation class in `component-decision-analysis.md`
- **Application Scenarios**: Determine reliability of Rust vs TinyGo performance differences

#### **Variance**

- **Definition**: The square of standard deviation, indicating data dispersion
- **Formula**: `σ² = Σ(x - μ)² / n`
- **Project Role**: Used in statistical calculations for Welch's t-test
- **Implementation Location**:

  ```python
  # analysis/statistics.py:305 (in Welford algorithm)
  variance = m2 / (n - 1) if n > 1 else 0.0
  # where m2 is the accumulated sum of squared differences
  ```

- **Application Scenarios**: Compare variability differences between two groups of performance data

#### **Coefficient of Variation**

- **Definition**: The ratio of standard deviation to mean, indicating relative variability
- **Formula**: `CV = σ / μ`
- **Project Role**: Compare variability of data with different magnitudes, evaluate test stability
- **Configuration Location**:

  ```yaml
  # configs/bench-quick.yaml:145
  coefficient_of_variation_threshold: 0.15  # 15% threshold
  # configs/bench.yaml:145
  coefficient_of_variation_threshold: 0.10  # 10% threshold (stricter)
  ```

- **Application Scenarios**: Set thresholds for performance baseline validation, identify unstable test results

### **3. Positional Statistics**

#### **IQR - Interquartile Range**

- **Definition**: The difference between the 75th percentile (Q3) and 25th percentile (Q1), representing the range of the middle 50% of data
- **Formula**: `IQR = Q3 - Q1`
- **Project Role**: Core indicator for outlier detection
- **Configuration Location**:

  ```yaml
  # configs/bench.yaml:148
  outlier_iqr_multiplier: 1.5      # Standard IQR outlier detection
  # configs/bench-quick.yaml:148
  outlier_iqr_multiplier: 2.0      # More lenient threshold for quick mode
  ```

- **Application Scenarios**: Identify and filter abnormal performance test results
- **Detection Principle**: Values beyond `Q1-1.5×IQR` or `Q3+1.5×IQR` range are considered outliers

#### **Min/Max**

- **Definition**: Boundary values in the dataset
- **Project Role**: Determine performance range for data validation
- **Implementation Location**:

  ```python
  # analysis/statistics.py:920 (optimized implementation)
  min_val, max_val = sorted_data[0], sorted_data[-1]  # O(1) from sorted data
  ```

- **Application Scenarios**: Performance baseline validation, identify abnormal execution times

---

## 📊 **Inferential Statistics**

Inferential statistics are used to infer population characteristics from sample data, scientifically comparing performance differences between Rust and TinyGo in the project.

### **🎯 Why Inferential Statistics Are Essential: Core Challenge Analysis**

In WebAssembly benchmarking, inferential statistics solve a fundamental problem:

> **How to scientifically distinguish real language performance differences from random measurement fluctuations in noisy performance data?**

#### **Risk Scenarios Without Inferential Statistics**

```text
❌ Dangerous decision path:
Rust test results: [45.2ms, 46.1ms, 44.8ms, 45.5ms, 46.0ms] → Average: 45.52ms
TinyGo test results: [47.1ms, 46.8ms, 47.3ms, 46.9ms, 47.2ms] → Average: 47.06ms

Simple conclusion: "Rust is 1.54ms faster than TinyGo, we should choose Rust!"
⚠️  But this difference might be completely random!
```

#### **Solutions Provided by Inferential Statistics**

- **Scientific Validation**: Establish statistical framework to verify authenticity of differences
- **Risk Control**: Quantify uncertainty and risk of decisions
- **Standardized Decisions**: Provide objective comparison standards and thresholds

### **1. Hypothesis Testing**

#### **🔬 Why Hypothesis Testing Is Needed: Establishing Scientific Comparison Framework**

**Core Problem**: Distinguish real differences vs random noise

In performance testing, we always observe some differences between Rust and TinyGo, but the key question is:
> **Are these differences real performance differences, or caused by measurement errors, system load changes, random fluctuations?**

**Scientific Framework Provided by Hypothesis Testing**:

```javascript
// Logic framework of hypothesis testing
H0 (null hypothesis): μ_Rust = μ_TinyGo  (both languages have same performance)
H1 (alternative hypothesis): μ_Rust ≠ μ_TinyGo  (real performance difference exists)

// Testing through Welch's t-test
const result = StatisticalValidator.performWelchTTest(rustTimes, tinygoTimes);
```

**Practical Application Value**:

1. **Avoid Wrong Decisions**: Prevent technology selection based on accidental fluctuations
2. **Quantify Uncertainty**: Clearly state reliability of decisions
3. **Standardize Process**: Provide consistent methods for different task comparisons
4. **Team Communication**: Provide objective discussion foundation

#### **Welch's t-test**

- **Definition**: Statistical test comparing means of two samples that may have unequal variances
- **Advantages**: More robust than standard t-test, suitable for unequal variance situations
- **Project Role**: Scientifically compare performance differences between Rust and TinyGo
- **Implementation Location**: `analysis/statistics.py:64-125`
- **Core Code**:

  ```python
  def welch_t_test(self, group1: list[float], group2: list[float]) -> TTestResult:
      # Calculate sample statistics
      n1, mean1, var1 = self._get_basic_stats(group1)
      n2, mean2, var2 = self._get_basic_stats(group2)

      # Welch's t-statistic: t = (μ₁ - μ₂) / √(s₁²/n₁ + s₂²/n₂)
      standard_error = math.sqrt(var1 / n1 + var2 / n2)
      t_statistic = (mean1 - mean2) / standard_error

      # Welch-Satterthwaite degrees of freedom
      degrees_freedom = self._calculate_welch_degrees_freedom(var1, var2, n1, n2)

      # Use scipy to calculate accurate two-tailed p-value
      p_value = 2 * (1 - t_dist.cdf(abs(t_statistic), degrees_freedom))
  ```

- **t-statistic Interpretation**:
  - |t| > 2: Possible significant difference
  - |t| > 3: Likely significant difference
- **Application Scenarios**: Determine if performance differences between two compilers are statistically significant

#### **Degrees of Freedom**

- **Definition**: Number of independent parameters that can vary in statistical tests
- **Welch Method**: Uses Welch-Satterthwaite correction formula
- **Project Role**: Affects accuracy of critical values and p-value calculations
- **Implementation**: Adapts to unequal variance situations, improves test accuracy

### **2. Significance Testing**

#### **📊 Why Significance Testing Is Needed: Quantify Statistical Confidence**

**Core Problem**: How confident are we in the results?

Significance testing answers a key question through **p-values**:
> **If the two languages really have no performance difference, what's the probability of observing our current results (or more extreme results)?**

#### **Practical Meaning of p-values**

```javascript
// Hypothesis testing result example
{
  tStatistic: -3.247,
  pValue: 0.0031,        // Key indicator
  isSignificant: true,   // p < 0.05
  meanDifference: -1.54, // Rust 1.54ms faster on average
  confidenceInterval: [-2.67, -0.41]
}
```

**Interpretation**: `p = 0.0031` means: If Rust and TinyGo really have no performance difference, the probability of observing a 1.54ms or larger difference is only 0.31%, which is a very small probability, so we have reason to believe there is a real performance difference.

#### **Decision Guidance for Different p-values**

| p-value Range | Statistical Conclusion | Practical Decision Recommendation |
|---------------|----------------------|-----------------------------------|
| p ≥ 0.05 | No significant difference | Performance similar, choose based on other factors |
| 0.01 ≤ p < 0.05 | Moderate evidence | Difference exists but consider effect size |
| 0.001 ≤ p < 0.01 | Strong evidence | Likely real difference exists |
| p < 0.001 | Very strong evidence | Almost certain difference exists |

#### **⚠️ Limitations of Significance Testing**

```text
Case: "Significant but meaningless" results with large samples
- Test 10000 times, Rust 0.001ms faster on average
- p < 0.001 (highly significant)
- But 0.001ms difference is completely negligible in practice
```

**Important Warning**: Significance ≠ Practical Importance

#### **p-value**

- **Definition**: Probability of observing current results or more extreme results when null hypothesis is true
- **Interpretation**:
  - p < 0.001: Very strong evidence of difference
  - p < 0.01: Strong evidence of difference
  - p < 0.05: Moderate evidence of difference
  - p ≥ 0.05: Insufficient evidence of difference
- **Project Role**: Determine statistical significance of Rust vs TinyGo performance differences
- **Implementation Location**:

  ```python
  # analysis/statistics.py:475 (using scipy for precise calculation)
  p_value = 2 * (1 - t_dist.cdf(abs_t, df))
  ```

#### **Significance Level (Alpha/α)**

- **Definition**: Threshold probability for rejecting null hypothesis
- **Common Values**: 0.05 (5%), 0.01 (1%), 0.001 (0.1%)
- **Project Setting**: Default 0.05
- **Meaning**: Control probability of Type I error (incorrectly rejecting null hypothesis)

#### **Confidence Interval**

- **Definition**: Interval range containing true parameter value, providing uncertainty quantification
- **Common Level**: 95% (corresponding to α=0.05)
- **Project Role**: Provide interval estimation for performance differences
- **Implementation Location**:

  ```python
  # analysis/statistics.py:538-578
  def _confidence_interval(self, group1: list[float], group2: list[float]) -> tuple[float, float]:
      # Use scipy to calculate precise critical values
      critical_t = float(t_dist.ppf(1 - alpha / 2, degrees_freedom))
      margin_of_error = critical_t * standard_error
      return (mean_difference - margin_of_error, mean_difference + margin_of_error)
  ```

- **Interpretation**: 95% confidence interval means that if experiment is repeated 100 times, approximately 95 intervals would contain the true difference value

### **3. Effect Size Analysis**

#### **💪 Why Effect Size Analysis Is Needed: Assess Practical Importance**

**Core Problem**: How large is the difference, is it worth attention?

Effect size answers questions that significance testing cannot:
> **Even if there is statistical significance, how important is this difference in practical application?**

#### **Practical Meaning of Cohen's d**

```javascript
// Effect size calculation example
const effectSize = StatisticalValidator.calculateCohenD(rustTimes, tinygoTimes);
console.log(effectSize);
// Output:
{
  cohenD: 0.73,
  magnitude: "medium",
  interpretation: "Medium effect size - Rust faster than TinyGo"
}
```

#### **Decision Guidance for Effect Sizes**

| Cohen's d | Effect Size | Practical Meaning | Decision Recommendation |
|-----------|-------------|-------------------|-------------------------|
| \|d\| < 0.2 | Negligible | Very small difference, negligible practical impact | Choose based on team familiarity |
| 0.2 ≤ \|d\| < 0.5 | Small effect | Some difference, but not decisive factor | Consider performance along with other factors |
| 0.5 ≤ \|d\| < 0.8 | Medium effect | Clear difference, performance becomes important | Prioritize faster option for performance-sensitive scenarios |
| \|d\| ≥ 0.8 | Large effect | Significant difference, performance difference obvious | Strongly recommend choosing better performing language |

#### **Specific Applications in Project**

```javascript
// Effect size analysis for different tasks
const taskAnalysis = {
  json_parse: {
    cohenD: 0.23,  // Small effect
    recommendation: "Small performance difference, choose familiar language"
  },
  matrix_mul: {
    cohenD: 1.15,  // Large effect
    recommendation: "Rust significantly faster, recommend for compute-intensive tasks"
  },
  mandelbrot: {
    cohenD: 0.67,  // Medium effect
    recommendation: "Rust has clear advantage, worth considering"
  }
};
```

#### **Cohen's d**

- **Definition**: Standardized effect size, quantifying actual size of difference between two groups
- **Formula**: `d = (μ₁ - μ₂) / σ_pooled`
- **Project Role**: Assess practical importance of performance differences, not just statistical significance
- **Implementation Location**: `analysis/statistics.py:127-194`
- **Interpretation Standards**:
  - |d| < 0.2: Negligible effect
  - 0.2 ≤ |d| < 0.5: Small effect
  - 0.5 ≤ |d| < 0.8: Medium effect
  - |d| ≥ 0.8: Large effect
- **Configuration Location**:

  ```yaml
  # configs/bench-quick.yaml:150
  effect_size_metric: "cohens_d"
  minimum_detectable_effect: 0.2  # Minimum detectable effect size
  ```

#### **Effect Size Thresholds**

- **Project Configuration**:

  ```yaml
  # configs/bench-quick.yaml:152-155
  effect_size_thresholds:
    small: 0.2
    medium: 0.5
    large: 0.8
  ```

- **Application Scenarios**: Determine if performance differences have practical significance

### **🎯 Synergistic Role of Three Components: Complete Decision Support System**

#### **Complete Decision Support Process**

```text
1. Hypothesis Testing → Does real difference exist?
   ↓
2. Significance Testing → How confident are we in this conclusion?
   ↓
3. Effect Size Analysis → How important is this difference in practice?
   ↓
4. Comprehensive Decision → Technology selection based on statistical evidence
```

#### **🛡️ Risk Control: Why All Three Are Necessary**

**Risks of Having Only One or Two**:

```text
❌ Descriptive statistics only (mean comparison):
→ Cannot distinguish real differences from random noise
→ May make wrong decisions based on accidental results

❌ Hypothesis testing + significance testing only:
→ May be misled by statistically significant but practically meaningless tiny differences
→ With large samples, tiny differences can be significant

❌ Effect size analysis only:
→ Cannot determine if observed differences are reliable
→ May be misled by large effect sizes produced by random fluctuations
```

**Value of Complete System**:

```text
✅ Three components working together:
→ Scientific Rigor: Hypothesis testing establishes framework
→ Confidence Quantification: Significance testing provides reliability
→ Practical Assessment: Effect size analysis evaluates importance
→ Risk Control: Multi-layer verification prevents wrong decisions
```

#### **Real Case Analysis**

```javascript
// Complete statistical analysis results
const analysisResult = {
  // 1. Hypothesis testing results
  hypothesis: {
    result: "reject_null",
    conclusion: "Significant performance difference exists"
  },

  // 2. Significance testing
  significance: {
    pValue: 0.0023,
    isSignificant: true,
    confidence: "Strong evidence supports performance difference"
  },

  // 3. Effect size analysis
  effectSize: {
    cohenD: 0.78,
    magnitude: "medium-to-large",
    practicalSignificance: "Difference large enough to consider in technology selection"
  },

  // 4. Comprehensive recommendation
  recommendation: {
    choice: "Rust",
    confidence: "High",
    reasoning: "Statistically significant and practically important performance advantage"
  }
};
```

#### 💼 Practical Value for Development Team

##### Reduce Technical Debt

- Avoid technology selection based on wrong information
- Reduce risk of refactoring needed due to performance issues later

##### Improve Decision Quality

- Based on objective data rather than subjective judgment
- Quantified confidence and importance assessment

##### Improve Team Collaboration

- Unified decision standards and terminology
- Reduce subjective disputes in technology selection

##### Save Long-term Costs

- One correct choice better than multiple wrong attempts
- Avoid user experience degradation due to performance issues

---

## 🎯 **Quality Control Statistics**

Quality control statistics ensure reliability and validity of benchmark data.

### **1. Outlier Detection**

#### **Outliers**

- **Definition**: Observations that deviate significantly from main body of dataset
- **Detection Methods**:
  1. **IQR Method**: Values beyond Q1-1.5×IQR or Q3+1.5×IQR range

- **Project Configuration**:

  ```yaml
  # configs/bench-quick.yaml
  outlier_iqr_multiplier: 2.0          # More lenient outlier detection
  severe_outlier_iqr_multiplier: 4     # Severe outlier detection
  ```

- **Application Scenarios**: Identify and handle abnormal performance test results, ensure data quality

#### **Actual Outlier Detection Methods**

Project **does not use Z-score** for outlier detection, instead uses more robust **IQR method**:

- **Detection Principle**: Box plot method based on interquartile range
- **Implementation Location**: `analysis/qc.py` quality control module
- **Advantages**: More robust for non-normal distributions, unaffected by extreme values

### **2. Statistical Power Analysis**

#### **Statistical Power**

- **Definition**: Probability of correctly detecting real effect
- **Formula**: `Power = 1 - β` (β is Type II error probability)
- **Ideal Value**: ≥ 0.8 (80%)
- **Project Note**: Current implementation **does not include** statistical power analysis
- **Reason**: Sample size designed based on actual observations (warmup_runs + measure_runs × repetitions)
- **Sample Size**: Controlled by configuration file, no power calculation needed

- **Application Scenarios**: Ensure sufficient sample size to detect performance differences

#### **Sample Size Calculation**

- **Purpose**: Determine how many tests needed to achieve target statistical power
- **Influencing Factors**:
  - Expected effect size to detect
  - Significance level (α)
  - Statistical power requirement (1-β)
  - Data variability
- **Project Application**: Configure repetition count for benchmarks

### **3. Data Quality Validation**

#### **Success Rate**

- **Definition**: Proportion of successfully executed tests out of total tests
- **Project Configuration**: Minimum success rate threshold
- **Application Scenarios**: Ensure sufficient valid data for analysis

#### **Execution Time Range Validation**

- **Purpose**: Detect abnormal execution time values
- **Configuration Note**: Current implementation **does not include** execution time range validation
- **Quality Control**: Ensure data quality through IQR outlier detection and coefficient of variation validation
- **Timeout Mechanism**: Controlled by browser and configuration file timeout settings

- **Application Scenarios**: Identify test environment issues or implementation errors

---

## 🧪 **Distribution Testing**

Distribution testing is used to verify if data conforms to specific statistical distribution assumptions.

### **Normality Test**

- **Definition**: Test if data conforms to normal distribution
- **Common Methods**:
  - Shapiro-Wilk test (sample size < 50)
  - Kolmogorov-Smirnov test (sample size ≥ 50)
- **Project Implementation**: **Does not perform normality testing**
- **Design Reason**: Uses Welch's t-test, which has good robustness for non-normal distributions
- **Quality Assurance**: Ensure data quality through large sample sizes and IQR outlier filtering
- **Efficiency Consideration**: Avoid unnecessary distribution testing, focus on core performance comparison

### **Distribution Shape**

- **Skewness**: Measures asymmetry of distribution
- **Kurtosis**: Measures sharpness of distribution
- **Application**: Select appropriate statistical analysis methods

---

## 💡 **Statistical Application Architecture in Project**

### **1. Statistical Applications in Data Processing Flow**

```text
Raw Performance Data
    ↓
Descriptive Statistics Calculation (mean, median, standard deviation)
    ↓
Data Quality Validation (outlier detection, range checking)
    ↓
Distribution Testing (normality testing)
    ↓
Inferential Statistical Analysis (Welch's t-test, Cohen's d)
    ↓
Decision Support Report Generation
```

### **2. Statistical Method Selection Logic**

| Data Characteristics | Statistical Method | Application Scenarios |
|---------------------|-------------------|----------------------|
| Normal distribution, equal variance | Student's t-test | Ideal situation |
| Normal distribution, unequal variance | **Welch's t-test** | **Mainly used** |
| Non-normal distribution | Mann-Whitney U test | Alternative method |
| Small sample (n<30) | Non-parametric methods | Handle with caution |

### **3. Quality Control Levels**

1. **Basic Validation**: Data types, ranges, completeness
2. **Statistical Validation**: Outlier detection, distribution testing
3. **Result Validation**: Hash consistency, cross-language comparison
4. **Decision Validation**: Statistical significance, effect size assessment

---

## 🔧 **Statistical Configuration Guide**

### **1. Quick Test Configuration (bench-quick.yaml)**

```yaml
quality_control:
  coefficient_of_variation_threshold: 0.15
  outlier_iqr_multiplier: 2.0
  min_valid_samples: 5
  failure_rate: 0.2

statistics:
  significance_alpha: 0.05
  confidence_level: 0.95
  effect_size_thresholds:
    small: 0.2
    medium: 0.5
    large: 0.8
  minimum_detectable_effect: 0.2
```

### **2. Complete Test Configuration (bench.yaml)**

```yaml
quality_control:
  coefficient_of_variation_threshold: 0.10  # Stricter coefficient of variation
  outlier_iqr_multiplier: 1.5              # Standard IQR threshold
  min_valid_samples: 10                    # More minimum samples
  failure_rate: 0.1                        # Stricter failure rate

statistics:
  significance_alpha: 0.01                 # Stricter significance level
  confidence_level: 0.99                   # Higher confidence level
  minimum_detectable_effect: 0.15          # More sensitive effect size detection
```

### **3. Data Quality Standards (Actual Implementation)**

```python
# Quality control constants in analysis/qc.py
class QCConstants:
    Q1_PERCENTILE = 0.25
    Q3_PERCENTILE = 0.75
    EXTREME_CV_MULTIPLIER = 2.0
    MINIMUM_IQR_SAMPLES = 4

# Statistical constants in analysis/statistics.py
MINIMUM_SAMPLES_FOR_TEST = 2
COEFFICIENT_VARIATION_THRESHOLD = 1e-9
DEFAULT_POOLED_STD = 1.0
```

---

## 📚 **Statistical Terminology Glossary**

| English Term | Chinese Term | Brief Definition | Project Application |
|--------------|--------------|------------------|-------------------|
| Mean | 均值 | Arithmetic average | Performance baseline calculation |
| Median | 中位数 | Middle position value | Robust performance indicator |
| Standard Deviation | 标准差 | Data dispersion degree | Stability assessment |
| Variance | 方差 | Square of dispersion | Statistical test calculation |
| Coefficient of Variation | 变异系数 | Relative variability | Test quality control |
| IQR | 四分位距 | Middle 50% range | Outlier detection |
| Outlier | 异常值 | Extreme observations | Data quality control |
| Welch's t-test | Welch t检验 | Unequal variance t-test | ✅ Core performance comparison method |
| p-value | p值 | Statistical significance probability | ✅ Difference significance judgment |
| Cohen's d | Cohen d值 | Standardized effect size | ✅ Actual difference size assessment |
| Confidence Interval | 置信区间 | Parameter estimation range | ✅ Uncertainty quantification |
| Effect Size | 效应量 | Actual difference size | ✅ Practical significance assessment |
| Alpha Level | 显著性水平 | False positive error rate | ✅ Hypothesis testing standard |
| Degrees of Freedom | 自由度 | Number of independent parameters | ✅ Test accuracy |
| IQR | 四分位距 | Middle 50% range | ✅ Core outlier detection method |
| Statistical Power | 统计功效 | Ability to detect real effects | ❌ Not implemented - observation-based design |
| Normality Test | 正态性检验 | Distribution shape verification | ❌ Not implemented - Welch's t-test robust enough |
| Z-score | 标准分数 | Standardized position | ❌ Not used - IQR method adopted |

---

## � **Inferential Statistics Summary: Solving Core Challenges in WebAssembly Benchmarking**

The three core components of inferential statistics together solve the fundamental problem in performance benchmarking:

### **🔍 Core Challenge**
>
> **How to extract reliable decision information from noisy performance data?**

### **📊 Three-in-One Solution**

**1. Hypothesis Testing**: Establish scientific comparison framework, distinguish real differences from random noise

- Solves Problem: Avoid wrong technology choices based on accidental fluctuations
- Provides Framework: Scientific validation system of null vs alternative hypotheses

**2. Significance Testing**: Quantify confidence level in results, control decision risks

- Solves Problem: Quantify strength of statistical evidence
- Provides Tool: p-value as objective decision threshold

**3. Effect Size Analysis**: Assess practical importance of differences, avoid statistically significant but practically meaningless results

- Solves Problem: Distinguish statistical significance from practical importance
- Provides Standard: Standardized effect size assessment with Cohen's d

### **💡 Complete Value of Statistical Framework**

This complete statistical framework ensures WebAssembly language selection decisions are:

- **🔬 Scientific**: Based on statistical principles for objective analysis
- **🛡️ Reliable**: Multi-layer verification controls risk of wrong decisions
- **⚖️ Practical**: Focus on real application value rather than just numerical differences
- **🔄 Reproducible**: Standardized analysis processes ensure consistency

**Without this framework, development teams can only rely on intuition and incomplete information to make technology choices that may affect the entire project.**

---

## �🎯 **Value of Statistics in Decision Support**

### **1. Scientific Decision Foundation**

- **Avoid Subjective Bias**: Based on objective data rather than personal experience
- **Quantify Uncertainty**: Provide credibility through confidence intervals and p-values
- **Control Decision Risk**: Control probability of wrong decisions through statistical power analysis

### **2. Development Efficiency Improvement**

- **Quick Screening**: Quickly identify important differences through statistical significance
- **Priority Sorting**: Determine optimization focus through effect sizes
- **Quality Assurance**: Ensure result reliability through data validation

### **3. Team Collaboration Support**

- **Common Language**: Statistical terminology provides precise communication tools
- **Objective Standards**: Statistical standards reduce subjective disputes
- **Reproducibility**: Statistical methods ensure result consistency

---

## 🔮 **Project Statistical Methods Summary**

### **✅ Implemented Core Statistical Methods**

1. **Descriptive Statistics**: Mean, median, standard deviation, quartiles, coefficient of variation
2. **Inferential Statistics**: Welch's t-test, Cohen's d effect size, 95% confidence intervals
3. **Quality Control**: IQR outlier detection, coefficient of variation validation, sample size checking
4. **Visualization Analysis**: 4 statistical charts + interactive HTML reports

### **❌ Unimplemented Statistical Methods (Design Simplification)**

1. **Z-score Outlier Detection**: Replaced with more robust IQR method
2. **Normality Testing**: Welch's t-test robust enough for non-normal distributions
3. **Statistical Power Analysis**: Sample size determined based on actual observations
4. **Execution Time Range Validation**: Rely on timeout mechanism and outlier detection

### **🎯 Design Philosophy**

Project adopts **pragmatic statistical method combination**, focusing on:

- **Engineering Practicality**: Choose most effective methods for actual performance comparison
- **Computational Efficiency**: Avoid unnecessary statistical tests, improve analysis speed
- **Result Reliability**: Ensure credibility of statistical conclusions through multi-layer quality control
- **Decision Support**: Provide clear language selection recommendations and confidence assessments

---

## 📖 **Reference Resources**

### **Statistics Fundamentals**

- 《Introduction to Statistics》- David S. Moore
- 《Applied Statistics》- Douglas C. Montgomery
- 《Design and Analysis of Experiments》- R. Lyman Ott

### **Online Resources**

- [Khan Academy Statistics](https://www.khanacademy.org/math/statistics-probability)
- [Coursera Statistical Inference](https://www.coursera.org/learn/statistical-inference)
- [R Documentation](https://www.rdocumentation.org/) - Statistical method reference

### **Project Related**

- [Welch's t-test Details](https://en.wikipedia.org/wiki/Welch%27s_t-test)
- [Cohen's d Calculation Guide](https://en.wikipedia.org/wiki/Effect_size#Cohen's_d)
- [Statistical Power Analysis](https://en.wikipedia.org/wiki/Statistical_power)
