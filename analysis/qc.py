"""
Quality control module for WebAssembly benchmark data validation and cleaning.

Implements IQR-based outlier detection, coefficient of variation validation,
and data quality assessment with configurable engineering-grade thresholds.
"""

import json
import sys
from datetime import datetime
from pathlib import Path
from typing import List, Tuple

from analysis.config_parser import ConfigParser
from analysis.data_models import (BenchmarkResult, BenchmarkSample,
                                  CleanedDataset, DataQuality, QCConfiguration,
                                  QualityMetrics, TaskResult)


class QualityController:
    """Data quality control and validation for benchmark analysis pipeline"""

    def __init__(self, benchmark_results: List[BenchmarkResult], qc_config: QCConfiguration):
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
        self.max_timeout_rate = self.config.max_timeout_rate
        self.cleaning_log: List[str] = []

    def validate_and_clean(self) -> CleanedDataset:
        """
        Execute complete data quality validation and cleaning pipeline.

        Returns:
            CleanedDataset: Validated and cleaned benchmark data ready for analysis
        """
        self.cleaning_log.clear()
        self.cleaning_log.append(f"Starting quality control pipeline at {datetime.now().isoformat()}")

        # Extract all samples from benchmark results
        all_samples = []
        for result in self.benchmark_results:
            for sample in result.samples:
                all_samples.append(sample)

        self.cleaning_log.append(f"Extracted {len(all_samples)} samples from {len(self.benchmark_results)} benchmark results")

        # Group samples by task, language, and scale
        task_groups = {}
        for sample in all_samples:
            key = (sample.task, sample.language, sample.scale)
            if key not in task_groups:
                task_groups[key] = []
            task_groups[key].append(sample)

        self.cleaning_log.append(f"Grouped samples into {len(task_groups)} task-language-scale combinations")

        # Process each group: validate counts, detect outliers, assess quality
        cleaned_task_results = []
        all_removed_outliers = []
        quality_summary = {}

        for (task, language, scale), samples in task_groups.items():
            group_key = f"{task}_{language}_{scale}"

            # Count successful and failed runs
            successful_samples = [s for s in samples if s.success]
            failed_samples = [s for s in samples if not s.success]

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
                    f"({len(outliers)/len(successful_samples)*100:.1f}% of successful samples)"
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
                success_rate=len(cleaned_samples) / len(final_samples) if final_samples else 0.0
            )

            # Assess data quality for each task-language combination
            quality_metrics = self.calculate_quality_metrics(task_result)
            quality_summary[group_key] = quality_metrics

            cleaned_task_results.append(task_result)

        # Calculate overall quality using layered threshold evaluation
        overall_quality, quality_reason, quality_stats = self.calculate_overall_quality(quality_summary)

        # Generate overall quality assessment summary
        total_outliers = len(all_removed_outliers)
        total_samples = len(all_samples)
        outlier_percentage = (total_outliers / total_samples * 100) if total_samples > 0 else 0

        self.cleaning_log.append("Quality control pipeline completed:")
        self.cleaning_log.append(f"  - Total samples processed: {total_samples}")
        self.cleaning_log.append(f"  - Total outliers removed: {total_outliers} ({outlier_percentage:.1f}%)")
        self.cleaning_log.append(f"  - Task-language combinations: {len(cleaned_task_results)}")

        # Add detailed quality assessment information
        self.cleaning_log.append(f"  - Quality evaluation: {quality_reason}")
        self.cleaning_log.append(f"  - Quality distribution: {quality_stats['valid_count']} valid, "
                                f"{quality_stats['warning_count']} warning, {quality_stats['invalid_count']} invalid")
        self.cleaning_log.append(f"  - Overall data quality: {overall_quality.value}")

        # Add threshold information for transparency
        self.cleaning_log.append(f"  - Quality thresholds: invalid>{self.config.quality_invalid_threshold:.1%}, "
                                f"high-risk>{self.config.quality_high_risk_threshold:.1%}, "
                                f"warning>{self.config.quality_warning_threshold:.1%}")

        return CleanedDataset(
            task_results=cleaned_task_results,
            removed_outliers=all_removed_outliers,
            quality_summary=quality_summary,
            overall_quality=overall_quality,
            cleaning_log=self.cleaning_log.copy(),
        )

    def calculate_overall_quality(self, quality_summary: dict) -> tuple[DataQuality, str, dict]:
        """
        Calculate overall quality using layered threshold evaluation strategy.

        This method evaluates data quality based on the distribution of quality
        levels across all task-language-scale groups, using configurable thresholds
        for a more nuanced assessment than simple "one vote veto" approach.

        Args:
            quality_summary: Dictionary mapping group keys to QualityMetrics

        Returns:
            Tuple[DataQuality, str, dict]: (overall_quality, reason, stats)
        """
        if not quality_summary:
            return DataQuality.VALID, "No groups to evaluate", {}

        # Count groups by quality level
        total_groups = len(quality_summary)
        quality_counts = {
            DataQuality.INVALID: 0,
            DataQuality.WARNING: 0,
            DataQuality.VALID: 0
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
            'total_groups': total_groups,
            'invalid_count': invalid_count,
            'warning_count': warning_count,
            'valid_count': valid_count,
            'invalid_ratio': invalid_ratio,
            'warning_ratio': warning_ratio,
            'problem_ratio': problem_ratio
        }

        # Layered threshold evaluation
        if invalid_ratio > self.config.quality_invalid_threshold:
            reason = (f"Critical quality issues: {invalid_count}/{total_groups} groups are invalid "
                     f"({invalid_ratio:.1%}, threshold: {self.config.quality_invalid_threshold:.1%})")
            return DataQuality.INVALID, reason, stats

        elif invalid_count > 0 and problem_ratio > self.config.quality_high_risk_threshold:
            reason = (f"High risk quality issues: {invalid_count} invalid + {warning_count} warning groups "
                     f"= {problem_ratio:.1%} total problems (threshold: {self.config.quality_high_risk_threshold:.1%})")
            return DataQuality.INVALID, reason, stats

        elif warning_ratio > self.config.quality_warning_threshold or invalid_count > 0:
            if invalid_count > 0:
                reason = f"Quality concerns: {invalid_count} invalid and {warning_count} warning groups need attention"
            else:
                reason = f"Quality concerns: {warning_count}/{total_groups} groups have warnings ({warning_ratio:.1%})"
            return DataQuality.WARNING, reason, stats

        else:
            reason = f"Good quality: {valid_count} valid, {warning_count} warning, {invalid_count} invalid groups"
            return DataQuality.VALID, reason, stats

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
        # TODO: Extract execution times from successful samples only
        # TODO: Calculate Q1, Q3, and IQR from execution time distribution
        # TODO: Determine outlier thresholds using configured multiplier
        # TODO: Classify samples as normal or outliers based on thresholds
        # TODO: Log outlier detection statistics and reasoning
        # TODO: Return cleaned samples and detected outliers separately

        return samples, []

    def calculate_quality_metrics(self, task_result: TaskResult) -> QualityMetrics:
        """
        Calculate comprehensive quality metrics for a task-language combination.

        Args:
            task_result: Task results for quality assessment

        Returns:
            QualityMetrics: Detailed quality assessment with validation status
        """
        # TODO: Extract execution times from successful samples
        # TODO: Calculate basic statistics (count, mean, std, CV)
        # TODO: Compute timeout rate and success rate
        # TODO: Assess data quality based on configured thresholds
        # TODO: Generate list of quality issues if any thresholds are violated
        # TODO: Return comprehensive QualityMetrics object

        return QualityMetrics(
            sample_count=0,
            mean_execution_time=0.0,
            std_execution_time=0.0,
            coefficient_variation=0.0,
            outlier_count=0,
            outlier_rate=0.0,
            timeout_rate=0.0,
            success_rate=1.0,
            data_quality=DataQuality.INVALID,
            quality_issues=[],
        )


