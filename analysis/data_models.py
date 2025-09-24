"""
Data models and schemas for WebAssembly benchmark analysis pipeline.

Defines standardized data structures for benchmark results, quality control
metrics, statistical analysis results, and pipeline configuration management.
"""

from dataclasses import dataclass, field
from enum import Enum
from functools import cached_property
from typing import Any, Optional


class DataQuality(Enum):
    """Data quality assessment levels"""

    VALID = "valid"
    WARNING = "warning"
    INVALID = "invalid"


class EffectSize(Enum):
    """Cohen's d effect size classifications"""

    NEGLIGIBLE = "negligible"
    SMALL = "small"
    MEDIUM = "medium"
    LARGE = "large"


class MetricType(Enum):
    """Performance metric type enumeration for type safety"""

    EXECUTION_TIME = "execution_time"
    MEMORY_USAGE = "memory_usage"

    @classmethod
    def from_string(cls, metric_str: str) -> "MetricType":
        """Convert string to MetricType with validation"""
        for metric in cls:
            if metric.value == metric_str:
                return metric
        raise ValueError(
            f"Invalid metric: {metric_str}. Valid options: {[m.value for m in cls]}"
        )


class RecommendationLevel(Enum):
    """Recommendation confidence levels"""

    STRONG = "strong"
    MODERATE = "moderate"
    WEAK = "weak"
    NEUTRAL = "neutral"
    TRADEOFF = "tradeoff"


class SignificanceCategory(Enum):
    """Statistical significance categories"""

    STRONG_EVIDENCE = "Strong evidence"
    STATISTICALLY_SIGNIFICANT_BUT_SMALL_EFFECT = (
        "Statistically significant but small effect"
    )
    LARGE_EFFECT_BUT_NOT_STATISTICALLY_CONFIRMED = (
        "Large effect but not statistically confirmed"
    )
    NO_SIGNIFICANT_DIFFERENCE = "No significant difference"


@dataclass
class QCConfiguration:
    """Quality Control configuration parameters"""

    max_coefficient_variation: float
    outlier_iqr_multiplier: float
    min_valid_samples: int
    failure_rate: float
    quality_invalid_threshold: float
    quality_warning_threshold: float


@dataclass
class StatisticsConfiguration:
    """Statistical Analysis configuration parameters"""

    confidence_level: float
    significance_alpha: float
    effect_size_thresholds: dict[str, float]
    minimum_detectable_effect: float


@dataclass
class PlotsConfiguration:
    """Plotting and visualization configuration parameters"""

    dpi_basic: int
    dpi_detailed: int
    output_format: str
    figure_sizes: dict[str, list[int]]
    font_sizes: dict[str, int]
    color_scheme: dict[str, str]


@dataclass
class ValidationConfiguration:
    """Simplified validation configuration for engineering reliability"""

    # Core validation settings
    required_success_rate: float = 0.95
    hash_tolerance: float = 1e-8

    # Quick mode controls
    sample_limit: int = 100


@dataclass
class ConsistencyResult:
    """
    Structured consistency validation result
    """
    is_consistent: bool
    issues: list[str]
    confidence_level: float = 1.0


@dataclass
class ConfigurationData:
    """Complete configuration data containing all specialized configurations"""

    qc: QCConfiguration
    statistics: StatisticsConfiguration
    plots: PlotsConfiguration
    validation: ValidationConfiguration


@dataclass
class BenchmarkSample:
    """Single benchmark execution sample"""

    task: str
    language: str
    scale: str
    run: int
    repetition: int  # Add repetition field for tracking experimental replicates
    moduleId: str
    inputDataHash: int
    executionTime: float
    memoryUsageMb: float
    memoryUsed: int
    wasmMemoryBytes: int
    resultHash: int
    timestamp: int
    jsHeapBefore: int
    jsHeapAfter: int
    success: bool
    implementation: str
    resultDimensions: Optional[list[int]] = None
    recordsProcessed: Optional[int] = None


@dataclass
class BenchmarkResult:
    """Top-level benchmark result containing multiple execution results"""

    benchmark: str
    success: bool
    samples: list[BenchmarkSample]
    timestamp: str
    duration: int
    id: str


@dataclass
class RawBenchmarkData:
    """Raw benchmark data as loaded from JSON files"""

    summary: dict[str, Any]
    results: list[BenchmarkResult]
    file_path: str
    load_timestamp: str


@dataclass
class TaskResult:
    """Aggregated results for a specific task-language-scale combination"""

    task: str
    language: str
    scale: str
    samples: list[BenchmarkSample]
    successful_runs: int
    failed_runs: int
    success_rate: float


@dataclass
class CleanedDataset:
    """Dataset after quality control and cleaning"""

    task_results: list[TaskResult]
    removed_outliers: list[BenchmarkSample]
    cleaning_log: list[str]


@dataclass
class QualityMetrics:
    """Quality control metrics for dataset validation"""

    sample_count: int
    mean_execution_time: float
    std_execution_time: float
    coefficient_variation: float
    outlier_count: int
    outlier_rate: float
    success_rate: float
    data_quality: DataQuality
    quality_issues: list[str]


