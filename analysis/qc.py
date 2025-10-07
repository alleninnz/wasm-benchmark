"""
Quality control module for WebAssembly benchmark data validation and cleaning.

Implements IQR-based outlier detection, coefficient of variation validation,
and data quality assessment with configurable engineering-grade thresholds.
"""

import json
import math
import sys
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any

from . import common
from .data_models import (
    BenchmarkResult,
    BenchmarkSample,
    CleanedDataset,
    DataQuality,
    MetricQuality,
    QCConfiguration,
    QualityAssessment,
    QualityMetrics,
    TaskResult,
)


class QCConstants:
    """Constants for quality control operations."""

    # Percentiles for IQR calculation
    Q1_PERCENTILE = 0.25
    Q3_PERCENTILE = 0.75

    # Quality thresholds
    EXTREME_CV_MULTIPLIER = 2.0
    DIVISION_BY_ZERO_EPSILON = 1e-9
    MINIMUM_IQR_SAMPLES = 4

    # File patterns
    META_FILE_PATTERN = "meta"
    JSON_FILE_PATTERN = "*.json"

    # Output file names
    QC_REPORT_FILENAME = "quality_control_report.json"
    CLEANED_DATASET_FILENAME = "cleaned_dataset.json"

    # Report formatting
    TITLE_SEPARATOR = "=" * 60
    DEFAULT_JSON_INDENT = 2