def main():
    """Execute quality control analysis on benchmark data"""

    # Standard input/output paths
    input_dir = Path("results")
    output_dir = Path("reports/qc")
    output_dir.mkdir(parents=True, exist_ok=True)

    print("🔍 WebAssembly Benchmark Quality Control Analysis")
    print("=" * 60)

    # Find latest benchmark data
    try:
        json_files = list(input_dir.glob("*.json"))
        if not json_files:
            print(f"❌ Error: No benchmark data files found in {input_dir}")
            print("💡 Run benchmark tests first to generate data")
            sys.exit(1)

        # Use the latest non-meta JSON file
        latest_file = max(
            [f for f in json_files if "meta" not in f.name],
            key=lambda x: x.stat().st_mtime,
        )

        with open(latest_file, "r") as f:
            raw_data = json.load(f)
        print(f"✅ Loaded raw benchmark data from {latest_file}")
    except Exception as e:
        print(f"❌ Error loading benchmark data: {e}")
        sys.exit(1)

    # Load configuration
    try:
        config_parser = ConfigParser().load()
        qc_config = config_parser.get_qc_config()
        print("✅ Loaded quality control configuration")
    except Exception as e:
        print(f"❌ Error loading configuration: {e}")
        sys.exit(1)

    # Convert raw JSON data to structured data models
    benchmark_results = []
    raw_results = raw_data.get("results", [])

    for result_data in raw_results:
        # Convert samples from camelCase to BenchmarkSample objects
        samples = []
        results_data = result_data.get("results", [])

        # Handle both array and dict formats for results
        if isinstance(results_data, list):
            sample_list = results_data
        elif isinstance(results_data, dict):
            # If it's a dict, extract the values
            sample_list = list(results_data.values())
        else:
            sample_list = []

        for sample_data in sample_list:
            # Skip if sample_data is not a dictionary
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
                recordsProcessed=sample_data.get("recordsProcessed")
            )
            samples.append(sample)

        # Create BenchmarkResult object
        benchmark_result = BenchmarkResult(
            benchmark=result_data.get("benchmark", ""),
            success=result_data.get("success", False),
            samples=samples,
            timestamp=result_data.get("timestamp", ""),
            duration=result_data.get("duration", 0),
            id=result_data.get("id", "")
        )
        benchmark_results.append(benchmark_result)

    # Initialize quality controller with simplified interface
    quality_controller = QualityController(benchmark_results, qc_config)

    # Execute quality control analysis
    print("🔄 Executing quality control pipeline...")
    try:
        cleaned_dataset = quality_controller.validate_and_clean()
        print("✅ Quality control analysis completed")
    except Exception as e:
        print(f"❌ Error during quality control: {e}")
        sys.exit(1)

    # Generate quality control report
    qc_report = {
        "timestamp": datetime.now().isoformat(),
        "input_file": str(latest_file),
        "configuration": {
            "max_cv": qc_config.max_coefficient_variation,
            "iqr_multiplier": qc_config.outlier_iqr_multiplier,
            "min_samples": qc_config.min_valid_samples,
            "max_timeout_rate": qc_config.max_timeout_rate,
        },
        "data_summary": {
            "total_task_results": len(cleaned_dataset.task_results),
            "removed_outliers": len(cleaned_dataset.removed_outliers),
            "overall_quality": cleaned_dataset.overall_quality.value,
            "cleaning_operations": len(cleaned_dataset.cleaning_log),
        },
        "quality_metrics": {
            key: {
                "sample_count": metrics.sample_count,
                "mean_execution_time": metrics.mean_execution_time,
                "std_execution_time": metrics.std_execution_time,
                "coefficient_variation": metrics.coefficient_variation,
                "outlier_count": metrics.outlier_count,
                "outlier_rate": metrics.outlier_rate,
                "timeout_rate": metrics.timeout_rate,
                "success_rate": metrics.success_rate,
                "data_quality": metrics.data_quality.value,
                "quality_issues": metrics.quality_issues,
            }
            for key, metrics in cleaned_dataset.quality_summary.items()
        },
        "cleaning_log": cleaned_dataset.cleaning_log,
    }

    # Save quality control report
    try:
        report_path = output_dir / "quality_control_report.json"
        with open(report_path, "w") as f:
            json.dump(qc_report, f, indent=2)
        print(f"✅ Quality control report saved to {report_path}")
    except IOError as e:
        print(f"❌ Error saving report: {e}")
        sys.exit(1)

    # Save cleaned dataset for downstream analysis
    try:
        cleaned_dataset_path = output_dir / "cleaned_dataset.json"
        cleaned_data_json = {
            "task_results": [
                {
                    "task": tr.task,
                    "language": tr.language,
                    "scale": tr.scale,
                    "samples": [
                        {
                            "task": s.task,
                            "language": s.language,
                            "scale": s.scale,
                            "run": s.run,
                            "executionTime": s.executionTime,
                            "memoryUsageMb": s.memoryUsageMb,
                            "wasmMemoryBytes": s.wasmMemoryBytes,
                            "resultHash": s.resultHash,
                            "inputDataHash": s.inputDataHash,
                            "timestamp": s.timestamp,
                            "success": s.success,
                            "jsHeapBefore": s.jsHeapBefore,
                            "jsHeapAfter": s.jsHeapAfter,
                            "resultDimensions": s.resultDimensions,
                            "recordsProcessed": s.recordsProcessed,
                        }
                        for s in tr.samples
                    ],
                    "successful_runs": tr.successful_runs,
                    "failed_runs": tr.failed_runs,
                    "success_rate": tr.success_rate,
                }
                for tr in cleaned_dataset.task_results
            ],
            "removed_outliers": [
                {
                    "task": s.task,
                    "language": s.language,
                    "scale": s.scale,
                    "run": s.run,
                    "executionTime": s.executionTime,
                    "memoryUsageMb": s.memoryUsageMb,
                    "wasmMemoryBytes": s.wasmMemoryBytes,
                    "resultHash": s.resultHash,
                    "inputDataHash": s.inputDataHash,
                    "timestamp": s.timestamp,
                    "success": s.success,
                    "jsHeapBefore": s.jsHeapBefore,
                    "jsHeapAfter": s.jsHeapAfter,
                    "resultDimensions": s.resultDimensions,
                    "recordsProcessed": s.recordsProcessed,
                }
                for s in cleaned_dataset.removed_outliers
            ],
            "quality_summary": {
                key: {
                    "sample_count": metrics.sample_count,
                    "mean_execution_time": metrics.mean_execution_time,
                    "std_execution_time": metrics.std_execution_time,
                    "coefficient_variation": metrics.coefficient_variation,
                    "outlier_count": metrics.outlier_count,
                    "outlier_rate": metrics.outlier_rate,
                    "timeout_rate": metrics.timeout_rate,
                    "success_rate": metrics.success_rate,
                    "data_quality": metrics.data_quality.value,
                    "quality_issues": metrics.quality_issues,
                }
                for key, metrics in cleaned_dataset.quality_summary.items()
            },
            "overall_quality": cleaned_dataset.overall_quality.value,
            "cleaning_log": cleaned_dataset.cleaning_log,
        }

        with open(cleaned_dataset_path, "w") as f:
            json.dump(cleaned_data_json, f, indent=2)
        print(f"✅ Cleaned dataset saved to {cleaned_dataset_path}")
    except IOError as e:
        print(f"❌ Error saving cleaned dataset: {e}")
        sys.exit(1)

    # Generate summary statistics
    print()
    print("📊 Quality Control Summary:")
    print(f"   • Data Quality: {cleaned_dataset.overall_quality.value.upper()}")
    print(f"   • Cleaning Operations: {len(cleaned_dataset.cleaning_log)}")

    print()
    print("🔍 Quality control analysis complete!")
    print(f"📁 Reports saved in {output_dir}")

    if cleaned_dataset.overall_quality.value == "invalid":
        print("⚠️  Warning: Data quality is INVALID - review before proceeding")
        sys.exit(1)


if __name__ == "__main__":
    main()