@dataclass
class QualityAssessment:
    quality_summary: Optional[dict[str, QualityMetrics]]
    overall_quality: DataQuality
    quality_reason: str
    quality_stats: dict[str, int]


@dataclass
class TTestResult:
    """Results from Welch's t-test statistical comparison"""

    t_statistic: float
    p_value: float
    degrees_freedom: float
    confidence_interval_lower: float
    confidence_interval_upper: float
    mean_difference: float
    is_significant: bool
    alpha: float


@dataclass
class EffectSizeResult:
    """Cohen's d effect size calculation results"""

    cohens_d: float
    effect_size: EffectSize
    pooled_std: float
    magnitude: float
    interpretation: str
    meets_minimum_detectable_effect: bool


@dataclass
class StatisticalResult:
    """Basic statistical measures for a dataset"""

    count: int
    mean: float
    std: float
    min: float
    max: float
    median: float
    q1: float
    q3: float
    iqr: float
    coefficient_variation: float


@dataclass
class PerformanceStatistics:
    """Container for multiple performance metric statistics for comprehensive analysis"""

    execution_time: StatisticalResult
    memory_usage: StatisticalResult
    success_rate: float
    sample_count: int = field(init=False)

    def __post_init__(self):
        """Validate data after initialization"""
        if not 0.0 <= self.success_rate <= 1.0:
            raise ValueError(
                f"success_rate must be between 0.0 and 1.0, got {self.success_rate}"
            )

        # Set sample_count from execution_time stats for consistency
        self.sample_count = self.execution_time.count

        # Validate consistency between metrics
        if self.execution_time.count != self.memory_usage.count:
            raise ValueError(
                f"Sample count mismatch: execution_time={self.execution_time.count}, memory_usage={self.memory_usage.count}"
            )

    def is_reliable(self, min_success_rate: float = 0.8) -> bool:
        """
        Check if the performance data is reliable based on success rate.

        Args:
            min_success_rate: Minimum acceptable success rate (default: 80%)

        Returns:
            bool: True if success rate meets reliability threshold
        """
        return self.success_rate >= min_success_rate

    def get_metric_stats(self, metric_type: MetricType) -> StatisticalResult:
        """
        Get statistics for a specific metric type with type safety.

        Args:
            metric_type: The metric type to retrieve

        Returns:
            StatisticalResult: Statistics for the requested metric

        Raises:
            ValueError: If metric_type is not supported
        """
        if metric_type == MetricType.EXECUTION_TIME:
            return self.execution_time
        elif metric_type == MetricType.MEMORY_USAGE:
            return self.memory_usage
        else:
            raise ValueError(f"Unsupported metric type: {metric_type}")


@dataclass
class MetricComparison:
    """Statistical comparison results for a specific performance metric"""

    metric_type: MetricType
    rust_stats: StatisticalResult
    tinygo_stats: StatisticalResult
    t_test: TTestResult
    effect_size: EffectSizeResult

    @property
    def is_significant(self) -> bool:
        """Check if the comparison shows statistical significance"""
        return self.t_test.is_significant

    @property
    def practical_significance(self) -> bool:
        """Check if the comparison shows practical significance (medium+ effect size)"""
        return self.effect_size.effect_size in [EffectSize.MEDIUM, EffectSize.LARGE]

    @property
    def significance_category(self) -> SignificanceCategory:
        """Get significance category for this comparison"""
        if self.is_significant and self.practical_significance:
            return SignificanceCategory.STRONG_EVIDENCE
        elif self.is_significant and not self.practical_significance:
            return SignificanceCategory.STATISTICALLY_SIGNIFICANT_BUT_SMALL_EFFECT
        elif not self.is_significant and self.practical_significance:
            return SignificanceCategory.LARGE_EFFECT_BUT_NOT_STATISTICALLY_CONFIRMED
        else:
            return SignificanceCategory.NO_SIGNIFICANT_DIFFERENCE