class QualityController:
    """Data quality control and validation for benchmark analysis pipeline"""

    def __init__(
        self, benchmark_results: list[BenchmarkResult], qc_config: QCConfiguration
    ):
        """
        Initialize quality controller with benchmark results and configuration parameters.

        Args:
            benchmark_results: List of benchmark results to analyze
            qc_config: Quality control configuration parameters
        """
        self.benchmark_results = benchmark_results
        self.config = qc_config
        self.max_cv = self.config.max_coefficient_variation
        self.iqr_multiplier = self.config.outlier_iqr_multiplier
        self.min_samples = self.config.min_valid_samples
        self.failure_rate = self.config.failure_rate
        self.cleaning_log: list[str] = []

    def validate_and_clean(self) -> CleanedDataset:
        """
        Execute complete data quality validation and cleaning pipeline.

        Returns:
            CleanedDataset: Validated and cleaned benchmark data ready for analysis
        """
        self.cleaning_log.clear()
        self.cleaning_log.append(
            f"Starting quality control pipeline at {datetime.now().isoformat()}"
        )

        # Extract all samples from benchmark results
        all_samples = self._extract_all_samples()

        self.cleaning_log.append(
            f"Extracted {len(all_samples)} samples from {len(self.benchmark_results)} benchmark results"
        )

        # Group samples by task, language, and scale
        task_groups = self._group_samples_by_task(all_samples)

        self.cleaning_log.append(
            f"Grouped samples into {len(task_groups)} task-language-scale combinations"
        )

        # Process each group: validate counts, detect outliers, assess quality
        cleaned_task_results, all_removed_outliers = self._process_task_groups(
            task_groups
        )

        # Generate overall quality assessment summary
        total_outliers = len(all_removed_outliers)
        total_samples = len(all_samples)
        outlier_percentage = (
            (total_outliers / total_samples * 100) if total_samples > 0 else 0
        )

        self.cleaning_log.append("Quality control pipeline completed:")
        self.cleaning_log.append(f"  - Total samples processed: {total_samples}")
        self.cleaning_log.append(
            f"  - Total outliers removed: {total_outliers} ({outlier_percentage:.1f}%)"
        )
        self.cleaning_log.append(
            f"  - Task-language combinations: {len(cleaned_task_results)}"
        )
        # Add threshold information for transparency
        self.cleaning_log.append(
            f"  - Quality thresholds: invalid>{self.config.quality_invalid_threshold:.1%}, "
            f"warning>{self.config.quality_warning_threshold:.1%}"
        )

        return self._create_cleaned_dataset(cleaned_task_results, all_removed_outliers)

    def _extract_all_samples(self) -> list[BenchmarkSample]:
        """Extract all samples from benchmark results."""
        return [
            sample for result in self.benchmark_results for sample in result.samples
        ]

    def _group_samples_by_task(
        self, all_samples: list[BenchmarkSample]
    ) -> dict[tuple[str, str, str], list[BenchmarkSample]]:
        """Group samples by task, language, and scale combination."""
        task_groups: dict[tuple[str, str, str], list[BenchmarkSample]] = {}
        for sample in all_samples:
            key = (sample.task, sample.language, sample.scale)
            if key not in task_groups:
                task_groups[key] = []
            task_groups[key].append(sample)
        return task_groups

    def _process_task_groups(
        self, task_groups: dict[tuple[str, str, str], list[BenchmarkSample]]
    ) -> tuple[list[TaskResult], list[BenchmarkSample]]:
        """Process each task group to detect outliers and create task results."""
        cleaned_task_results = []
        all_removed_outliers = []

        for (task, language, scale), samples in task_groups.items():
            group_key = self._generate_group_key(task, language, scale)

            # Partition samples into successful and failed
            successful_samples, failed_samples = self._partition_samples_by_success(
                samples
            )
            successful_runs = len(successful_samples)
            failed_runs = len(failed_samples)

            # Validate sample counts meet minimum requirements
            if successful_runs < self.min_samples:
                self.cleaning_log.append(
                    f"Warning: {group_key} has only {successful_runs} successful samples "
                    f"(minimum: {self.min_samples})"
                )
                continue  # Skip groups with insufficient data

            # Detect and remove statistical outliers using IQR method
            cleaned_samples, outliers = self.detect_outliers(successful_samples)
            all_removed_outliers.extend(outliers)

            if outliers:
                self.cleaning_log.append(
                    f"Removed {len(outliers)} outliers from {group_key} "
                    f"({len(outliers) / len(successful_samples) * 100:.1f}% of successful samples)"
                )

            # Calculate total attempts for success rate
            total_attempts = len(cleaned_samples) + failed_runs

            # Create TaskResult with only clean samples
            task_result = TaskResult(
                task=task,
                language=language,
                scale=scale,
                samples=cleaned_samples,  # Only include clean, usable data
                successful_runs=len(cleaned_samples),
                failed_runs=failed_runs,
                success_rate=(
                    len(cleaned_samples) / total_attempts if total_attempts > 0 else 0.0
                ),
            )

            cleaned_task_results.append(task_result)

        return cleaned_task_results, all_removed_outliers

    def _partition_samples_by_success(
        self, samples: list[BenchmarkSample]
    ) -> tuple[list[BenchmarkSample], list[BenchmarkSample]]:
        """Partition samples into successful and failed lists in a single pass."""
        successful_samples = []
        failed_samples = []
        for sample in samples:
            if sample.success:
                successful_samples.append(sample)
            else:
                failed_samples.append(sample)
        return successful_samples, failed_samples

    def _generate_group_key(self, task: str, language: str, scale: str) -> str:
        """Generate consistent group key for task-language-scale combinations."""
        return f"{task}_{language}_{scale}"

    def _create_cleaned_dataset(
        self,
        cleaned_task_results: list[TaskResult],
        all_removed_outliers: list[BenchmarkSample],
    ) -> CleanedDataset:
        """Create the final cleaned dataset with summary statistics."""
        return CleanedDataset(
            task_results=cleaned_task_results,
            removed_outliers=all_removed_outliers,
            cleaning_log=self.cleaning_log.copy(),
        )

    def detect_outliers(
        self, samples: list[BenchmarkSample]
    ) -> tuple[list[BenchmarkSample], list[BenchmarkSample]]:
        """
        Detect statistical outliers using IQR method with configurable multiplier.

        IQR Method:
        - Calculate Q1 (25th percentile) and Q3 (75th percentile)
        - Compute IQR = Q3 - Q1
        - Outliers: values < Q1 - (multiplier × IQR) or > Q3 + (multiplier × IQR)

        Args:
            samples: List of benchmark samples for outlier detection

        Returns:
            Tuple[List[BenchmarkSample], List[BenchmarkSample]]: (cleaned_samples, outliers)
        """
        if not samples:
            return [], []

        # Extract execution times from successful samples only
        successful_samples = [sample for sample in samples if sample.success]

        if len(successful_samples) < QCConstants.MINIMUM_IQR_SAMPLES:
            self.cleaning_log.append(
                f"Insufficient samples for outlier detection: {len(successful_samples)} successful samples "
                f"(minimum: {QCConstants.MINIMUM_IQR_SAMPLES})"
            )
            return successful_samples, []

        # Extract execution times and sort for percentile calculation
        execution_times = [sample.executionTime for sample in successful_samples]
        execution_times.sort()

        # Calculate Q1 (25th percentile) and Q3 (75th percentile)
        n = len(execution_times)
        q1_index = int(QCConstants.Q1_PERCENTILE * (n - 1))
        q3_index = int(QCConstants.Q3_PERCENTILE * (n - 1))

        # Handle fractional indices with linear interpolation
        q1_frac = QCConstants.Q1_PERCENTILE * (n - 1) - q1_index
        q3_frac = QCConstants.Q3_PERCENTILE * (n - 1) - q3_index

        if q1_index + 1 < n:
            q1 = execution_times[q1_index] + q1_frac * (
                execution_times[q1_index + 1] - execution_times[q1_index]
            )
        else:
            q1 = execution_times[q1_index]

        if q3_index + 1 < n:
            q3 = execution_times[q3_index] + q3_frac * (
                execution_times[q3_index + 1] - execution_times[q3_index]
            )
        else:
            q3 = execution_times[q3_index]

        # Compute IQR and outlier thresholds
        iqr = q3 - q1
        lower_threshold = q1 - (self.iqr_multiplier * iqr)
        upper_threshold = q3 + (self.iqr_multiplier * iqr)

        # Classify samples as normal or outliers based on thresholds
        cleaned_samples = []
        outliers = []

        for sample in successful_samples:
            if (
                sample.executionTime < lower_threshold
                or sample.executionTime > upper_threshold
            ):
                outliers.append(sample)
            else:
                cleaned_samples.append(sample)

        # Log outlier detection statistics and reasoning
        if outliers:
            outlier_times = [sample.executionTime for sample in outliers]
            self.cleaning_log.append(
                f"IQR outlier detection: Q1={q1:.3f}ms, Q3={q3:.3f}ms, IQR={iqr:.3f}ms, "
                f"multiplier={self.iqr_multiplier}, thresholds=[{lower_threshold:.3f}, {upper_threshold:.3f}]ms"
            )
            self.cleaning_log.append(
                f"Detected {len(outliers)} outliers with execution times: "
                f"min={min(outlier_times):.3f}ms, max={max(outlier_times):.3f}ms"
            )

        return cleaned_samples, outliers

    def calculate_quality_metrics(self, task_result: TaskResult) -> QualityMetrics:
        """
        Calculate comprehensive quality metrics for a task-language combination.

        Args:
            task_result: Task results for quality assessment

        Returns:
            QualityMetrics: Detailed quality assessment with validation status
        """

        # Extract samples and counts
        sample_count = len(task_result.samples)
        failed_samples = task_result.failed_runs
        total_samples = sample_count + failed_samples
        success_rate = task_result.success_rate

        # Helper to compute basic stats for a numeric series
        def _compute_stats(values: list[float]) -> tuple[float, float, float]:
            if not values:
                return 0.0, 0.0, 0.0
            n = len(values)
            if n == 1:
                return values[0], 0.0, 0.0
            mean_v = sum(values) / n
            variance = sum((v - mean_v) ** 2 for v in values) / (n - 1)
            std_v = math.sqrt(variance)
            if abs(mean_v) < QCConstants.DIVISION_BY_ZERO_EPSILON:
                cv = 0.0
            else:
                cv = std_v / mean_v
            return mean_v, std_v, cv

        # Execution time stats
        execution_times = [sample.executionTime for sample in task_result.samples]
        (
            mean_exec,
            std_exec,
            cv_exec,
        ) = _compute_stats(execution_times)

        # Memory usage stats (MB)
        memory_values = [sample.memoryUsageMb for sample in task_result.samples]
        mean_mem, std_mem, cv_mem = _compute_stats(memory_values)

        # Failure / sample-based checks (shared)
        failure_rate = failed_samples / total_samples if total_samples > 0 else 0.0

        # Build per-metric issues and quality using similar rules for each metric
        def _assess_metric_quality(
            sample_count: int, cv: float, language: str, metric_name: str
        ) -> tuple[DataQuality, list[str]]:
            issues: list[str] = []
            quality = DataQuality.VALID
            if sample_count < self.config.min_valid_samples:
                issues.append(
                    f"Insufficient samples: {sample_count} < {self.config.min_valid_samples} (minimum required)"
                )
                quality = DataQuality.INVALID

            if failure_rate > self.config.failure_rate:
                issues.append(
                    f"High failure rate: {failure_rate:.1%} > {self.config.failure_rate:.1%} (maximum allowed)"
                )
                quality = DataQuality.INVALID

            # Determine thresholds from per-language configuration when present.
            warning_threshold = self.config.max_coefficient_variation
            extreme_cv_threshold = 1.0

            lang_key = language.lower() if isinstance(language, str) else None
            lang_thresholds = None
            if lang_key == "rust":
                lang_thresholds = self.config.rust_thresholds
            elif lang_key == "tinygo":
                lang_thresholds = self.config.tinygo_thresholds

            if lang_thresholds:
                if lang_thresholds.max_coefficient_variation is not None:
                    warning_threshold = float(lang_thresholds.max_coefficient_variation)
                if lang_thresholds.extreme_cv_threshold is not None:
                    extreme_cv_threshold = float(lang_thresholds.extreme_cv_threshold)

            if cv > extreme_cv_threshold:
                issues.append(
                    f"Extremely high variability: CV={cv:.3f} > {extreme_cv_threshold:.3f} (std > mean)"
                )
                quality = DataQuality.INVALID

            if quality != DataQuality.INVALID and cv > warning_threshold:
                issues.append(
                    f"High variability: CV={cv:.3f} > {warning_threshold:.3f} (threshold)"
                )
                quality = DataQuality.WARNING

            return quality, issues

        exec_quality, exec_issues = _assess_metric_quality(
            sample_count, cv_exec, task_result.language, "execution_time"
        )
        mem_quality, mem_issues = _assess_metric_quality(
            sample_count, cv_mem, task_result.language, "memory_usage"
        )

        # Unknown outliers are tracked elsewhere; set counts to 0 here for simplicity
        exec_metric = MetricQuality(
            sample_count=sample_count,
            mean=mean_exec,
            std=std_exec,
            coefficient_variation=cv_exec,
            outlier_count=0,
            outlier_rate=0.0,
            success_rate=success_rate,
            data_quality=exec_quality,
            quality_issues=exec_issues,
        )

        mem_metric = MetricQuality(
            sample_count=sample_count,
            mean=mean_mem,
            std=std_mem,
            coefficient_variation=cv_mem,
            outlier_count=0,
            outlier_rate=0.0,
            success_rate=success_rate,
            data_quality=mem_quality,
            quality_issues=mem_issues,
        )

        return QualityMetrics(execution_time=exec_metric, memory_usage=mem_metric)

    def calculate_overall_quality(
        self, task_results: list[TaskResult]
    ) -> QualityAssessment:
        """
        Calculate overall quality using layered threshold evaluation strategy.

        This method evaluates data quality based on the distribution of quality
        levels across all task-language-scale groups, using configurable thresholds
        for a more nuanced assessment than simple "one vote veto" approach.

        Args:
            task_results: List of TaskResult objects from cleaned dataset

        Returns:
            QualityAssessment: Overall quality assessment with reasoning and statistics
        """
        # Calculate quality metrics for each task-language-scale group
        quality_summary = {}
        for task_result in task_results:
            group_key = self._generate_group_key(
                task_result.task, task_result.language, task_result.scale
            )
            quality_metrics = self.calculate_quality_metrics(task_result)
            quality_summary[group_key] = quality_metrics

        if not quality_summary:
            return QualityAssessment(
                quality_summary=None,
                overall_quality=DataQuality.INVALID,
                quality_reason="No groups to evaluate",
                quality_stats={},
            )

        # Count groups by quality level
        total_groups = len(quality_summary)
        quality_counts = {
            DataQuality.INVALID: 0,
            DataQuality.WARNING: 0,
            DataQuality.VALID: 0,
        }

        # Use execution time only for group-level quality decisions.
        # - Each group's quality is set equal to the execution_time metric's quality.
        # - Memory usage is intentionally ignored at the group level to avoid
        #   penalizing groups for transient GC/noise in memory measurements.
        for metrics in quality_summary.values():
            exec_q = metrics.execution_time.data_quality
            group_quality = exec_q
            quality_counts[group_quality] += 1

        # Calculate ratios
        invalid_count = quality_counts[DataQuality.INVALID]
        warning_count = quality_counts[DataQuality.WARNING]
        valid_count = quality_counts[DataQuality.VALID]

        invalid_ratio = invalid_count / total_groups
        warning_ratio = warning_count / total_groups
        problem_ratio = (invalid_count + warning_count) / total_groups

        # Detailed statistics for reporting
        stats = {
            "total_groups": total_groups,
            "invalid_count": invalid_count,
            "warning_count": warning_count,
            "valid_count": valid_count,
            "invalid_ratio": invalid_ratio,
            "warning_ratio": warning_ratio,
            "problem_ratio": problem_ratio,
        }

        # Layered threshold evaluation
        if invalid_ratio > self.config.quality_invalid_threshold:
            reason = (
                f"Critical quality issues: {invalid_count}/{total_groups} groups are invalid "
                f"({invalid_ratio:.1%}, threshold: {self.config.quality_invalid_threshold:.1%})"
            )
            overall_quality = DataQuality.INVALID

        elif warning_ratio > self.config.quality_warning_threshold or invalid_count > 0:
            if invalid_count > 0:
                reason = f"Quality concerns: {invalid_count} invalid and {warning_count} warning groups need attention"
            else:
                reason = f"Quality concerns: {warning_count}/{total_groups} groups have warnings ({warning_ratio:.1%})"
            overall_quality = DataQuality.WARNING

        else:
            reason = f"Good quality: {valid_count} valid, {warning_count} warning, {invalid_count} invalid groups"
            overall_quality = DataQuality.VALID

        return QualityAssessment(
            quality_summary=quality_summary,
            overall_quality=overall_quality,
            quality_reason=reason,
            quality_stats=stats,
        )


