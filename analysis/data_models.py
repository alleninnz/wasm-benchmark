"""
Data models and schemas for WebAssembly benchmark analysis pipeline.

Defines standardized data structures for benchmark results, quality control
metrics, statistical analysis results, and pipeline configuration management.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional


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


@dataclass
class BenchmarkSample:
    """Single benchmark execution sample"""

    task: str
    language: str
    scale: str
    run: int
    execution_time: float
    memory_usage_mb: float
    wasm_memory_bytes: int
    result_hash: int
    input_data_hash: int
    timestamp: int
    success: bool
    js_heap_before: Optional[int] = None
    js_heap_after: Optional[int] = None
    # Task-specific fields
    result_dimensions: Optional[List[int]] = None
    records_processed: Optional[int] = None


@dataclass
class TaskResult:
    """Aggregated results for a specific task-language-scale combination"""

    task: str
    language: str
    scale: str
    samples: List[BenchmarkSample]
    successful_runs: int
    failed_runs: int
    timeout_runs: int
    success_rate: float


@dataclass
class QualityMetrics:
    """Quality control metrics for dataset validation"""

    sample_count: int
    mean_execution_time: float
    std_execution_time: float
    coefficient_variation: float
    outlier_count: int
    outlier_rate: float
    timeout_rate: float
    success_rate: float
    data_quality: DataQuality
    quality_issues: List[str]


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


@dataclass
class ComparisonResult:
    """Complete statistical comparison between two language implementations"""

    task: str
    scale: str
    rust_stats: StatisticalResult
    tinygo_stats: StatisticalResult
    t_test: TTestResult
    effect_size: EffectSizeResult
    rust_quality: Optional[QualityMetrics]
    tinygo_quality: Optional[QualityMetrics]
    overall_quality: DataQuality
    recommendation: str
    confidence_level: str


@dataclass
class ValidationResult:
    """Benchmark implementation validation results"""

    task: str
    scale: str
    rust_hash: int
    tinygo_hash: int
    hash_match: bool
    rust_dimensions: Optional[List[int]]
    tinygo_dimensions: Optional[List[int]]
    dimensions_match: bool
    rust_records: Optional[int]
    tinygo_records: Optional[int]
    records_match: bool
    validation_passed: bool
    validation_issues: List[str]


@dataclass
class DecisionMetrics:
    """Decision support metrics for language selection"""

    confidence_emoji: str
    confidence_description: str
    recommendation_text: str
    statistical_significance: bool
    practical_significance: bool
    quality_sufficient: bool
    decision_confidence: float


@dataclass
class QCConfiguration:
    """Quality Control configuration parameters"""

    max_coefficient_variation: float
    outlier_iqr_multiplier: float
    min_valid_samples: int
    max_timeout_rate: float


@dataclass
class StatisticsConfiguration:
    """Statistical Analysis configuration parameters"""

    confidence_level: float
    significance_alpha: float
    effect_size_thresholds: Dict[str, float]
    minimum_detectable_effect: float


@dataclass
class PlotsConfiguration:
    """Plotting and visualization configuration parameters"""

    dpi_basic: int
    dpi_detailed: int
    output_format: str
    figure_size_basic: List[int]
    figure_size_detailed: List[int]
    font_sizes: Dict[str, int]
    color_scheme: Dict[str, str]


@dataclass
class ConfigurationData:
    """Complete configuration data containing all specialized configurations"""

    qc: QCConfiguration
    statistics: StatisticsConfiguration
    plots: PlotsConfiguration


@dataclass
class CleanedDataset:
    """Dataset after quality control and cleaning"""

    task_results: List[TaskResult]
    removed_outliers: List[BenchmarkSample]
    quality_summary: Dict[str, QualityMetrics]
    overall_quality: DataQuality
    cleaning_log: List[str]


@dataclass
class AnalysisReport:
    """Complete analysis report with all results"""

    experiment_name: str
    analysis_timestamp: str
    configuration: ConfigurationData
    cleaned_data: CleanedDataset
    comparisons: List[ComparisonResult]
    validations: List[ValidationResult]
    summary_statistics: Dict[str, Any]
    recommendations: Dict[str, DecisionMetrics]
    plots_generated: List[str]
    analysis_quality: DataQuality


@dataclass
class RawBenchmarkData:
    """Raw benchmark data as loaded from JSON files"""

    summary: Dict[str, Any]
    results: List[Dict[str, Any]]
    file_path: str
    load_timestamp: str
