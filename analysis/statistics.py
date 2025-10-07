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
from typing import Any

from scipy.stats import t as t_dist

from . import common
from .data_models import (
    BenchmarkSample,
    CleanedDataset,
    ComparisonResult,
    EffectSize,
    EffectSizeResult,
    MetricComparison,
    MetricType,
    PerformanceStatistics,
    StatisticalResult,
    StatisticsConfiguration,
    TaskResult,
    TTestResult,
)

# Statistical constants
MINIMUM_SAMPLES_FOR_TEST = 2
COEFFICIENT_VARIATION_THRESHOLD = 1e-9
DEFAULT_POOLED_STD = 1.0
FALLBACK_DEGREES_FREEDOM = 1.0

# Quartile percentiles
FIRST_QUARTILE = 0.25
THIRD_QUARTILE = 0.75


CLEANED_DATASET_PATH = Path("reports/qc/cleaned_dataset.json")
STATS_PATH = Path("reports/statistics/")


class StatisticalAnalysis:
    """Statistical analysis engine for benchmark performance comparison"""

    def __init__(self, stats_config: StatisticsConfiguration):
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

    def welch_t_test(self, group1: list[float], group2: list[float]) -> TTestResult:
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
        n1, mean1, var1 = self._get_basic_stats(group1)
        n2, mean2, var2 = self._get_basic_stats(group2)

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

    def cohens_d(self, group1: list[float], group2: list[float]) -> EffectSizeResult:
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
        n1, mean1, var1 = self._get_basic_stats(group1)
        n2, mean2, var2 = self._get_basic_stats(group2)

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
        self, group1: list[float], group2: list[float], method_name: str
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
                not isinstance(value, int | float)
                or math.isnan(value)
                or math.isinf(value)
            ):
                raise ValueError(
                    f"{method_name}: group1[{i}] contains invalid numeric value: {value}"
                )

        for i, value in enumerate(group2):
            if (
                not isinstance(value, int | float)
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

    def _calculate_median_from_sorted(self, sorted_data: list[float]) -> float:
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
        self, data: list[float]
    ) -> tuple[int, float, float]:
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

    def _calculate_quartiles(self, sorted_data: list[float]) -> tuple[float, float]:
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

    def _get_basic_stats(self, data: list[float]) -> tuple[int, float, float]:
        """
        Get basic statistics using Welford's algorithm for numerical stability.

        Args:
            data: Performance data samples

        Returns:
            Tuple[int, float, float]: (n, mean, variance)
        """
        return self._calculate_basic_stats_welford(data)

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
        self, group1: list[float], group2: list[float]
    ) -> tuple[float, float]:
        """
        Calculate confidence interval for the difference in means using accurate t-distribution.

        Args:
            group1: Performance data for first group
            group2: Performance data for second group

        Returns:
            Tuple[float, float]: (lower_bound, upper_bound) of confidence interval
        """
        # Calculate sample statistics for both groups with caching
        n1, mean1, var1 = self._get_basic_stats(group1)
        n2, mean2, var2 = self._get_basic_stats(group2)

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

        Supports multi-metric analysis including execution time and memory usage
        with separate statistical testing for each performance dimension.

        Args:
            rust_result: Rust implementation results
            tinygo_result: TinyGo implementation results

        Returns:
            ComparisonResult: Comprehensive multi-metric statistical comparison

        Raises:
            TypeError: If inputs are not TaskResult objects
            ValueError: If task results are incompatible for comparison
        """
        # Validate inputs
        self._validate_task_results(rust_result, tinygo_result)

        # Extract and analyze performance data
        rust_performance, tinygo_performance = self._extract_performance_data(
            rust_result, tinygo_result
        )

        # Perform statistical comparisons
        execution_time_comparison, memory_usage_comparison = (
            self._perform_metric_comparisons(rust_result, tinygo_result)
        )

        # Generate overall confidence assessment
        confidence_level = self._generate_confidence_level(
            execution_time_comparison, memory_usage_comparison
        )

        return ComparisonResult(
            task=rust_result.task,
            scale=rust_result.scale,
            rust_performance=rust_performance,
            tinygo_performance=tinygo_performance,
            execution_time_comparison=execution_time_comparison,
            memory_usage_comparison=memory_usage_comparison,
            confidence_level=confidence_level,
        )

    def _validate_task_results(
        self, rust_result: TaskResult, tinygo_result: TaskResult
    ) -> None:
        """
        Validate that TaskResult objects are compatible for comparison.

        Args:
            rust_result: Rust implementation results
            tinygo_result: TinyGo implementation results

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

    def _extract_performance_data(
        self, rust_result: TaskResult, tinygo_result: TaskResult
    ) -> tuple[PerformanceStatistics, PerformanceStatistics]:
        """
        Extract and compute performance statistics for both languages.

        Optimized single-pass extraction of all performance metrics.

        Args:
            rust_result: Rust implementation results
            tinygo_result: TinyGo implementation results

        Returns:
            Tuple of PerformanceStatistics for (Rust, TinyGo)
        """
        # Single-pass extraction for Rust
        rust_exec_times, rust_memory_usage = self._extract_metrics_from_samples(
            rust_result.samples
        )
        rust_exec_stats = self._calculate_complete_stats(rust_exec_times)
        rust_memory_stats = self._calculate_complete_stats(rust_memory_usage)

        # Single-pass extraction for TinyGo
        tinygo_exec_times, tinygo_memory_usage = self._extract_metrics_from_samples(
            tinygo_result.samples
        )
        tinygo_exec_stats = self._calculate_complete_stats(tinygo_exec_times)
        tinygo_memory_stats = self._calculate_complete_stats(tinygo_memory_usage)

        # Create PerformanceStatistics containers
        rust_performance = PerformanceStatistics(
            execution_time=rust_exec_stats,
            memory_usage=rust_memory_stats,
            success_rate=rust_result.success_rate,
        )

        tinygo_performance = PerformanceStatistics(
            execution_time=tinygo_exec_stats,
            memory_usage=tinygo_memory_stats,
            success_rate=tinygo_result.success_rate,
        )

        return rust_performance, tinygo_performance

    def _extract_metrics_from_samples(
        self, samples: list[BenchmarkSample]
    ) -> tuple[list[float], list[float]]:
        """
        Single-pass extraction of execution time and memory usage from samples.

        Performance optimization: Extract both metrics in one iteration.

        Args:
            samples: List of benchmark samples

        Returns:
            Tuple of (execution_times, memory_usage) lists
        """
        exec_times = []
        memory_usage = []

        for sample in samples:
            exec_times.append(sample.executionTime)
            # Convert memory usage to KB (from bytes)
            memory_usage.append((sample.memoryUsed + sample.wasmMemoryBytes) / 1024)

        return exec_times, memory_usage

    def _perform_metric_comparisons(
        self, rust_result: TaskResult, tinygo_result: TaskResult
    ) -> tuple[MetricComparison, MetricComparison]:
        """
        Perform statistical comparisons for all performance metrics.

        Args:
            rust_result: Rust implementation results
            tinygo_result: TinyGo implementation results

        Returns:
            Tuple of MetricComparison for (execution_time, memory_usage)
        """
        # Extract metrics for statistical comparison
        rust_exec_times, rust_memory_usage = self._extract_metrics_from_samples(
            rust_result.samples
        )
        tinygo_exec_times, tinygo_memory_usage = self._extract_metrics_from_samples(
            tinygo_result.samples
        )

        # Execution time statistical analysis
        exec_time_comparison = self._create_metric_comparison(
            MetricType.EXECUTION_TIME, rust_exec_times, tinygo_exec_times
        )

        # Memory usage statistical analysis
        memory_usage_comparison = self._create_metric_comparison(
            MetricType.MEMORY_USAGE, rust_memory_usage, tinygo_memory_usage
        )

        return exec_time_comparison, memory_usage_comparison

    def _calculate_complete_stats(self, data: list[float]) -> StatisticalResult:
        """
        Calculate complete descriptive statistics using in-memory processing.

        Args:
            data: Performance data samples

        Returns:
            StatisticalResult: Complete statistical measures
        """
        if not data:
            return self._empty_statistical_result()

        return self._calculate_complete_stats_memory(data)

    def _calculate_complete_stats_optimized_summary(
        self, comparison_results: list[ComparisonResult]
    ) -> dict[str, Any]:
        """
        Generate summary statistics using single-pass optimization for all metrics.

        Replaces multiple filtering operations with a single iteration through all results.

        Args:
            comparison_results: List of comparison results to summarize

        Returns:
            Dict containing optimized summary statistics
        """
        if not comparison_results:
            return {}

        # Initialize counters for single-pass processing
        counters = {
            "exec_significant": 0,
            "memory_significant": 0,
            "both_significant": 0,
            "exec_large_effects": 0,
            "memory_large_effects": 0,
            "exec_rust_faster": 0,
            "memory_rust_efficient": 0,
            "strong_recommendations": 0,
            "reliable_results": 0,
            "exec_only_significant": 0,
            "memory_only_significant": 0,
        }

        total = len(comparison_results)

        # Single pass through all comparison results
        for result in comparison_results:
            # Execution time analysis
            exec_sig = result.execution_time_comparison.is_significant
            exec_large = (
                result.execution_time_comparison.effect_size.effect_size.value
                == "large"
            )
            exec_rust_faster = (
                result.rust_performance.execution_time.mean
                < result.tinygo_performance.execution_time.mean
            )

            # Memory usage analysis
            memory_sig = result.memory_usage_comparison.is_significant
            memory_large = (
                result.memory_usage_comparison.effect_size.effect_size.value == "large"
            )
            memory_rust_efficient = (
                result.rust_performance.memory_usage.mean
                < result.tinygo_performance.memory_usage.mean
            )

            # Overall assessment
            strong_rec = result.recommendation_level.value == "strong"
            reliable = result.is_reliable()

            # Update counters
            if exec_sig:
                counters["exec_significant"] += 1
            if memory_sig:
                counters["memory_significant"] += 1
            if exec_sig and memory_sig:
                counters["both_significant"] += 1
            if exec_large:
                counters["exec_large_effects"] += 1
            if memory_large:
                counters["memory_large_effects"] += 1
            if exec_rust_faster:
                counters["exec_rust_faster"] += 1
            if memory_rust_efficient:
                counters["memory_rust_efficient"] += 1
            if strong_rec:
                counters["strong_recommendations"] += 1
            if reliable:
                counters["reliable_results"] += 1
            if exec_sig and not memory_sig:
                counters["exec_only_significant"] += 1
            if memory_sig and not exec_sig:
                counters["memory_only_significant"] += 1

        # Calculate rates
        def safe_rate(count: int) -> float:
            return count / total if total > 0 else 0

        return {
            "total_comparisons": total,
            # Execution time metrics
            "execution_time_analysis": {
                "significant_differences": counters["exec_significant"],
                "large_effect_sizes": counters["exec_large_effects"],
                "significance_rate": safe_rate(counters["exec_significant"]),
                "rust_faster_count": counters["exec_rust_faster"],
                "tinygo_faster_count": total - counters["exec_rust_faster"],
                "rust_advantage_rate": safe_rate(counters["exec_rust_faster"]),
            },
            # Memory usage metrics
            "memory_usage_analysis": {
                "significant_differences": counters["memory_significant"],
                "large_effect_sizes": counters["memory_large_effects"],
                "significance_rate": safe_rate(counters["memory_significant"]),
                "rust_efficient_count": counters["memory_rust_efficient"],
                "tinygo_efficient_count": total - counters["memory_rust_efficient"],
                "rust_advantage_rate": safe_rate(counters["memory_rust_efficient"]),
            },
            # Overall assessment
            "overall_assessment": {
                "strong_recommendations": counters["strong_recommendations"],
                "reliable_comparisons": counters["reliable_results"],
                "reliability_rate": safe_rate(counters["reliable_results"]),
            },
            # Cross-metric consistency
            "consistency_analysis": {
                "both_metrics_significant": counters["both_significant"],
                "execution_only_significant": counters["exec_only_significant"],
                "memory_only_significant": counters["memory_only_significant"],
            },
        }

    def _calculate_complete_stats_memory(self, data: list[float]) -> StatisticalResult:
        """
        Calculate complete descriptive statistics with optimized in-memory processing.

        Performance optimizations:
        - Single pass for basic statistics using Welford's algorithm
        - Single sort for all percentile calculations
        - Reuse sorted data for min/max operations

        Args:
            data: Performance data samples

        Returns:
            StatisticalResult: Complete statistical measures
        """
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

    def _create_metric_comparison(
        self, metric_type: MetricType, rust_data: list[float], tinygo_data: list[float]
    ) -> MetricComparison:
        """
        Create MetricComparison with complete statistical analysis.

        Args:
            metric_type: Type of performance metric being compared
            rust_data: Rust performance data
            tinygo_data: TinyGo performance data

        Returns:
            MetricComparison with t-test and effect size analysis
        """
        # Statistical analysis
        t_test_result = self.welch_t_test(rust_data, tinygo_data)
        effect_size_result = self.cohens_d(rust_data, tinygo_data)

        # Calculate statistics for both datasets
        rust_stats = self._calculate_complete_stats(rust_data)
        tinygo_stats = self._calculate_complete_stats(tinygo_data)

        return MetricComparison(
            metric_type=metric_type,
            rust_stats=rust_stats,
            tinygo_stats=tinygo_stats,
            t_test=t_test_result,
            effect_size=effect_size_result,
        )

    def _generate_confidence_level(
        self, exec_comparison: MetricComparison, memory_comparison: MetricComparison
    ) -> str:
        """
        Generate confidence level based on the strongest evidence across metrics.

        Args:
            exec_comparison: Execution time comparison results
            memory_comparison: Memory usage comparison results

        Returns:
            str: Overall confidence level assessment
        """
        # Check for strong evidence in either metric
        exec_strong = (
            exec_comparison.is_significant and exec_comparison.practical_significance
        )
        memory_strong = (
            memory_comparison.is_significant
            and memory_comparison.practical_significance
        )

        # Check for statistical significance only
        exec_stat_only = (
            exec_comparison.is_significant
            and not exec_comparison.practical_significance
        )
        memory_stat_only = (
            memory_comparison.is_significant
            and not memory_comparison.practical_significance
        )

        # Check for practical significance only
        exec_practical_only = (
            not exec_comparison.is_significant
            and exec_comparison.practical_significance
        )
        memory_practical_only = (
            not memory_comparison.is_significant
            and memory_comparison.practical_significance
        )

        if exec_strong or memory_strong:
            # At least one metric has strong evidence
            if exec_strong and memory_strong:
                return "Very High"
            elif (
                exec_comparison.effect_size.effect_size == EffectSize.LARGE
                or memory_comparison.effect_size.effect_size == EffectSize.LARGE
            ):
                return "High"
            else:
                return "Medium-High"
        elif (
            exec_stat_only
            or memory_stat_only
            or exec_practical_only
            or memory_practical_only
        ):
            # Some evidence but not conclusive
            return "Medium"
        else:
            # Weak or no evidence
            return "Low"