def main():
    """Execute quality control analysis on benchmark data"""
    args = common.setup_analysis_cli(
        "Quality control analysis for WebAssembly benchmark data"
    )

    try:
        _execute_quality_control_pipeline(quick_mode=args.quick)
    except Exception as e:
        common.handle_critical_error(f"Quality control pipeline error: {e}")


def _execute_quality_control_pipeline(quick_mode: bool = False) -> None:
    """Execute the complete quality control pipeline with proper error handling."""
    # Setup using common utilities
    common.print_analysis_header(
        "WebAssembly Benchmark Quality Control Analysis", quick_mode
    )
    output_dir = common.setup_output_directory("qc")

    # Load benchmark data and configuration using common utilities
    latest_file, raw_data = common.load_latest_results(quick_mode)
    config_parser = common.load_configuration(quick_mode)
    qc_config = config_parser.get_qc_config()

    # Convert raw JSON data to structured data models
    benchmark_results = _convert_raw_data_to_benchmark_results(raw_data)

    # Initialize quality controller with simplified interface
    quality_controller = QualityController(benchmark_results, qc_config)

    # Execute quality control analysis
    cleaned_dataset, quality_assessment = _execute_quality_analysis(quality_controller)

    # Generate quality control report
    qc_report = _generate_qc_report(
        latest_file, qc_config, cleaned_dataset, quality_assessment
    )

    # Save reports with proper error handling
    _save_qc_report(output_dir, qc_report)
    _save_cleaned_dataset(output_dir, cleaned_dataset, quality_assessment)

    # Print summary and check quality status
    _print_quality_summary(quality_assessment, cleaned_dataset, output_dir)


