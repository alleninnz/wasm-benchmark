"""
Quality control module for WebAssembly benchmark data validation and cleaning.

Implements IQR-based outlier detection, coefficient of variation validation,
and data quality assessment with configurable engineering-grade thresholds.
"""

import json
import math
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Tuple

from analysis.config_parser import ConfigParser
from analysis.data_models import (
    BenchmarkResult,
    BenchmarkSample,
    CleanedDataset,
    DataQuality,
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
        self, benchmark_results: List[BenchmarkResult], qc_config: QCConfiguration
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
        self.cleaning_log: List[str] = []

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
            f"high-risk>{self.config.quality_high_risk_threshold:.1%}, "
            f"warning>{self.config.quality_warning_threshold:.1%}"
        )

        return self._create_cleaned_dataset(cleaned_task_results, all_removed_outliers)

    def _extract_all_samples(self) -> List[BenchmarkSample]:
        """Extract all samples from benchmark results."""
        return [
            sample for result in self.benchmark_results for sample in result.samples
        ]

    def _group_samples_by_task(
        self, all_samples: List[BenchmarkSample]
    ) -> Dict[Tuple[str, str, str], List[BenchmarkSample]]:
        """Group samples by task, language, and scale combination."""
        task_groups: Dict[Tuple[str, str, str], List[BenchmarkSample]] = {}
        for sample in all_samples:
            key = (sample.task, sample.language, sample.scale)
            if key not in task_groups:
                task_groups[key] = []
            task_groups[key].append(sample)
        return task_groups

    def _process_task_groups(
        self, task_groups: Dict[Tuple[str, str, str], List[BenchmarkSample]]
    ) -> Tuple[List[TaskResult], List[BenchmarkSample]]:
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

            # Detect and remove statistical outliers using IQR method
            cleaned_samples, outliers = self.detect_outliers(successful_samples)
            all_removed_outliers.extend(outliers)

            if outliers:
                self.cleaning_log.append(
                    f"Removed {len(outliers)} outliers from {group_key} "
                    f"({len(outliers) / len(successful_samples) * 100:.1f}% of successful samples)"
                )

            # Create final sample list (keep failed runs, use cleaned successful runs)
            final_samples = cleaned_samples + failed_samples

            # Create TaskResult
            task_result = TaskResult(
                task=task,
                language=language,
                scale=scale,
                samples=final_samples,
                successful_runs=len(cleaned_samples),
                failed_runs=failed_runs,
                success_rate=(
                    len(cleaned_samples) / len(final_samples) if final_samples else 0.0
                ),
            )

            cleaned_task_results.append(task_result)

        return cleaned_task_results, all_removed_outliers

    def _partition_samples_by_success(
        self, samples: List[BenchmarkSample]
    ) -> Tuple[List[BenchmarkSample], List[BenchmarkSample]]:
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
        cleaned_task_results: List[TaskResult],
        all_removed_outliers: List[BenchmarkSample],
    ) -> CleanedDataset:
        """Create the final cleaned dataset with summary statistics."""
        return CleanedDataset(
            task_results=cleaned_task_results,
            removed_outliers=all_removed_outliers,
            cleaning_log=self.cleaning_log.copy(),
        )

    def detect_outliers(
        self, samples: List[BenchmarkSample]
    ) -> Tuple[List[BenchmarkSample], List[BenchmarkSample]]:
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

        # Extract execution times from successful samples only
        successful_samples = [
            sample for sample in task_result.samples if sample.success
        ]
        execution_times = [sample.executionTime for sample in successful_samples]

        sample_count = len(successful_samples)
        total_samples = len(task_result.samples)
        failed_samples = total_samples - sample_count

        # Calculate basic statistics from execution times
        if sample_count == 0:
            mean_execution_time = 0.0
            std_execution_time = 0.0
            coefficient_variation = 0.0
        elif sample_count == 1:
            mean_execution_time = execution_times[0]
            std_execution_time = 0.0
            coefficient_variation = 0.0
        else:
            mean_execution_time = sum(execution_times) / sample_count
            variance = sum((t - mean_execution_time) ** 2 for t in execution_times) / (
                sample_count - 1
            )
            std_execution_time = math.sqrt(variance)

            # Calculate coefficient of variation (handle near-zero mean)
            if abs(mean_execution_time) < QCConstants.DIVISION_BY_ZERO_EPSILON:
                coefficient_variation = 0.0
            else:
                coefficient_variation = std_execution_time / mean_execution_time

        # Calculate failure rate and success rate
        failure_rate = failed_samples / total_samples if total_samples > 0 else 0.0
        success_rate = task_result.success_rate

        # Assess data quality using hierarchical criteria - configuration-driven
        quality_issues = []
        data_quality = DataQuality.VALID  # Start optimistic

        # INVALID conditions (data is not usable for engineering decisions)
        if sample_count < self.config.min_valid_samples:
            quality_issues.append(
                f"Insufficient samples: {sample_count} < {self.config.min_valid_samples} (minimum required)"
            )
            data_quality = DataQuality.INVALID

        if failure_rate > self.config.failure_rate:
            quality_issues.append(
                f"High failure rate: {failure_rate:.1%} > {self.config.failure_rate:.1%} (maximum allowed)"
            )
            data_quality = DataQuality.INVALID

        extreme_cv_threshold = (
            self.config.max_coefficient_variation * QCConstants.EXTREME_CV_MULTIPLIER
        )
        if coefficient_variation > extreme_cv_threshold:
            quality_issues.append(
                f"Extremely high variability: CV={coefficient_variation:.3f} > {extreme_cv_threshold:.3f} (2x threshold)"
            )
            data_quality = DataQuality.INVALID

        # WARNING conditions (concerning but potentially usable - only if not already INVALID)
        if data_quality != DataQuality.INVALID:
            if coefficient_variation > self.config.max_coefficient_variation:
                quality_issues.append(
                    f"High variability: CV={coefficient_variation:.3f} > {self.config.max_coefficient_variation:.3f} (threshold)"
                )
                data_quality = DataQuality.WARNING

        return QualityMetrics(
            sample_count=sample_count,
            mean_execution_time=mean_execution_time,
            std_execution_time=std_execution_time,
            coefficient_variation=coefficient_variation,
            outlier_count=0,  # Outliers already removed in pipeline, tracked separately
            outlier_rate=0.0,
            success_rate=success_rate,
            data_quality=data_quality,
            quality_issues=quality_issues,
        )

    def calculate_overall_quality(
        self, task_results: List[TaskResult]
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
                overall_quality=DataQuality.VALID,
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

        for metrics in quality_summary.values():
            quality_counts[metrics.data_quality] += 1

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

        elif (
            invalid_count > 0
            and problem_ratio > self.config.quality_high_risk_threshold
        ):
            reason = (
                f"High risk quality issues: {invalid_count} invalid + {warning_count} warning groups "
                f"= {problem_ratio:.1%} total problems (threshold: {self.config.quality_high_risk_threshold:.1%})"
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
    try:
        _execute_quality_control_pipeline()
    except Exception as e:
        print(f"❌ Critical error in quality control pipeline: {e}")
        sys.exit(1)


def _execute_quality_control_pipeline() -> None:
    """Execute the complete quality control pipeline with proper error handling."""
    # Standard input/output paths
    input_dir = Path("results")
    output_dir = Path("reports/qc")
    output_dir.mkdir(parents=True, exist_ok=True)

    print("🔍 WebAssembly Benchmark Quality Control Analysis")
    print(QCConstants.TITLE_SEPARATOR)

    # Load benchmark data with specific error handling
    latest_file, raw_data = _load_latest_benchmark_data(input_dir)

    # Load configuration with specific error handling
    qc_config = _load_qc_configuration()

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


def _load_latest_benchmark_data(input_dir: Path) -> Tuple[Path, Dict[str, Any]]:
    """Load the latest benchmark data file with specific error handling."""
    try:
        json_files = list(input_dir.glob(QCConstants.JSON_FILE_PATTERN))
        if not json_files:
            print(f"❌ Error: No benchmark data files found in {input_dir}")
            print("💡 Run benchmark tests first to generate data")
            sys.exit(1)

        # Use the latest non-meta JSON file
        non_meta_files = [
            f for f in json_files if QCConstants.META_FILE_PATTERN not in f.name
        ]
        if not non_meta_files:
            print(f"❌ Error: No non-meta JSON files found in {input_dir}")
            sys.exit(1)

        latest_file = max(non_meta_files, key=lambda x: x.stat().st_mtime)

        with open(latest_file, "r") as f:
            raw_data = json.load(f)
        print(f"✅ Loaded raw benchmark data from {latest_file}")
        return latest_file, raw_data

    except FileNotFoundError:
        print(f"❌ Benchmark data directory not found: {input_dir}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON format in {latest_file}: {e}")
        sys.exit(1)
    except IOError as e:
        print(f"❌ Error reading {latest_file}: {e}")
        sys.exit(1)


def _load_qc_configuration() -> QCConfiguration:
    """Load quality control configuration with specific error handling."""
    try:
        config_parser = ConfigParser().load()
        qc_config = config_parser.get_qc_config()
        print("✅ Loaded quality control configuration")
        return qc_config
    except FileNotFoundError:
        print("❌ Configuration file not found")
        sys.exit(1)
    except (ValueError, KeyError) as e:
        print(f"❌ Invalid configuration format: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error loading configuration: {e}")
        sys.exit(1)


def _convert_raw_data_to_benchmark_results(
    raw_data: Dict[str, Any],
) -> List[BenchmarkResult]:
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
    result_data: Dict[str, Any],
) -> List[BenchmarkSample]:
    """Convert raw sample data to BenchmarkSample objects."""
    samples = []
    results_data = result_data.get("results", [])

    # Handle both array and dict formats for results
    if isinstance(results_data, list):
        sample_list = results_data
    elif isinstance(results_data, dict):
        sample_list = list(results_data.values())
    else:
        sample_list = []

    for sample_data in sample_list:
        if not isinstance(sample_data, dict):
            continue

        sample = BenchmarkSample(
            task=sample_data.get("task", ""),
            language=sample_data.get("language", ""),
            scale=sample_data.get("scale", ""),
            run=sample_data.get("run", 0),
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
) -> Tuple[CleanedDataset, QualityAssessment]:
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
) -> Dict[str, Any]:
    """Generate comprehensive quality control report."""
    return {
        "timestamp": datetime.now().isoformat(),
        "input_file": str(latest_file),
        "configuration": {
            "max_cv": qc_config.max_coefficient_variation,
            "iqr_multiplier": qc_config.outlier_iqr_multiplier,
            "min_samples": qc_config.min_valid_samples,
            "failure_rate": qc_config.failure_rate,
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
) -> Dict[str, Any]:
    """Convert quality metrics to dictionary format for JSON serialization."""
    if not quality_assessment.quality_summary:
        return {}

    return {
        key: {
            "sample_count": metrics.sample_count,
            "mean_execution_time": metrics.mean_execution_time,
            "std_execution_time": metrics.std_execution_time,
            "coefficient_variation": metrics.coefficient_variation,
            "outlier_count": metrics.outlier_count,
            "outlier_rate": metrics.outlier_rate,
            "success_rate": metrics.success_rate,
            "data_quality": metrics.data_quality.value,
            "quality_issues": metrics.quality_issues,
        }
        for key, metrics in quality_assessment.quality_summary.items()
    }


def _sample_to_dict(sample: BenchmarkSample) -> Dict[str, Any]:
    """Convert BenchmarkSample to dictionary representation."""
    return {
        "task": sample.task,
        "language": sample.language,
        "scale": sample.scale,
        "run": sample.run,
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


def _save_qc_report(output_dir: Path, qc_report: Dict[str, Any]) -> None:
    """Save quality control report with proper error handling."""
    try:
        report_path = output_dir / QCConstants.QC_REPORT_FILENAME
        with open(report_path, "w") as f:
            json.dump(qc_report, f, indent=QCConstants.DEFAULT_JSON_INDENT)
        print(f"✅ Quality control report saved to {report_path}")
    except IOError as e:
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
    except IOError as e:
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
        print("⚠️  Warning: Data quality is INVALID - review before proceeding")
        sys.exit(1)


if __name__ == "__main__":
    main()
