"""
Statistical analysis module for WebAssembly benchmark performance comparison.

Implements Welch's t-test, Cohen's d effect size calculation, and confidence intervals
for engineering-grade statistical comparison between Rust and TinyGo implementations.
"""

import math
from typing import Dict, List, Tuple

from scipy.stats import t as t_dist

from .data_models import (
    CleanedDataset,
    ComparisonResult,
    EffectSize,
    EffectSizeResult,
    StatisticalResult,
    StatisticsConfiguration,
    TaskResult,
    TTestResult,
)


class Statistics:
    """Statistical analysis engine for benchmark performance comparison"""

    def __init__(
        self, cleaned_dataset: CleanedDataset, stats_config: StatisticsConfiguration
    ):
        """
        Initialize statistical analysis with cleaned data and configuration.

        Args:
            cleaned_dataset: Quality-controlled benchmark data
            stats_config: Statistical analysis configuration parameters
        """
        self.dataset = cleaned_dataset
        self.config = stats_config
        self.alpha = self.config.significance_alpha
        self.confidence_level = self.config.confidence_level
        self.effect_thresholds = self.config.effect_size_thresholds
        self.minimum_detectable_effect = self.config.minimum_detectable_effect

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
        """
        # Calculate sample statistics for both groups
        n1, mean1, var1 = self._calculate_sample_stats(group1)
        n2, mean2, var2 = self._calculate_sample_stats(group2)

        if n1 < 2 or n2 < 2:
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
        t_statistic = self._calculate_welch_t_statistic(
            mean1, mean2, var1, var2, n1, n2
        )

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
        """
        # Calculate sample statistics for both groups
        n1, mean1, var1 = self._calculate_sample_stats(group1)
        n2, mean2, var2 = self._calculate_sample_stats(group2)

        if n1 < 2 or n2 < 2:
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

        # Generate interpretation text with minimum detectable effect assessment
        abs_d = abs(cohens_d_value)

        # Assess practical significance relative to minimum detectable effect
        meets_mde = abs_d >= self.minimum_detectable_effect
        mde_status = "exceeds" if meets_mde else "below"

        # Generate detailed interpretation combining effect size and MDE assessment
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

        # Add minimum detectable effect context
        mde_interpretation = f" Effect size {mde_status} minimum detectable threshold (MDE={self.minimum_detectable_effect:.3f})"

        # Combine interpretations with practical significance assessment
        if meets_mde:
            practical_assessment = (
                " - Practically significant for engineering decisions"
            )
        else:
            practical_assessment = (
                " - May lack practical significance for engineering decisions"
            )

        interpretation = base_interpretation + mde_interpretation + practical_assessment

        return EffectSizeResult(
            cohens_d=cohens_d_value,
            effect_size=effect_size,
            pooled_std=pooled_std,
            magnitude=abs_d,
            interpretation=interpretation,
            meets_minimum_detectable_effect=meets_mde,
        )

    def _calculate_complete_statistics(self, data: List[float]) -> StatisticalResult:
        """
        Calculate complete descriptive statistics for a dataset.

        Args:
            data: Performance data samples

        Returns:
            StatisticalResult: Complete statistical measures
        """
        if not data:
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

        # Sort data for percentile calculations
        sorted_data = sorted(data)
        n = len(sorted_data)

        # Basic statistics
        count = n
        mean = sum(data) / n
        min_val = sorted_data[0]
        max_val = sorted_data[-1]

        # Standard deviation
        if n == 1:
            std = 0.0
            coefficient_variation = 0.0
        else:
            variance = sum((x - mean) ** 2 for x in data) / (n - 1)
            std = math.sqrt(variance)
            coefficient_variation = std / mean if abs(mean) > 1e-9 else 0.0

        # Median (50th percentile)
        if n % 2 == 0:
            median = (sorted_data[n // 2 - 1] + sorted_data[n // 2]) / 2
        else:
            median = sorted_data[n // 2]

        # First quartile (25th percentile)
        q1_index = 0.25 * (n - 1)
        q1_lower = int(q1_index)
        q1_frac = q1_index - q1_lower

        if q1_lower + 1 < n:
            q1 = sorted_data[q1_lower] + q1_frac * (
                sorted_data[q1_lower + 1] - sorted_data[q1_lower]
            )
        else:
            q1 = sorted_data[q1_lower]

        # Third quartile (75th percentile)
        q3_index = 0.75 * (n - 1)
        q3_lower = int(q3_index)
        q3_frac = q3_index - q3_lower

        if q3_lower + 1 < n:
            q3 = sorted_data[q3_lower] + q3_frac * (
                sorted_data[q3_lower + 1] - sorted_data[q3_lower]
            )
        else:
            q3 = sorted_data[q3_lower]

        # Interquartile range
        iqr = q3 - q1

        return StatisticalResult(
            count=count,
            mean=mean,
            std=std,
            min=min_val,
            max=max_val,
            median=median,
            q1=q1,
            q3=q3,
            iqr=iqr,
            coefficient_variation=coefficient_variation,
        )

    def _calculate_descriptive_stats(self) -> Dict[str, StatisticalResult]:
        """
        Calculate descriptive statistics for all task-language combinations.

        Returns:
            Dict[str, StatisticalResult]: Statistical results by task-language combination
        """
        results = {}

        for task_result in self.dataset.task_results:
            # Extract execution times from successful samples only
            execution_times = [
                sample.executionTime for sample in task_result.samples if sample.success
            ]

            # Generate unique key for this task-language-scale combination
            key = f"{task_result.task}_{task_result.language}_{task_result.scale}"

            # Calculate complete statistics
            results[key] = self._calculate_complete_statistics(execution_times)

        return results

    def _calculate_sample_stats(self, data: List[float]) -> Tuple[int, float, float]:
        """
        Calculate basic sample statistics: sample size, mean, and variance.

        This is a lightweight version for use in t-tests and effect size calculations.

        Args:
            data: Performance data samples

        Returns:
            Tuple[int, float, float]: (n, mean, variance)
        """
        if not data:
            return 0, 0.0, 0.0

        n = len(data)
        mean = sum(data) / n

        if n == 1:
            variance = 0.0
        else:
            variance = sum((x - mean) ** 2 for x in data) / (n - 1)  # Sample variance

        return n, mean, variance

    def _calculate_welch_t_statistic(
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
            return 1.0

        s1_squared_over_n1 = var1 / n1
        s2_squared_over_n2 = var2 / n2

        numerator = (s1_squared_over_n1 + s2_squared_over_n2) ** 2
        denominator = (s1_squared_over_n1**2) / (n1 - 1) + (
            s2_squared_over_n2**2
        ) / (n2 - 1)

        if denominator == 0:
            return 1.0

        return numerator / denominator

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
            return 1.0

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
        # Calculate sample statistics for both groups
        n1, mean1, var1 = self._calculate_sample_stats(group1)
        n2, mean2, var2 = self._calculate_sample_stats(group2)

        if n1 < 2 or n2 < 2:
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

    def calculate_task_comparison(
        self, rust_result: TaskResult, tinygo_result: TaskResult
    ) -> ComparisonResult:
        """
        Perform complete statistical comparison between Rust and TinyGo for a specific task.

        Args:
            rust_result: Rust implementation results
            tinygo_result: TinyGo implementation results

        Returns:
            ComparisonResult: Comprehensive statistical comparison
        """
        # Extract execution times from successful samples only
        rust_times = [
            sample.executionTime for sample in rust_result.samples if sample.success
        ]
        tinygo_times = [
            sample.executionTime for sample in tinygo_result.samples if sample.success
        ]

        # Calculate descriptive statistics for both languages
        rust_stats = self._calculate_complete_statistics(rust_times)
        tinygo_stats = self._calculate_complete_statistics(tinygo_times)

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
    """Command-line interface for statistical analysis"""
    # TODO: Parse command-line arguments for input files and configuration
    # TODO: Load and validate benchmark data
    # TODO: Initialize statistical analysis engine
    # TODO: Perform analysis and generate results
    # TODO: Output analysis results and recommendations

    pass


if __name__ == "__main__":
    main()