@dataclass
class ComparisonResult:
    """
    Complete statistical comparison between two language implementations across multiple metrics.

    Provides comprehensive performance analysis including execution time, memory usage,
    and reliability metrics with statistical significance testing and effect size analysis.
    """

    task: str
    scale: str
    rust_performance: PerformanceStatistics
    tinygo_performance: PerformanceStatistics
    execution_time_comparison: MetricComparison
    memory_usage_comparison: MetricComparison
    confidence_level: str

    @property
    def execution_time_winner(self) -> Optional[str]:
        """
        Determine the execution time performance winner based on statistical and practical significance.

        Returns:
            Optional[str]: "rust" or "tinygo" if there's a significant winner, None if no clear winner
        """
        # Require both statistical significance AND practical significance for a clear winner
        if not (
            self.execution_time_comparison.is_significant
            and self.execution_time_comparison.practical_significance
        ):
            return None

        rust_mean = self.rust_performance.execution_time.mean
        tinygo_mean = self.tinygo_performance.execution_time.mean

        return "rust" if rust_mean < tinygo_mean else "tinygo"

    @property
    def memory_usage_winner(self) -> Optional[str]:
        """
        Determine the memory usage efficiency winner based on statistical and practical significance.

        Returns:
            Optional[str]: "rust" or "tinygo" if there's a significant winner, None if no clear winner
        """
        # Require both statistical significance AND practical significance for a clear winner
        if not (
            self.memory_usage_comparison.is_significant
            and self.memory_usage_comparison.practical_significance
        ):
            return None

        rust_mean = self.rust_performance.memory_usage.mean
        tinygo_mean = self.tinygo_performance.memory_usage.mean

        return "rust" if rust_mean < tinygo_mean else "tinygo"

    def get_metric_comparison(self, metric_type: MetricType) -> MetricComparison:
        """
        Get the MetricComparison object for a specific performance metric.

        Args:
            metric_type: The metric type to retrieve comparison for

        Returns:
            MetricComparison: Corresponding comparison results

        Raises:
            ValueError: If metric_type is not supported
        """
        if metric_type == MetricType.EXECUTION_TIME:
            return self.execution_time_comparison
        elif metric_type == MetricType.MEMORY_USAGE:
            return self.memory_usage_comparison
        else:
            raise ValueError(f"Unsupported metric type: {metric_type}")

    @cached_property
    def _execution_significance(self) -> str:
        """Cached execution time significance level"""
        return self.execution_time_comparison.significance_category.value

    @cached_property
    def _memory_significance(self) -> str:
        """Cached memory usage significance level"""
        return self.memory_usage_comparison.significance_category.value

    @cached_property
    def recommendation_level(self) -> RecommendationLevel:
        """Get the recommendation confidence level"""
        exec_winner = self.execution_time_winner
        mem_winner = self.memory_usage_winner

        if exec_winner == mem_winner and exec_winner is not None:
            return RecommendationLevel.STRONG
        elif (
            exec_winner != mem_winner
            and exec_winner is not None
            and mem_winner is not None
        ):
            return RecommendationLevel.TRADEOFF
        elif exec_winner is not None or mem_winner is not None:
            # Check if the single winner has strong evidence
            sig_level = (
                self._execution_significance
                if exec_winner
                else self._memory_significance
            )
            return (
                RecommendationLevel.MODERATE
                if sig_level == "Strong evidence"
                else RecommendationLevel.WEAK
            )
        else:
            return RecommendationLevel.NEUTRAL

    @property
    def overall_recommendation(self) -> str:
        """
        Generate overall language recommendation based on both performance metrics.
        Considers both statistical significance and practical significance for robust decisions.

        Returns:
            str: Overall recommendation considering execution time and memory usage
        """
        exec_winner = self.execution_time_winner
        mem_winner = self.memory_usage_winner
        level = self.recommendation_level

        if level == RecommendationLevel.STRONG:
            return f"🔥 Strong recommendation: {exec_winner} (consistent winner in both metrics)"

        elif level == RecommendationLevel.MODERATE:
            winner = exec_winner or mem_winner
            advantage = "performance" if exec_winner else "memory"
            return (
                f"👍 Moderate recommendation: {winner} (strong {advantage} advantage)"
            )

        elif level == RecommendationLevel.WEAK:
            winner = exec_winner or mem_winner
            advantage = "performance" if exec_winner else "memory"
            sig_level = (
                self._execution_significance
                if exec_winner
                else self._memory_significance
            )
            return f"🤔 Weak recommendation: {winner} ({advantage} advantage, {sig_level.lower()})"

        elif level == RecommendationLevel.TRADEOFF:
            return f"⚖️ Trade-off decision: {exec_winner} for speed vs {mem_winner} for memory"

        else:  # NEUTRAL
            # Check for statistical-only differences
            has_minor_differences = (
                self.execution_time_comparison.is_significant
                and not self.execution_time_comparison.practical_significance
            ) or (
                self.memory_usage_comparison.is_significant
                and not self.memory_usage_comparison.practical_significance
            )

            if has_minor_differences:
                return "🤔 No clear winner - differences exist but are too small to matter practically"
            else:
                return "⚖️ No clear winner - choose based on team expertise and project requirements"

    def is_reliable(self) -> bool:
        """
        Check if both language implementations have reliable performance data.

        Returns:
            bool: True if both Rust and TinyGo have reliable success rates
        """
        return (
            self.rust_performance.is_reliable()
            and self.tinygo_performance.is_reliable()
        )


@dataclass
class ValidationResult:
    """Benchmark implementation validation results"""

    task: str
    scale: str
    rust_hash: int
    tinygo_hash: int
    rust_dimensions: Optional[list[int]]
    tinygo_dimensions: Optional[list[int]]
    rust_records: Optional[int]
    tinygo_records: Optional[int]
    validation_passed: bool
    validation_issues: list[str]

    @property
    def hash_match(self) -> bool:
        """Computed property for hash comparison"""
        return self.rust_hash == self.tinygo_hash

    @property
    def dimensions_match(self) -> bool:
        """Computed property for dimensions comparison"""
        return self.rust_dimensions == self.tinygo_dimensions

    @property
    def records_match(self) -> bool:
        """Computed property for records comparison"""
        return self.rust_records == self.tinygo_records
