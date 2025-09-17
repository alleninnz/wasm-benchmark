"""
Quality control module for WebAssembly benchmark data validation and cleaning.

Implements IQR-based outlier detection, coefficient of variation validation,
and data quality assessment with configurable engineering-grade thresholds.
"""

import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

from .config_parser import ConfigParser
from .data_models import (BenchmarkSample, CleanedDataset, DataQuality,
                          QCConfiguration, QualityMetrics, RawBenchmarkData,
                          TaskResult)


class QualityController:
    """Data quality control and validation for benchmark analysis pipeline"""

    def __init__(self, raw_dataset: RawBenchmarkData, qc_config: QCConfiguration):
        """
        Initialize quality controller with raw data and configuration parameters.

        Args:
            raw_dataset: Raw benchmark data loaded from JSON files
            qc_config: Quality control configuration parameters
        """
        self.raw_data = raw_dataset
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
        # TODO: Parse raw benchmark data into structured format
        # TODO: Group samples by task, language, and scale
        # TODO: Validate sample counts meet minimum requirements
        # TODO: Detect and remove statistical outliers using IQR method
        # TODO: Assess data quality for each task-language combination
        # TODO: Generate quality metrics and overall quality assessment
        # TODO: Return CleanedDataset with validated data and quality report

        return CleanedDataset(
            task_results=[],
            removed_outliers=[],
            quality_summary={},
            overall_quality=DataQuality.VALID,
            cleaning_log=[]
        )

    def detect_outliers(self, samples: List[BenchmarkSample]) -> Tuple[List[BenchmarkSample], List[BenchmarkSample]]:
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
            data_quality=DataQuality.VALID,
            quality_issues=[]
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
        latest_file = max([f for f in json_files if "meta" not in f.name],
                         key=lambda x: x.stat().st_mtime)

        with open(latest_file, 'r') as f:
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

    raw_dataset = RawBenchmarkData(
        summary=raw_data.get("summary", {}),
        results=raw_data.get("results", []),
        file_path=str(latest_file),
        load_timestamp=datetime.now().isoformat()
    )

    # Initialize quality controller
    quality_controller = QualityController(raw_dataset, qc_config)

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
            "max_timeout_rate": qc_config.max_timeout_rate
        },
        "data_summary": {
            "total_task_results": len(cleaned_dataset.task_results),
            "removed_outliers": len(cleaned_dataset.removed_outliers),
            "overall_quality": cleaned_dataset.overall_quality.value,
            "cleaning_operations": len(cleaned_dataset.cleaning_log)
        },
        "quality_metrics": cleaned_dataset.quality_summary,
        "cleaning_log": cleaned_dataset.cleaning_log
    }

    # Save quality control report
    try:
        report_path = output_dir / "quality_control_report.json"
        with open(report_path, 'w') as f:
            json.dump(qc_report, f, indent=2)
        print(f"✅ Quality control report saved to {report_path}")
    except IOError as e:
        print(f"❌ Error saving report: {e}")
        sys.exit(1)

    # Save cleaned dataset for downstream analysis
    try:
        cleaned_dataset_path = output_dir / "cleaned_dataset.json"
        cleaned_data_json = {
            "task_results": cleaned_dataset.task_results,
            "removed_outliers": cleaned_dataset.removed_outliers,
            "quality_summary": cleaned_dataset.quality_summary,
            "overall_quality": cleaned_dataset.overall_quality.value,
            "cleaning_log": cleaned_dataset.cleaning_log
        }

        with open(cleaned_dataset_path, 'w') as f:
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