def _convert_raw_data_to_benchmark_results(
    raw_data: dict[str, Any],
) -> list[BenchmarkResult]:
    """Convert raw JSON data to structured BenchmarkResult objects."""
    benchmark_results = []
    raw_results = raw_data.get("results", [])

    for result_data in raw_results:
        samples = _convert_raw_samples_to_benchmark_samples(result_data)

        # Create BenchmarkResult object
        benchmark_result = BenchmarkResult(
            benchmark=result_data.get("benchmark", ""),
            success=result_data.get("success", False),
            samples=samples,
            timestamp=result_data.get("timestamp", ""),
            duration=result_data.get("duration", 0),
            id=result_data.get("id", ""),
        )
        benchmark_results.append(benchmark_result)

    return benchmark_results


def _convert_raw_samples_to_benchmark_samples(
    result_data: dict[str, Any],
) -> list[BenchmarkSample]:
    """Convert raw sample data to BenchmarkSample objects."""
    samples = []
    results_data = result_data.get("results", [])

    # Handle nested structure: results -> [group] -> results -> [actual_samples]
    for group_data in results_data:
        if not isinstance(group_data, dict):
            continue

        # Extract task, language, scale from the group level
        task = group_data.get("task", "")
        language = group_data.get("language", "")
        scale = group_data.get("scale", "")

        # Get the inner results array containing actual execution samples
        inner_results = group_data.get("results", [])

        for sample_data in inner_results:
            if not isinstance(sample_data, dict):
                continue

            # Use group-level metadata for samples that don't have their own
            sample = BenchmarkSample(
                task=sample_data.get("task", task),
                language=sample_data.get("language", language),
                scale=sample_data.get("scale", scale),
                run=sample_data.get("run", 0),
                repetition=sample_data.get("repetition", 1),
                moduleId=sample_data.get("moduleId", ""),
                inputDataHash=sample_data.get("inputDataHash", 0),
                executionTime=sample_data.get("executionTime", 0.0),
                memoryUsageMb=sample_data.get("memoryUsageMb", 0.0),
                memoryUsed=sample_data.get("memoryUsed", 0),
                wasmMemoryBytes=sample_data.get("wasmMemoryBytes", 0),
                resultHash=sample_data.get("resultHash", 0),
                timestamp=sample_data.get("timestamp", 0),
                jsHeapBefore=sample_data.get("jsHeapBefore", 0),
                jsHeapAfter=sample_data.get("jsHeapAfter", 0),
                success=sample_data.get("success", False),
                implementation=sample_data.get("implementation", ""),
                resultDimensions=sample_data.get("resultDimensions"),
                recordsProcessed=sample_data.get("recordsProcessed"),
            )
            samples.append(sample)

    return samples


