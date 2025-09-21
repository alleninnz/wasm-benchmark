"""
Statistical analysis module for WebAssembly benchmark performance comparison.

Implements Welch's t-test, Cohen's d effect size calculation, and confidence intervals
for engineering-grade statistical comparison between Rust and TinyGo implementations.
"""

import json
import math
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Tuple

from scipy.stats import t as t_dist

from analysis.config_parser import ConfigParser

from .data_models import (BenchmarkSample, CleanedDataset, ComparisonResult,
                          EffectSize, EffectSizeResult, StatisticalResult,
                          StatisticsConfiguration, TaskResult, TTestResult)

# Statistical constants
MINIMUM_SAMPLES_FOR_TEST = 2
COEFFICIENT_VARIATION_THRESHOLD = 1e-9
DEFAULT_POOLED_STD = 1.0
FALLBACK_DEGREES_FREEDOM = 1.0

# Quartile percentiles
FIRST_QUARTILE = 0.25
THIRD_QUARTILE = 0.75


class StatisticalAnalysis:
    """Statistical analysis engine for benchmark performance comparison"""

    def __init__(
        self, stats_config: StatisticsConfiguration
    ):
        """
        Initialize statistical analysis with configuration.

        Args:
            stats_config: Statistical analysis configuration parameters
        """
        self.config = stats_config
        self.alpha = self.config.significance_alpha
        self.confidence_level = self.config.confidence_level
        self.effect_thresholds = self.config.effect_size_thresholds
        self.minimum_detectable_effect = self.config.minimum_detectable_effect

        # Performance optimization: cache for expensive calculations
        self._stats_cache = {}
        self._cache_enabled = True  # Can be disabled for testing or memory constraints

    def welch_t_test(self, group1: List[float], group2: List[float]) -> TTestResult:
        """
        Perform Welch's t-test for comparing two groups with potentially unequal variances.

        Mathematical implementation:
        - t = (μ₁ - μ₂) / √(s₁²/n₁ + s₂²/n₂)
        - df = (s₁²/n₁ + s₂²/n₂)² / [(s₁²/n₁)²/(n₁-1) + (s₂²/n₂)²/(n₂-1)]

        Args:
            group1: Performance data for first group (e.g., Rust)
            group2: Performance data for second group (e.g., TinyGo)

        Returns:
            TTestResult: Complete t-test results with significance assessment

        Raises:
            TypeError: If inputs are not lists
            ValueError: If data contains invalid values
        """
        self._validate_groups(group1, group2, "welch_t_test")
        # Calculate sample statistics for both groups with caching
        n1, mean1, var1 = self._get_cached_stats(group1)
        n2, mean2, var2 = self._get_cached_stats(group2)

        if n1 < MINIMUM_SAMPLES_FOR_TEST or n2 < MINIMUM_SAMPLES_FOR_TEST:
            # Insufficient data for meaningful t-test
            return TTestResult(
                t_statistic=0.0,
                p_value=1.0,
                degrees_freedom=1.0,
                confidence_interval_lower=0.0,
                confidence_interval_upper=0.0,
                mean_difference=mean1 - mean2,
                is_significant=False,
                alpha=self.alpha,
            )

        # Calculate Welch's t-statistic
        t_statistic = self._calculate_welch_t_stats(mean1, mean2, var1, var2, n1, n2)

        # Calculate Welch-Satterthwaite degrees of freedom
        degrees_freedom = self._calculate_welch_degrees_freedom(var1, var2, n1, n2)

        # Calculate two-tailed p-value
        p_value = self._calculate_p_value(t_statistic, degrees_freedom)

        # Determine statistical significance
        is_significant = p_value < self.alpha

        # Calculate confidence interval for mean difference
        ci_lower, ci_upper = self._confidence_interval(group1, group2)

        return TTestResult(
            t_statistic=t_statistic,
            p_value=p_value,
            degrees_freedom=degrees_freedom,
            confidence_interval_lower=ci_lower,
            confidence_interval_upper=ci_upper,
            mean_difference=mean1 - mean2,
            is_significant=is_significant,
            alpha=self.alpha,
        )

    def cohens_d(self, group1: List[float], group2: List[float]) -> EffectSizeResult:
        """
        Calculate Cohen's d effect size for quantifying practical significance.

        Integrates minimum detectable effect (MDE) assessment to distinguish between
        statistical significance and practical significance for engineering decisions.

        Mathematical implementation:
        - d = (μ₁ - μ₂) / s_pooled
        - s_pooled = √[((n₁-1)×s₁² + (n₂-1)×s₂²) / (n₁+n₂-2)]
        - Practical significance: |d| ≥ minimum_detectable_effect

        Args:
            group1: Performance data for first group
            group2: Performance data for second group

        Returns:
            EffectSizeResult: Complete effect size analysis with classification,
            including assessment against minimum detectable effect threshold

        Raises:
            TypeError: If inputs are not lists
            ValueError: If data contains invalid values
        """
        self._validate_groups(group1, group2, "cohens_d")
        # Calculate sample statistics for both groups with caching
        n1, mean1, var1 = self._get_cached_stats(group1)
        n2, mean2, var2 = self._get_cached_stats(group2)

        if n1 < MINIMUM_SAMPLES_FOR_TEST or n2 < MINIMUM_SAMPLES_FOR_TEST:
            # Insufficient data for meaningful effect size calculation
            return EffectSizeResult(
                cohens_d=0.0,
                effect_size=EffectSize.NEGLIGIBLE,
                pooled_std=1.0,
                magnitude=0.0,
                interpretation="Insufficient data for effect size calculation",
                meets_minimum_detectable_effect=False,
            )

        # Calculate standard deviations
        std1 = math.sqrt(var1)
        std2 = math.sqrt(var2)

        # Calculate pooled standard deviation
        pooled_std = self._calculate_pooled_std(std1, std2, n1, n2)

        # Calculate Cohen's d value
        cohens_d_value = self._calculate_cohens_d_value(mean1, mean2, pooled_std)

        # Classify effect size magnitude
        effect_size = self._classify_effect_size(cohens_d_value)

        # Generate interpretation with MDE assessment
        abs_d = abs(cohens_d_value)
        meets_mde = abs_d >= self.minimum_detectable_effect
        interpretation = self._generate_effect_size_interpretation(
            cohens_d_value, abs_d, meets_mde
        )

        return EffectSizeResult(
            cohens_d=cohens_d_value,
            effect_size=effect_size,
            pooled_std=pooled_std,
            magnitude=abs_d,
            interpretation=interpretation,
            meets_minimum_detectable_effect=meets_mde,
        )

    def _validate_groups(
        self, group1: List[float], group2: List[float], method_name: str
    ) -> None:
        """Validate input groups for statistical analysis.

        Args:
            group1: First data group
            group2: Second data group
            method_name: Name of calling method for error context

        Raises:
            TypeError: If inputs are not lists
            ValueError: If data contains non-numeric values or insufficient samples
        """
        if not isinstance(group1, list) or not isinstance(group2, list):
            raise TypeError(f"{method_name}: Input groups must be lists")

        if not group1 and not group2:
            raise ValueError(f"{method_name}: Both groups cannot be empty")

        # Check for numeric values
        for i, value in enumerate(group1):
            if (
                not isinstance(value, (int, float))
                or math.isnan(value)
                or math.isinf(value)
            ):
                raise ValueError(
                    f"{method_name}: group1[{i}] contains invalid numeric value: {value}"
                )

        for i, value in enumerate(group2):
            if (
                not isinstance(value, (int, float))
                or math.isnan(value)
                or math.isinf(value)
            ):
                raise ValueError(
                    f"{method_name}: group2[{i}] contains invalid numeric value: {value}"
                )

        # Check for negative values (performance times should be positive)
        if any(x < 0 for x in group1) or any(x < 0 for x in group2):
            raise ValueError(
                f"{method_name}: Performance data should not contain negative values"
            )

    def _calculate_complete_stats(self, data: List[float]) -> StatisticalResult:
        """
        Calculate complete descriptive statistics with optimized data passes.

        Performance optimizations:
        - Single pass for basic statistics using Welford's algorithm
        - Single sort for all percentile calculations
        - Reuse sorted data for min/max operations

        Args:
            data: Performance data samples

        Returns:
            StatisticalResult: Complete statistical measures
        """
        if not data:
            return self._empty_statistical_result()

        # Single pass for basic statistics using Welford's algorithm
        n, mean, variance = self._calculate_basic_stats_welford(data)
        std = math.sqrt(variance)
        coefficient_variation = (
            std / mean if abs(mean) > COEFFICIENT_VARIATION_THRESHOLD else 0.0
        )

        # Single sort for all percentile calculations
        sorted_data = sorted(data)
        min_val, max_val = sorted_data[0], sorted_data[-1]  # O(1) vs separate min/max

        # Efficient percentile calculations from sorted data
        median = self._calculate_median_from_sorted(sorted_data)
        q1, q3 = self._calculate_quartiles(sorted_data)

        return StatisticalResult(
            count=n,
            mean=mean,
            std=std,
            min=min_val,
            max=max_val,
            median=median,
            q1=q1,
            q3=q3,
            iqr=q3 - q1,
            coefficient_variation=coefficient_variation,
        )

    def _empty_statistical_result(self) -> StatisticalResult:
        """Return empty statistical result for zero-length datasets."""
        return StatisticalResult(
            count=0,
            mean=0.0,
            std=0.0,
            min=0.0,
            max=0.0,
            median=0.0,
            q1=0.0,
            q3=0.0,
            iqr=0.0,
            coefficient_variation=0.0,
        )

    def _calculate_median_from_sorted(self, sorted_data: List[float]) -> float:
        """
        Calculate median from pre-sorted data.

        Args:
            sorted_data: Pre-sorted performance data

        Returns:
            float: Median value
        """
        n = len(sorted_data)
        if n % 2 == 0:
            return (sorted_data[n // 2 - 1] + sorted_data[n // 2]) / 2
        else:
            return sorted_data[n // 2]

    def _calculate_basic_stats_welford(
        self, data: List[float]
    ) -> Tuple[int, float, float]:
        """
        Calculate mean and variance using Welford's online algorithm.

        Performance: O(n) single pass vs O(2n) current approach
        Stability: Numerically stable for all dataset sizes

        Args:
            data: Performance data samples

        Returns:
            Tuple[int, float, float]: (n, mean, variance)
        """
        if not data:
            return 0, 0.0, 0.0

        n = len(data)
        if n == 1:
            return 1, data[0], 0.0

        mean = 0.0
        m2 = 0.0  # Sum of squares of differences from current mean

        for i, x in enumerate(data, 1):
            delta = x - mean
            mean += delta / i  # Running mean update
            delta2 = x - mean
            m2 += delta * delta2  # Running variance accumulator

        variance = m2 / (n - 1) if n > 1 else 0.0
        return n, mean, variance

    def _calculate_welch_t_stats(
        self, mean1: float, mean2: float, var1: float, var2: float, n1: int, n2: int
    ) -> float:
        """
        Calculate Welch's t-statistic for unequal variances.

        Args:
            mean1, mean2: Sample means
            var1, var2: Sample variances
            n1, n2: Sample sizes

        Returns:
            float: t-statistic value
        """
        standard_error = math.sqrt(var1 / n1 + var2 / n2)
        if standard_error == 0:
            return 0.0
        return (mean1 - mean2) / standard_error

    def _calculate_welch_degrees_freedom(
        self, var1: float, var2: float, n1: int, n2: int
    ) -> float:
        """
        Calculate Welch-Satterthwaite degrees of freedom.

        Args:
            var1, var2: Sample variances
            n1, n2: Sample sizes

        Returns:
            float: Degrees of freedom
        """
        if n1 <= 1 or n2 <= 1:
            return FALLBACK_DEGREES_FREEDOM

        s1_squared_over_n1 = var1 / n1
        s2_squared_over_n2 = var2 / n2

        numerator = (s1_squared_over_n1 + s2_squared_over_n2) ** 2
        denominator = (s1_squared_over_n1**2) / (n1 - 1) + (
            s2_squared_over_n2**2
        ) / (n2 - 1)

        if denominator == 0:
            return FALLBACK_DEGREES_FREEDOM

        return numerator / denominator

    def _calculate_quartiles(self, sorted_data: List[float]) -> Tuple[float, float]:
        """
        Calculate first and third quartiles efficiently.

        Args:
            sorted_data: Sorted performance data

        Returns:
            Tuple[float, float]: (Q1, Q3) values
        """
        n = len(sorted_data)

        if n < 4:
            # For small datasets, use median as approximation
            median_val = (
                sorted_data[n // 2]
                if n % 2 == 1
                else (sorted_data[n // 2 - 1] + sorted_data[n // 2]) / 2
            )
            return median_val, median_val

        # Calculate quartile positions using linear interpolation
        q1_pos = FIRST_QUARTILE * (n - 1)
        q3_pos = THIRD_QUARTILE * (n - 1)

        # Q1 calculation
        q1_lower = int(q1_pos)
        q1_frac = q1_pos - q1_lower

        if q1_lower + 1 < n:
            q1 = sorted_data[q1_lower] + q1_frac * (
                sorted_data[q1_lower + 1] - sorted_data[q1_lower]
            )
        else:
            q1 = sorted_data[q1_lower]

        # Q3 calculation
        q3_lower = int(q3_pos)
        q3_frac = q3_pos - q3_lower

        if q3_lower + 1 < n:
            q3 = sorted_data[q3_lower] + q3_frac * (
                sorted_data[q3_lower + 1] - sorted_data[q3_lower]
            )
        else:
            q3 = sorted_data[q3_lower]

        return q1, q3

    def _generate_effect_size_interpretation(
        self, cohens_d_value: float, abs_d: float, meets_mde: bool
    ) -> str:
        """
        Generate comprehensive interpretation of effect size with practical significance assessment.

        Args:
            cohens_d_value: Raw Cohen's d value
            abs_d: Absolute value of Cohen's d
            meets_mde: Whether effect meets minimum detectable effect threshold

        Returns:
            str: Detailed interpretation combining effect size and practical significance
        """
        # Base effect size interpretation
        if abs_d >= self.effect_thresholds["large"]:
            base_interpretation = f"Large effect (d={cohens_d_value:.3f}): Substantial practical difference"
        elif abs_d >= self.effect_thresholds["medium"]:
            base_interpretation = (
                f"Medium effect (d={cohens_d_value:.3f}): Moderate practical difference"
            )
        elif abs_d >= self.effect_thresholds["small"]:
            base_interpretation = f"Small effect (d={cohens_d_value:.3f}): Minor but detectable difference"
        else:
            base_interpretation = (
                f"Negligible effect (d={cohens_d_value:.3f}): No practical difference"
            )

        # Minimum detectable effect context
        mde_status = "exceeds" if meets_mde else "below"
        mde_interpretation = f" Effect size {mde_status} minimum detectable threshold (MDE={self.minimum_detectable_effect:.3f})"

        # Practical significance assessment
        if meets_mde:
            practical_assessment = (
                " - Practically significant for engineering decisions"
            )
        else:
            practical_assessment = (
                " - May lack practical significance for engineering decisions"
            )

        return base_interpretation + mde_interpretation + practical_assessment

    def _get_cached_stats(self, data: List[float]) -> Tuple[int, float, float]:
        """
        Get basic statistics with caching to avoid recomputation.

        Performance optimization: Cache expensive calculations when the same
        dataset is processed multiple times (e.g., in comparison operations).

        Args:
            data: Performance data samples

        Returns:
            Tuple[int, float, float]: (n, mean, variance)
        """
        if not self._cache_enabled:
            return self._calculate_basic_stats_welford(data)

        # Create a simple hash for the data
        data_hash = (
            hash(tuple(data))
            if len(data) < 1000
            else hash((len(data), sum(data), data[0], data[-1]))
        )

        if data_hash not in self._stats_cache:
            self._stats_cache[data_hash] = self._calculate_basic_stats_welford(data)

        return self._stats_cache[data_hash]

    def clear_cache(self) -> None:
        """
        Clear the statistics cache to free memory.

        Useful for long-running processes or when memory usage becomes a concern.
        """
        self._stats_cache.clear()

    def disable_cache(self) -> None:
        """Disable caching for memory-constrained environments."""
        self._cache_enabled = False
        self._stats_cache.clear()

    def enable_cache(self) -> None:
        """Re-enable caching for performance optimization."""
        self._cache_enabled = True

    def _calculate_p_value(self, t_stat: float, df: float) -> float:
        """
        Calculate accurate two-tailed p-value for t-statistic using t-distribution.

        Args:
            t_stat: t-statistic value
            df: Degrees of freedom

        Returns:
            float: Two-tailed p-value
        """
        # Use scipy for accurate p-value calculation
        abs_t = abs(t_stat)
        # Two-tailed p-value: P(|T| > |t|) = 2 * P(T > |t|) = 2 * (1 - CDF(|t|))
        p_value = 2 * (1 - t_dist.cdf(abs_t, df))
        return float(p_value)  # Ensure return type is float

    def _calculate_pooled_std(
        self, std1: float, std2: float, n1: int, n2: int
    ) -> float:
        """
        Calculate pooled standard deviation for Cohen's d.

        Args:
            std1, std2: Sample standard deviations
            n1, n2: Sample sizes

        Returns:
            float: Pooled standard deviation
        """
        if n1 <= 1 and n2 <= 1:
            return DEFAULT_POOLED_STD

        var1 = std1**2
        var2 = std2**2
        pooled_variance = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2)
        return math.sqrt(max(0, pooled_variance))  # Ensure non-negative

    def _calculate_cohens_d_value(
        self, mean1: float, mean2: float, pooled_std: float
    ) -> float:
        """
        Calculate Cohen's d effect size value.

        Args:
            mean1, mean2: Sample means
            pooled_std: Pooled standard deviation

        Returns:
            float: Cohen's d value
        """
        if pooled_std == 0:
            return 0.0
        return (mean1 - mean2) / pooled_std

    def _classify_effect_size(self, cohen_d: float) -> EffectSize:
        """
        Classify Cohen's d magnitude according to configured thresholds.

        Args:
            cohen_d: Computed Cohen's d value

        Returns:
            EffectSize: Effect size classification enum
        """
        abs_d = abs(cohen_d)
        thresholds = self.effect_thresholds

        if abs_d >= thresholds["large"]:
            return EffectSize.LARGE
        elif abs_d >= thresholds["medium"]:
            return EffectSize.MEDIUM
        elif abs_d >= thresholds["small"]:
            return EffectSize.SMALL
        else:
            return EffectSize.NEGLIGIBLE

    def _confidence_interval(
        self, group1: List[float], group2: List[float]
    ) -> Tuple[float, float]:
        """
        Calculate confidence interval for the difference in means using accurate t-distribution.

        Args:
            group1: Performance data for first group
            group2: Performance data for second group

        Returns:
            Tuple[float, float]: (lower_bound, upper_bound) of confidence interval
        """
        # Calculate sample statistics for both groups with caching
        n1, mean1, var1 = self._get_cached_stats(group1)
        n2, mean2, var2 = self._get_cached_stats(group2)

        if n1 < MINIMUM_SAMPLES_FOR_TEST or n2 < MINIMUM_SAMPLES_FOR_TEST:
            # Insufficient data for confidence interval
            mean_diff = mean1 - mean2
            return (mean_diff, mean_diff)

        # Calculate standard error of the difference in means
        standard_error = math.sqrt(var1 / n1 + var2 / n2)

        # Calculate degrees of freedom
        degrees_freedom = self._calculate_welch_degrees_freedom(var1, var2, n1, n2)

        # Calculate critical t-value using scipy
        alpha = 1 - self.confidence_level
        critical_t = float(t_dist.ppf(1 - alpha / 2, degrees_freedom))

        # Calculate margin of error
        margin_of_error = critical_t * standard_error

        # Calculate mean difference and confidence interval bounds
        mean_difference = mean1 - mean2
        lower_bound = mean_difference - margin_of_error
        upper_bound = mean_difference + margin_of_error

        return (lower_bound, upper_bound)

    def generate_task_comparison(
        self, rust_result: TaskResult, tinygo_result: TaskResult
    ) -> ComparisonResult:
        """
        Perform complete statistical comparison between Rust and TinyGo for a specific task.

        Args:
            rust_result: Rust implementation results
            tinygo_result: TinyGo implementation results

        Returns:
            ComparisonResult: Comprehensive statistical comparison

        Raises:
            TypeError: If inputs are not TaskResult objects
            ValueError: If task results are incompatible for comparison
        """
        if not isinstance(rust_result, TaskResult) or not isinstance(
            tinygo_result, TaskResult
        ):
            raise TypeError("Both arguments must be TaskResult objects")

        if (
            rust_result.task != tinygo_result.task
            or rust_result.scale != tinygo_result.scale
        ):
            raise ValueError(
                f"Task results are incompatible for comparison: "
                f"rust({rust_result.task}, {rust_result.scale}) vs "
                f"tinygo({tinygo_result.task}, {tinygo_result.scale})"
            )
        # Extract execution times from successful samples only
        rust_times = [
            sample.executionTime for sample in rust_result.samples if sample.success
        ]
        tinygo_times = [
            sample.executionTime for sample in tinygo_result.samples if sample.success
        ]

        # Calculate descriptive statistics for both languages
        rust_stats = self._calculate_complete_stats(rust_times)
        tinygo_stats = self._calculate_complete_stats(tinygo_times)

        # Execute Welch's t-test for significance testing
        t_test_result = self.welch_t_test(rust_times, tinygo_times)

        # Calculate Cohen's d for effect size assessment
        effect_size_result = self.cohens_d(rust_times, tinygo_times)

        # Generate enhanced confidence level assessment considering:
        # 1. Statistical significance (p-value < alpha)
        # 2. Effect size magnitude (Cohen's d classification)
        # 3. Minimum detectable effect threshold (practical significance)

        is_statistically_significant = t_test_result.is_significant
        has_meaningful_effect = effect_size_result.effect_size != EffectSize.NEGLIGIBLE
        meets_practical_threshold = effect_size_result.meets_minimum_detectable_effect

        if (
            is_statistically_significant
            and has_meaningful_effect
            and meets_practical_threshold
        ):
            # Strong evidence: statistically significant + meaningful effect + practical significance
            if effect_size_result.effect_size == EffectSize.LARGE:
                confidence_level = "Very High"
            elif effect_size_result.effect_size == EffectSize.MEDIUM:
                confidence_level = "High"
            else:
                confidence_level = "Medium"
        elif is_statistically_significant and has_meaningful_effect:
            # Moderate evidence: statistically significant + meaningful effect but below practical threshold
            confidence_level = "Medium"
        elif meets_practical_threshold:
            # Some evidence: practically significant but not statistically confirmed
            confidence_level = "Low-Medium"
        else:
            # Weak evidence: neither statistically significant nor practically meaningful
            confidence_level = "Low"

        return ComparisonResult(
            task=rust_result.task,
            scale=rust_result.scale,
            rust_stats=rust_stats,
            tinygo_stats=tinygo_stats,
            t_test=t_test_result,
            effect_size=effect_size_result,
            confidence_level=confidence_level,
        )


def main():
    """Main function for standalone execution of statistical analysis."""
    try:
        _execute_statistical_analysis_pipeline()
    except Exception as e:
        print(f"❌ Critical error in statistical analysis pipeline: {e}")
        sys.exit(1)


def _execute_statistical_analysis_pipeline() -> None:
    """Execute the complete statistical analysis pipeline with proper error handling."""
    # Standard input/output paths
    input_path = Path("reports/qc/cleaned_dataset.json")
    output_dir = Path("reports/statistics")
    output_dir.mkdir(parents=True, exist_ok=True)

    print("📊 WebAssembly Benchmark Statistical Analysis")
    print("=" * 60)

    # Step 1: Load configuration
    print("🔧 Loading statistical analysis configuration...")
    stats_config = _load_statistics_config()

    # Step 2: Load cleaned dataset
    print(f"📂 Loading cleaned dataset from {input_path}...")
    dataset = _load_cleaned_dataset(input_path)

    # Step 3: Initialize statistical analysis engine
    print("⚙️ Initializing statistical analysis engine...")
    stats_engine = StatisticalAnalysis(stats_config)

    # Step 4: Perform statistical comparisons
    print("🔬 Performing statistical comparisons...")
    comparison_results = _perform_comparisons(dataset, stats_engine)

    # Step 5: Save results
    print(f"💾 Saving comparison results to {output_dir}...")
    _save_comparison_results(comparison_results, output_dir)

    # Step 6: Print summary
    _print_analysis_summary(comparison_results, output_dir)

    print("\n✅ Statistical analysis pipeline completed successfully!")


def _load_statistics_config() -> StatisticsConfiguration:
    """
    Load statistical analysis configuration.

    Returns:
        StatisticsConfiguration object with loaded parameters
    """
    try:
        config_parser = ConfigParser().load()
        stats_config = config_parser.get_stats_config()
        print("✅ Loaded statistical analysis configuration")
        return stats_config
    except FileNotFoundError:
        print("❌ Configuration file not found")
        sys.exit(1)
    except (ValueError, KeyError) as e:
        print(f"❌ Invalid configuration format: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error loading configuration: {e}")
        sys.exit(1)


def _load_cleaned_dataset(input_path: Path) -> CleanedDataset:
    """
    Load cleaned dataset from JSON file.

    Args:
        input_path: Path to cleaned dataset JSON file

    Returns:
        CleanedDataset object containing the loaded data

    Raises:
        FileNotFoundError: If the input file does not exist
        ValueError: If the file content is not valid JSON or has incorrect format
    """
    try:
        if not input_path.exists():
            raise FileNotFoundError(f"Cleaned dataset file not found: {input_path}")

        with open(input_path, "r") as f:
            raw_data = json.load(f)

        # Validate required fields
        _validate_cleaned_dataset_structure(raw_data)

        # Convert raw data to structured objects
        task_results = _convert_raw_task_results(raw_data.get("task_results", []))
        removed_outliers = _convert_raw_samples(raw_data.get("removed_outliers", []))
        cleaning_log = raw_data.get("cleaning_log", [])

        print(f"✅ Loaded {len(task_results)} task results from cleaned dataset")

        return CleanedDataset(
            task_results=task_results,
            removed_outliers=removed_outliers,
            cleaning_log=cleaning_log
        )

    except FileNotFoundError:
        print(f"❌ Cleaned dataset file not found: {input_path}")
        print("💡 Run quality control analysis first to generate cleaned dataset")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON format in {input_path}: {e}")
        sys.exit(1)
    except (ValueError, KeyError) as e:
        print(f"❌ Invalid cleaned dataset format: {e}")
        sys.exit(1)
    except IOError as e:
        print(f"❌ Error reading {input_path}: {e}")
        sys.exit(1)


def _perform_comparisons(
    dataset: CleanedDataset, stats_engine: StatisticalAnalysis
) -> List[ComparisonResult]:
    """
    Perform statistical comparisons for all tasks in the cleaned dataset.

    Args:
        dataset: CleanedDataset object with benchmark results
        stats_engine: Initialized StatisticalAnalysis engine

    Returns:
        List of ComparisonResult objects for each task comparison

    Raises:
        ValueError: If insufficient data for comparison
        RuntimeError: If statistical calculations fail
    """
    comparison_results = []

    # Group task results by (task, scale) for comparison
    task_groups = _group_task_results_for_comparison(dataset.task_results)

    if not task_groups:
        print("⚠️ Warning: No task groups found for comparison")
        return comparison_results

    print(f"🔍 Found {len(task_groups)} task-scale combinations for comparison")

    for (task, scale), language_results in task_groups.items():
        try:
            # Look for Rust and TinyGo implementations
            rust_result = language_results.get("rust")
            tinygo_result = language_results.get("tinygo")

            if rust_result is None or tinygo_result is None:
                print(f"⚠️ Skipping {task}_{scale}: Missing Rust or TinyGo implementation")
                continue

            # Perform statistical comparison
            print(f"📊 Comparing {task}_{scale}: Rust vs TinyGo...")
            comparison_result = stats_engine.generate_task_comparison(rust_result, tinygo_result)
            comparison_results.append(comparison_result)

            # Log comparison summary
            effect_size = comparison_result.effect_size
            print(f"  ✓ Effect size: {effect_size.effect_size.value} (d={effect_size.cohens_d:.3f})")

        except Exception as e:
            print(f"❌ Error comparing {task}_{scale}: {e}")
            continue

    print(f"✅ Completed {len(comparison_results)} statistical comparisons")
    return comparison_results


def _save_comparison_results(
        comparison_results: List[ComparisonResult], output_dir: Path) -> None:
    """
    Save comparison results to JSON files in the specified output directory.

    Args:
        comparison_results: List of ComparisonResult objects to save
        output_dir: Directory where results will be saved

    Raises:
        IOError: If there is an error writing to the output files
    """
    if not comparison_results:
        print("⚠️ No comparison results to save")
        return

    try:
        # Generate comprehensive statistical report
        statistical_report = {
            "timestamp": datetime.now().isoformat(),
            "total_comparisons": len(comparison_results),
            "comparison_results": [
                _comparison_result_to_dict(result) for result in comparison_results
            ],
            "summary_statistics": _generate_summary_statistics(comparison_results)
        }

        # Save main statistical report
        report_path = output_dir / "statistical_analysis_report.json"
        with open(report_path, "w") as f:
            json.dump(statistical_report, f, indent=2)
        print(f"✅ Statistical analysis report saved to {report_path}")

        # Save individual comparison results for detailed analysis
        for result in comparison_results:
            result_filename = f"comparison_{result.task}_{result.scale}_rust_vs_tinygo.json"
            result_path = output_dir / result_filename

            detailed_result = _comparison_result_to_dict(result)
            with open(result_path, "w") as f:
                json.dump(detailed_result, f, indent=2)

        print(f"✅ Saved {len(comparison_results)} individual comparison files")

    except IOError as e:
        print(f"❌ Error saving comparison results: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error during save operation: {e}")
        sys.exit(1)


def _validate_cleaned_dataset_structure(raw_data: Dict[str, Any]) -> None:
    """Validate that the loaded JSON has the expected structure."""
    required_fields = ["task_results", "cleaning_log"]
    for field in required_fields:
        if field not in raw_data:
            raise ValueError(f"Missing required field '{field}' in cleaned dataset")

    if not isinstance(raw_data["task_results"], list):
        raise ValueError("Field 'task_results' must be a list")


def _convert_raw_task_results(raw_task_results: List[Dict[str, Any]]) -> List[TaskResult]:
    """Convert raw task result data to TaskResult objects."""
    task_results = []
    for raw_result in raw_task_results:
        samples = _convert_raw_samples(raw_result.get("samples", []))

        task_result = TaskResult(
            task=raw_result.get("task", ""),
            language=raw_result.get("language", ""),
            scale=raw_result.get("scale", ""),
            samples=samples,
            successful_runs=raw_result.get("successful_runs", 0),
            failed_runs=raw_result.get("failed_runs", 0),
            success_rate=raw_result.get("success_rate", 0.0)
        )
        task_results.append(task_result)

    return task_results


def _convert_raw_samples(raw_samples: List[Dict[str, Any]]) -> List[BenchmarkSample]:
    """Convert raw sample data to BenchmarkSample objects."""
    samples = []
    for raw_sample in raw_samples:
        sample = BenchmarkSample(
            task=raw_sample.get("task", ""),
            language=raw_sample.get("language", ""),
            scale=raw_sample.get("scale", ""),
            run=raw_sample.get("run", 0),
            moduleId=raw_sample.get("moduleId", ""),
            inputDataHash=raw_sample.get("inputDataHash", 0),
            executionTime=raw_sample.get("executionTime", 0.0),
            memoryUsageMb=raw_sample.get("memoryUsageMb", 0.0),
            memoryUsed=raw_sample.get("memoryUsed", 0),
            wasmMemoryBytes=raw_sample.get("wasmMemoryBytes", 0),
            resultHash=raw_sample.get("resultHash", 0),
            timestamp=raw_sample.get("timestamp", 0),
            jsHeapBefore=raw_sample.get("jsHeapBefore", 0),
            jsHeapAfter=raw_sample.get("jsHeapAfter", 0),
            success=raw_sample.get("success", False),
            implementation=raw_sample.get("implementation", ""),
            resultDimensions=raw_sample.get("resultDimensions"),
            recordsProcessed=raw_sample.get("recordsProcessed"),
        )
        samples.append(sample)

    return samples


def _group_task_results_for_comparison(task_results: List[TaskResult]) -> Dict[Tuple[str, str], Dict[str, TaskResult]]:
    """Group task results by (task, scale) and then by language for comparison."""
    groups = {}

    for task_result in task_results:
        group_key = (task_result.task, task_result.scale)
        if group_key not in groups:
            groups[group_key] = {}

        groups[group_key][task_result.language.lower()] = task_result

    return groups


def _comparison_result_to_dict(result: ComparisonResult) -> Dict[str, Any]:
    """Convert ComparisonResult object to dictionary for JSON serialization."""
    return {
        "task": result.task,
        "scale": result.scale,
        "rust_stats": {
            "sample_count": result.rust_stats.count,
            "mean_execution_time": result.rust_stats.mean,
            "std_execution_time": result.rust_stats.std,
            "coefficient_variation": result.rust_stats.coefficient_variation,
            "median_execution_time": result.rust_stats.median,
            "q1_execution_time": result.rust_stats.q1,
            "q3_execution_time": result.rust_stats.q3,
            "min_execution_time": result.rust_stats.min,
            "max_execution_time": result.rust_stats.max,
        },
        "tinygo_stats": {
            "sample_count": result.tinygo_stats.count,
            "mean_execution_time": result.tinygo_stats.mean,
            "std_execution_time": result.tinygo_stats.std,
            "coefficient_variation": result.tinygo_stats.coefficient_variation,
            "median_execution_time": result.tinygo_stats.median,
            "q1_execution_time": result.tinygo_stats.q1,
            "q3_execution_time": result.tinygo_stats.q3,
            "min_execution_time": result.tinygo_stats.min,
            "max_execution_time": result.tinygo_stats.max,
        },
        "t_test": {
            "t_statistic": result.t_test.t_statistic,
            "p_value": result.t_test.p_value,
            "degrees_freedom": result.t_test.degrees_freedom,
            "is_significant": result.t_test.is_significant,
            "confidence_interval": [result.t_test.confidence_interval_lower, result.t_test.confidence_interval_upper],
        },
        "effect_size": {
            "cohens_d": result.effect_size.cohens_d,
            "magnitude": result.effect_size.effect_size.value,
            "interpretation": result.effect_size.interpretation,
            "meets_minimum_detectable_effect": result.effect_size.meets_minimum_detectable_effect,
        },
        "confidence_level": result.confidence_level,
    }


def _generate_summary_statistics(comparison_results: List[ComparisonResult]) -> Dict[str, Any]:
    """Generate summary statistics across all comparisons."""
    if not comparison_results:
        return {}

    significant_results = [r for r in comparison_results if r.t_test.is_significant]
    large_effects = [r for r in comparison_results if r.effect_size.effect_size.value == "large"]

    rust_faster = [r for r in comparison_results if r.rust_stats.mean < r.tinygo_stats.mean]
    tinygo_faster = [r for r in comparison_results if r.tinygo_stats.mean < r.rust_stats.mean]

    return {
        "total_comparisons": len(comparison_results),
        "significant_differences": len(significant_results),
        "large_effect_sizes": len(large_effects),
        "significance_rate": len(significant_results) / len(comparison_results) if comparison_results else 0,
        "rust_faster_count": len(rust_faster),
        "tinygo_faster_count": len(tinygo_faster),
        "performance_advantage": {
            "rust": len(rust_faster) / len(comparison_results) if comparison_results else 0,
            "tinygo": len(tinygo_faster) / len(comparison_results) if comparison_results else 0,
        },
    }


def _print_analysis_summary(comparison_results: List[ComparisonResult], output_dir: Path) -> None:
    """Print comprehensive analysis summary."""
    print("\n📈 Statistical Analysis Summary:")
    print(f"   • Total Comparisons: {len(comparison_results)}")

    if not comparison_results:
        print("   • No statistical comparisons completed")
        return

    significant_results = [r for r in comparison_results if r.t_test.is_significant]
    large_effects = [r for r in comparison_results if r.effect_size.effect_size.value == "large"]

    rust_faster = [r for r in comparison_results if r.rust_stats.mean < r.tinygo_stats.mean]
    tinygo_faster = [r for r in comparison_results if r.tinygo_stats.mean < r.rust_stats.mean]

    print(f"   • Significant Differences: {len(significant_results)} ({len(significant_results) / len(comparison_results) * 100:.1f}%)")
    print(f"   • Large Effect Sizes: {len(large_effects)} ({len(large_effects) / len(comparison_results) * 100:.1f}%)")
    print("   • Performance Distribution:")
    print(f"     - Rust Faster: {len(rust_faster)} tasks ({len(rust_faster) / len(comparison_results) * 100:.1f}%)")
    print(f"     - TinyGo Faster: {len(tinygo_faster)} tasks ({len(tinygo_faster) / len(comparison_results) * 100:.1f}%)")

    print(f"\n📁 Results saved in {output_dir}")

    # Highlight significant findings
    if significant_results:
        print("\n🔍 Significant Performance Differences Found:")
        for result in significant_results[:5]:  # Show top 5
            faster_lang = "Rust" if result.rust_stats.mean < result.tinygo_stats.mean else "TinyGo"
            print(f"   • {result.task}_{result.scale}: {faster_lang} significantly faster (p={result.t_test.p_value:.4f})")


if __name__ == "__main__":
    main()