def main():
    """Main function for standalone execution of statistical analysis."""
    args = common.setup_analysis_cli(
        "Statistical analysis for WebAssembly benchmark performance comparison"
    )

    try:
        _execute_statistical_analysis_pipeline(quick_mode=args.quick)
    except Exception as e:
        common.handle_critical_error(f"Statistical analysis pipeline error: {e}")


def _execute_statistical_analysis_pipeline(quick_mode: bool = False) -> None:
    """Execute the complete statistical analysis pipeline with proper error handling."""
    # Setup using common utilities
    common.print_analysis_header(
        "WebAssembly Benchmark Statistical Analysis", quick_mode
    )
    output_dir = common.setup_output_directory("statistics")

    # Note: For now, statistics.py uses cleaned dataset from QC, so no quick mode data loading needed
    input_path = Path("reports/qc/cleaned_dataset.json")

    # Step 1: Load configuration
    print("🔧 Loading statistical analysis configuration...")
    stats_config = _load_statistics_config(quick_mode)

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
    _save_comparison_results(comparison_results, output_dir, stats_engine)

    # Step 6: Print summary
    _print_analysis_summary(comparison_results, output_dir)

    print("\n✅ Statistical analysis pipeline completed successfully!")


def _load_statistics_config(quick_mode: bool = False) -> StatisticsConfiguration:
    """
    Load statistical analysis configuration.

    Returns:
        StatisticsConfiguration object with loaded parameters
    """
    config_parser = common.load_configuration(quick_mode)
    return config_parser.get_stats_config()


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

        with open(input_path) as f:
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
            cleaning_log=cleaning_log,
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
    except OSError as e:
        print(f"❌ Error reading {input_path}: {e}")
        sys.exit(1)