def _execute_quality_analysis(
    quality_controller: QualityController,
) -> tuple[CleanedDataset, QualityAssessment]:
    """Execute quality control analysis with proper error handling."""
    print("🔄 Executing quality control pipeline...")
    try:
        print("🔄 Validating and cleaning data...")
        cleaned_dataset = quality_controller.validate_and_clean()
        print("✅ Data cleaning completed")

        print("🔄 Calculating quality assessment...")
        quality_assessment = quality_controller.calculate_overall_quality(
            cleaned_dataset.task_results
        )
        print("✅ Quality assessment completed")
        return cleaned_dataset, quality_assessment

    except Exception as e:
        print(f"❌ Error during quality control: {e}")
        sys.exit(1)


def _generate_qc_report(
    latest_file: Path,
    qc_config: QCConfiguration,
    cleaned_dataset: CleanedDataset,
    quality_assessment: QualityAssessment,
) -> dict[str, Any]:
    """Generate comprehensive quality control report."""
    return {
        "timestamp": datetime.now().isoformat(),
        "input_file": str(latest_file),
        "configuration": {
            "max_cv": qc_config.max_coefficient_variation,
            "iqr_multiplier": qc_config.outlier_iqr_multiplier,
            "min_samples": qc_config.min_valid_samples,
            "failure_rate": qc_config.failure_rate,
            # Serialize dataclass instances to plain dicts for JSON compatibility
            "rust_thresholds": (
                asdict(qc_config.rust_thresholds)
                if qc_config.rust_thresholds is not None
                else None
            ),
            "tinygo_thresholds": (
                asdict(qc_config.tinygo_thresholds)
                if qc_config.tinygo_thresholds is not None
                else None
            ),
        },
        "data_summary": {
            "total_task_results": len(cleaned_dataset.task_results),
            "removed_outliers": len(cleaned_dataset.removed_outliers),
            "overall_quality": quality_assessment.overall_quality.value,
            "cleaning_operations": len(cleaned_dataset.cleaning_log),
        },
        "quality_metrics": _convert_quality_metrics_to_dict(quality_assessment),
        "cleaning_log": cleaned_dataset.cleaning_log,
        "quality_assessment": {
            "overall_quality": quality_assessment.overall_quality.value,
            "quality_reason": quality_assessment.quality_reason,
            "quality_statistics": quality_assessment.quality_stats,
        },
    }


def _convert_quality_metrics_to_dict(
    quality_assessment: QualityAssessment,
) -> dict[str, Any]:
    """Convert quality metrics to dictionary format for JSON serialization."""
    if not quality_assessment.quality_summary:
        return {}

    def _metric_to_dict(m):
        return {
            "sample_count": m.sample_count,
            "mean": m.mean,
            "std": m.std,
            "coefficient_variation": m.coefficient_variation,
            "outlier_count": m.outlier_count,
            "outlier_rate": m.outlier_rate,
            "success_rate": m.success_rate,
            "data_quality": m.data_quality.value,
            "quality_issues": m.quality_issues,
        }

    return {
        key: {
            "execution_time": _metric_to_dict(metrics.execution_time),
            "memory_usage": _metric_to_dict(metrics.memory_usage),
        }
        for key, metrics in quality_assessment.quality_summary.items()
    }


def _sample_to_dict(sample: BenchmarkSample) -> dict[str, Any]:
    """Convert BenchmarkSample to dictionary representation."""
    return {
        "task": sample.task,
        "language": sample.language,
        "scale": sample.scale,
        "run": sample.run,
        "repetition": sample.repetition,  # Include repetition field in output
        "executionTime": sample.executionTime,
        "memoryUsageMb": sample.memoryUsageMb,
        "wasmMemoryBytes": sample.wasmMemoryBytes,
        "resultHash": sample.resultHash,
        "inputDataHash": sample.inputDataHash,
        "timestamp": sample.timestamp,
        "success": sample.success,
        "jsHeapBefore": sample.jsHeapBefore,
        "jsHeapAfter": sample.jsHeapAfter,
        "resultDimensions": sample.resultDimensions,
        "recordsProcessed": sample.recordsProcessed,
    }