def _perform_comparisons(
    dataset: CleanedDataset, stats_engine: StatisticalAnalysis
) -> list[ComparisonResult]:
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
                print(
                    f"⚠️ Skipping {task}_{scale}: Missing Rust or TinyGo implementation"
                )
                continue

            # Perform statistical comparison
            print(f"📊 Comparing {task}_{scale}: Rust vs TinyGo...")
            comparison_result = stats_engine.generate_task_comparison(
                rust_result, tinygo_result
            )
            comparison_results.append(comparison_result)

            # Log comparison summary
            exec_effect = comparison_result.execution_time_comparison.effect_size
            memory_effect = comparison_result.memory_usage_comparison.effect_size
            print(
                f"  ✓ Execution time effect: {exec_effect.effect_size.value} (d={exec_effect.cohens_d:.3f})"
            )
            print(
                f"  ✓ Memory usage effect: {memory_effect.effect_size.value} (d={memory_effect.cohens_d:.3f})"
            )

        except Exception as e:
            print(f"❌ Error comparing {task}_{scale}: {e}")
            continue

    print(f"✅ Completed {len(comparison_results)} statistical comparisons")
    return comparison_results


def _save_comparison_results(
    comparison_results: list[ComparisonResult],
    output_dir: Path,
    stats_engine: StatisticalAnalysis,
) -> None:
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
                _comparison_result_to_dict(result, compact=True)
                for result in comparison_results
            ],
            "summary_statistics": stats_engine._calculate_complete_stats_optimized_summary(
                comparison_results
            ),
        }

        # Save main statistical report
        report_path = output_dir / "statistical_analysis_report.json"
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(statistical_report, f, indent=2, ensure_ascii=False)
        print(f"✅ Statistical analysis report saved to {report_path}")

        # Save individual comparison results for detailed analysis
        for result in comparison_results:
            result_filename = (
                f"comparison_{result.task}_{result.scale}_rust_vs_tinygo.json"
            )
            result_path = output_dir / result_filename

            detailed_result = _comparison_result_to_dict(
                result, compact=False
            )  # Keep full detail for individual files
            with open(result_path, "w", encoding="utf-8") as f:
                json.dump(detailed_result, f, indent=2, ensure_ascii=False)

        print(f"✅ Saved {len(comparison_results)} individual comparison files")

    except OSError as e:
        print(f"❌ Error saving comparison results: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error during save operation: {e}")
        sys.exit(1)