def _save_qc_report(output_dir: Path, qc_report: dict[str, Any]) -> None:
    """Save quality control report with proper error handling."""
    try:
        report_path = output_dir / QCConstants.QC_REPORT_FILENAME
        with open(report_path, "w") as f:
            json.dump(qc_report, f, indent=QCConstants.DEFAULT_JSON_INDENT)
        print(f"✅ Quality control report saved to {report_path}")
    except OSError as e:
        print(f"❌ Error saving QC report: {e}")
        sys.exit(1)


def _save_cleaned_dataset(
    output_dir: Path,
    cleaned_dataset: CleanedDataset,
    quality_assessment: QualityAssessment,
) -> None:
    """Save cleaned dataset for downstream analysis with proper error handling."""
    try:
        cleaned_dataset_path = output_dir / QCConstants.CLEANED_DATASET_FILENAME
        cleaned_data_json = {
            "task_results": [
                {
                    "task": task_result.task,
                    "language": task_result.language,
                    "scale": task_result.scale,
                    "samples": [
                        _sample_to_dict(sample) for sample in task_result.samples
                    ],
                    "successful_runs": task_result.successful_runs,
                    "failed_runs": task_result.failed_runs,
                    "success_rate": task_result.success_rate,
                }
                for task_result in cleaned_dataset.task_results
            ],
            "removed_outliers": [
                _sample_to_dict(sample) for sample in cleaned_dataset.removed_outliers
            ],
            "quality_summary": _convert_quality_metrics_to_dict(quality_assessment),
            "overall_quality": quality_assessment.overall_quality.value,
            "cleaning_log": cleaned_dataset.cleaning_log,
        }

        with open(cleaned_dataset_path, "w") as f:
            json.dump(cleaned_data_json, f, indent=QCConstants.DEFAULT_JSON_INDENT)
        print(f"✅ Cleaned dataset saved to {cleaned_dataset_path}")
    except OSError as e:
        print(f"❌ Error saving cleaned dataset: {e}")
        sys.exit(1)


def _print_quality_summary(
    quality_assessment: QualityAssessment,
    cleaned_dataset: CleanedDataset,
    output_dir: Path,
) -> None:
    """Print comprehensive quality control summary."""
    print()
    print("📊 Quality Control Summary:")
    print(f"   • Data Quality: {quality_assessment.overall_quality.value.upper()}")
    print(f"   • Quality Reason: {quality_assessment.quality_reason}")
    print(f"   • Cleaning Operations: {len(cleaned_dataset.cleaning_log)}")

    if quality_assessment.quality_stats:
        stats = quality_assessment.quality_stats
        print(
            f"   • Quality Distribution: {stats.get('valid_count', 0)} valid, "
            f"{stats.get('warning_count', 0)} warning, {stats.get('invalid_count', 0)} invalid"
        )

    print()
    print("🔍 Quality control analysis complete!")
    print(f"📁 Reports saved in {output_dir}")

    if quality_assessment.overall_quality.value == "invalid":
        print(
            "🔥🔥🔥 Warning: Data quality is \033[31mINVALID\033[0m - review before proceeding"
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