def _validate_cleaned_dataset_structure(raw_data: dict[str, Any]) -> None:
    """Validate that the loaded JSON has the expected structure."""
    required_fields = ["task_results", "cleaning_log"]
    for field in required_fields:
        if field not in raw_data:
            raise ValueError(f"Missing required field '{field}' in cleaned dataset")

    if not isinstance(raw_data["task_results"], list):
        raise ValueError("Field 'task_results' must be a list")


def _convert_raw_task_results(
    raw_task_results: list[dict[str, Any]],
) -> list[TaskResult]:
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
            success_rate=raw_result.get("success_rate", 0.0),
        )
        task_results.append(task_result)

    return task_results


def _convert_raw_samples(raw_samples: list[dict[str, Any]]) -> list[BenchmarkSample]:
    """Convert raw sample data to BenchmarkSample objects."""
    samples = []
    for raw_sample in raw_samples:
        sample = BenchmarkSample(
            task=raw_sample.get("task", ""),
            language=raw_sample.get("language", ""),
            scale=raw_sample.get("scale", ""),
            run=raw_sample.get("run", 0),
            repetition=raw_sample.get(
                "repetition", 1
            ),  # Extract repetition field, default to 1
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


def _group_task_results_for_comparison(
    task_results: list[TaskResult],
) -> dict[tuple[str, str], dict[str, TaskResult]]:
    """Group task results by (task, scale) and then by language for comparison."""
    groups = {}

    for task_result in task_results:
        group_key = (task_result.task, task_result.scale)
        if group_key not in groups:
            groups[group_key] = {}

        groups[group_key][task_result.language.lower()] = task_result

    return groups


def _comparison_result_to_dict(
    result: ComparisonResult, compact: bool = False
) -> dict[str, Any]:
    """
    Convert ComparisonResult object to dictionary for JSON serialization with optional compression.

    Args:
        result: ComparisonResult object to serialize
        compact: If True, reduce verbosity by ~60% while preserving key information

    Returns:
        Dict containing serialized comparison result
    """
    if compact:
        return _comparison_result_to_dict_compact(result)

    return _comparison_result_to_dict_full(result)


def _comparison_result_to_dict_compact(result: ComparisonResult) -> dict[str, Any]:
    """Compact JSON representation with ~60% size reduction."""

    def _compact_stats(stats):
        """Extract essential statistics only."""
        return {
            "count": stats.count,
            "mean": round(stats.mean, 4),
            "std": round(stats.std, 4),
            "coefficient_variation": round(stats.coefficient_variation, 4),
            "median": round(stats.median, 4),
            "range": [round(stats.min, 4), round(stats.max, 4)],
        }

    def _compact_test(test_result):
        """Extract essential test statistics."""
        return {
            "t_statistic": round(test_result.t_statistic, 4),
            "p_value": round(test_result.p_value, 6),
            "significant": test_result.is_significant,
            "confidence_interval": [
                round(test_result.confidence_interval_lower, 4),
                round(test_result.confidence_interval_upper, 4),
            ],
        }

    def _compact_effect(effect_result):
        """Extract essential effect size information."""
        return {
            "cohens_d": round(effect_result.cohens_d, 4),
            "magnitude": effect_result.effect_size.value,
            "meets_minimum_detectable_effect": effect_result.meets_minimum_detectable_effect,
        }

    return {
        "task": result.task,
        "scale": result.scale,
        # Compact performance data
        "rust": {
            "execution_time": _compact_stats(result.rust_performance.execution_time),
            "memory_usage": _compact_stats(result.rust_performance.memory_usage),
            "success_rate": round(result.rust_performance.success_rate, 3),
        },
        "tinygo": {
            "execution_time": _compact_stats(result.tinygo_performance.execution_time),
            "memory_usage": _compact_stats(result.tinygo_performance.memory_usage),
            "success_rate": round(result.tinygo_performance.success_rate, 3),
        },
        # Compact statistical comparisons
        "execution_time_comparison": {
            "test": _compact_test(result.execution_time_comparison.t_test),
            "effect": _compact_effect(result.execution_time_comparison.effect_size),
            "category": result.execution_time_comparison.significance_category.value,
        },
        "memory_usage_comparison": {
            "test": _compact_test(result.memory_usage_comparison.t_test),
            "effect": _compact_effect(result.memory_usage_comparison.effect_size),
            "category": result.memory_usage_comparison.significance_category.value,
        },
        # Essential conclusions
        "confidence_level": result.confidence_level,
        "recommendation_level": result.recommendation_level.value,
        "recommendation": result.overall_recommendation,
        "winners": {
            "execution_time": result.execution_time_winner,
            "memory_usage": result.memory_usage_winner,
        },
        "reliable": result.is_reliable(),
    }


def _comparison_result_to_dict_full(result: ComparisonResult) -> dict[str, Any]:
    """Full verbose JSON representation for detailed analysis."""
    return {
        "task": result.task,
        "scale": result.scale,
        # Performance statistics for both languages
        "rust_performance": {
            "execution_time": {
                "sample_count": result.rust_performance.execution_time.count,
                "mean": result.rust_performance.execution_time.mean,
                "std": result.rust_performance.execution_time.std,
                "coefficient_variation": result.rust_performance.execution_time.coefficient_variation,
                "median": result.rust_performance.execution_time.median,
                "q1": result.rust_performance.execution_time.q1,
                "q3": result.rust_performance.execution_time.q3,
                "min": result.rust_performance.execution_time.min,
                "max": result.rust_performance.execution_time.max,
            },
            "memory_usage": {
                "sample_count": result.rust_performance.memory_usage.count,
                "mean": result.rust_performance.memory_usage.mean,
                "std": result.rust_performance.memory_usage.std,
                "coefficient_variation": result.rust_performance.memory_usage.coefficient_variation,
                "median": result.rust_performance.memory_usage.median,
                "q1": result.rust_performance.memory_usage.q1,
                "q3": result.rust_performance.memory_usage.q3,
                "min": result.rust_performance.memory_usage.min,
                "max": result.rust_performance.memory_usage.max,
            },
            "success_rate": result.rust_performance.success_rate,
            "sample_count": result.rust_performance.sample_count,
        },
        "tinygo_performance": {
            "execution_time": {
                "sample_count": result.tinygo_performance.execution_time.count,
                "mean": result.tinygo_performance.execution_time.mean,
                "std": result.tinygo_performance.execution_time.std,
                "coefficient_variation": result.tinygo_performance.execution_time.coefficient_variation,
                "median": result.tinygo_performance.execution_time.median,
                "q1": result.tinygo_performance.execution_time.q1,
                "q3": result.tinygo_performance.execution_time.q3,
                "min": result.tinygo_performance.execution_time.min,
                "max": result.tinygo_performance.execution_time.max,
            },
            "memory_usage": {
                "sample_count": result.tinygo_performance.memory_usage.count,
                "mean": result.tinygo_performance.memory_usage.mean,
                "std": result.tinygo_performance.memory_usage.std,
                "coefficient_variation": result.tinygo_performance.memory_usage.coefficient_variation,
                "median": result.tinygo_performance.memory_usage.median,
                "q1": result.tinygo_performance.memory_usage.q1,
                "q3": result.tinygo_performance.memory_usage.q3,
                "min": result.tinygo_performance.memory_usage.min,
                "max": result.tinygo_performance.memory_usage.max,
            },
            "success_rate": result.tinygo_performance.success_rate,
            "sample_count": result.tinygo_performance.sample_count,
        },
        # Statistical comparisons by metric
        "execution_time_comparison": {
            "metric_type": result.execution_time_comparison.metric_type.value,
            "t_test": {
                "t_statistic": result.execution_time_comparison.t_test.t_statistic,
                "p_value": result.execution_time_comparison.t_test.p_value,
                "degrees_freedom": result.execution_time_comparison.t_test.degrees_freedom,
                "is_significant": result.execution_time_comparison.t_test.is_significant,
                "confidence_interval": [
                    result.execution_time_comparison.t_test.confidence_interval_lower,
                    result.execution_time_comparison.t_test.confidence_interval_upper,
                ],
            },
            "effect_size": {
                "cohens_d": result.execution_time_comparison.effect_size.cohens_d,
                "magnitude": result.execution_time_comparison.effect_size.effect_size.value,
                "interpretation": result.execution_time_comparison.effect_size.interpretation,
                "meets_minimum_detectable_effect": result.execution_time_comparison.effect_size.meets_minimum_detectable_effect,
            },
            "significance_category": result.execution_time_comparison.significance_category.value,
            "is_significant": result.execution_time_comparison.is_significant,
            "practical_significance": result.execution_time_comparison.practical_significance,
        },
        "memory_usage_comparison": {
            "metric_type": result.memory_usage_comparison.metric_type.value,
            "t_test": {
                "t_statistic": result.memory_usage_comparison.t_test.t_statistic,
                "p_value": result.memory_usage_comparison.t_test.p_value,
                "degrees_freedom": result.memory_usage_comparison.t_test.degrees_freedom,
                "is_significant": result.memory_usage_comparison.t_test.is_significant,
                "confidence_interval": [
                    result.memory_usage_comparison.t_test.confidence_interval_lower,
                    result.memory_usage_comparison.t_test.confidence_interval_upper,
                ],
            },
            "effect_size": {
                "cohens_d": result.memory_usage_comparison.effect_size.cohens_d,
                "magnitude": result.memory_usage_comparison.effect_size.effect_size.value,
                "interpretation": result.memory_usage_comparison.effect_size.interpretation,
                "meets_minimum_detectable_effect": result.memory_usage_comparison.effect_size.meets_minimum_detectable_effect,
            },
            "significance_category": result.memory_usage_comparison.significance_category.value,
            "is_significant": result.memory_usage_comparison.is_significant,
            "practical_significance": result.memory_usage_comparison.practical_significance,
        },
        # Overall assessment
        "confidence_level": result.confidence_level,
        "recommendation_level": result.recommendation_level.value,
        "overall_recommendation": result.overall_recommendation,
        "execution_time_winner": result.execution_time_winner,
        "memory_usage_winner": result.memory_usage_winner,
        "is_reliable": result.is_reliable(),
    }


def _print_analysis_summary(
    comparison_results: list[ComparisonResult], output_dir: Path
) -> None:
    """Print comprehensive multi-metric analysis summary."""
    print("\n📈 Multi-Metric Statistical Analysis Summary:")
    print(f"   • Total Comparisons: {len(comparison_results)}")

    if not comparison_results:
        print("   • No statistical comparisons completed")
        return

    # Execution time analysis
    exec_significant = [
        r for r in comparison_results if r.execution_time_comparison.is_significant
    ]
    exec_large_effects = [
        r
        for r in comparison_results
        if r.execution_time_comparison.effect_size.effect_size.value == "large"
    ]
    exec_rust_faster = [
        r
        for r in comparison_results
        if r.rust_performance.execution_time.mean
        < r.tinygo_performance.execution_time.mean
    ]

    # Memory usage analysis
    memory_significant = [
        r for r in comparison_results if r.memory_usage_comparison.is_significant
    ]
    memory_large_effects = [
        r
        for r in comparison_results
        if r.memory_usage_comparison.effect_size.effect_size.value == "large"
    ]
    memory_rust_efficient = [
        r
        for r in comparison_results
        if r.rust_performance.memory_usage.mean < r.tinygo_performance.memory_usage.mean
    ]

    # Overall recommendations
    strong_recommendations = [
        r for r in comparison_results if r.recommendation_level.value == "strong"
    ]
    reliable_results = [r for r in comparison_results if r.is_reliable()]

    print("\n⚡ Execution Time Analysis:")
    print(
        f"   • Significant Differences: {len(exec_significant)} ({len(exec_significant) / len(comparison_results) * 100:.1f}%)"
    )
    print(
        f"   • Large Effect Sizes: {len(exec_large_effects)} ({len(exec_large_effects) / len(comparison_results) * 100:.1f}%)"
    )
    print(
        f"   • Rust Faster: {len(exec_rust_faster)} tasks ({len(exec_rust_faster) / len(comparison_results) * 100:.1f}%)"
    )

    print("\n💾 Memory Usage Analysis:")
    print(
        f"   • Significant Differences: {len(memory_significant)} ({len(memory_significant) / len(comparison_results) * 100:.1f}%)"
    )
    print(
        f"   • Large Effect Sizes: {len(memory_large_effects)} ({len(memory_large_effects) / len(comparison_results) * 100:.1f}%)"
    )
    print(
        f"   • Rust More Efficient: {len(memory_rust_efficient)} tasks ({len(memory_rust_efficient) / len(comparison_results) * 100:.1f}%)"
    )

    print("\n🎯 Overall Assessment:")
    print(
        f"   • Strong Recommendations: {len(strong_recommendations)} ({len(strong_recommendations) / len(comparison_results) * 100:.1f}%)"
    )
    print(
        f"   • Reliable Results: {len(reliable_results)} ({len(reliable_results) / len(comparison_results) * 100:.1f}%)"
    )

    print(f"\n📁 Results saved in {output_dir}")

    # Highlight significant findings for execution time
    if exec_significant:
        print("\n🔍 Significant Execution Time Differences:")
        for result in exec_significant[:3]:  # Show top 3
            faster_lang = result.execution_time_winner or "unclear"
            print(
                f"   • {result.task}_{result.scale}: {faster_lang} significantly faster (p={result.execution_time_comparison.t_test.p_value:.4f})"
            )

    # Highlight significant findings for memory usage
    if memory_significant:
        print("\n💾 Significant Memory Usage Differences:")
        for result in memory_significant[:3]:  # Show top 3
            efficient_lang = result.memory_usage_winner or "unclear"
            print(
                f"   • {result.task}_{result.scale}: {efficient_lang} significantly more efficient (p={result.memory_usage_comparison.t_test.p_value:.4f})"
            )

    # Show strong recommendations
    if strong_recommendations:
        print("\n🔥 Strong Language Recommendations:")
        for result in strong_recommendations[:3]:
            print(f"   • {result.task}_{result.scale}: {result.overall_recommendation}")


if __name__ == "__main__":
    main()
