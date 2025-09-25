"""
Benchmark validation module for WebAssembly performance analysis.

Validates implementation correctness across Rust and TinyGo through hash verification
and result consistency checks. Focuses on engineering reliability over academic rigor.
"""

import logging
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

from . import common
from .data_models import (
    BenchmarkSample,
    ConsistencyResult,
    TaskResult,
    ValidationConfiguration,
    ValidationResult,
)

logger = logging.getLogger(__name__)


@dataclass
class SampleData:
    """Extracted sample data for validation."""

    hash: int = 0
    dimensions: Optional[list[int]] = None
    records: Optional[int] = None


class ValidationConstants:
    """Centralized validation constants for easy configuration."""

    MIN_SAMPLES = 10
    DEFAULT_SUCCESS_RATE_THRESHOLD = 0.95
    HASH_MISMATCH_TOLERANCE = 0.05
    MAX_COEFFICIENT_VARIATION = 0.15


class ValidationError(Exception):
    """Custom exception for validation-specific errors."""

    pass


@dataclass
class LanguagePair:
    """Rust and TinyGo results for a task-scale combination."""

    rust_results: list[TaskResult]
    tinygo_results: list[TaskResult]
    task: str
    scale: str


class BenchmarkValidator:
    """
    Validates benchmark implementation correctness and cross-language consistency.

    This validator focuses on Rust vs TinyGo comparison with emphasis on:
    - Result hash consistency across language implementations
    - Sample quality and quantity validation
    - Success rate threshold enforcement
    - Structural data consistency verification

    Attributes:
        config: ValidationConfiguration instance with thresholds and parameters
        constants: ValidationConstants with configurable limits and tolerances
    """

    def __init__(self, validation_config: ValidationConfiguration):
        """Initialize validator with configuration and constants."""
        self.config = validation_config
        self.constants = ValidationConstants()

    def _validate_task_results(
        self, benchmark_results: list[TaskResult]
    ) -> list[ValidationResult]:
        """Validate benchmark results with optimized Rust vs TinyGo comparison."""
        self._validate_task_results_input(benchmark_results)

        if not benchmark_results:
            return []

        # Group by (task, scale) using defaultdict for cleaner code
        task_groups = defaultdict(list)
        for result in benchmark_results:
            task_groups[(result.task, result.scale)].append(result)

        validation_results = []
        for (task, scale), results in task_groups.items():
            rust_results = [r for r in results if r.language == "rust"]
            tinygo_results = [r for r in results if r.language == "tinygo"]
            pair = LanguagePair(rust_results, tinygo_results, task, scale)
            validation_results.append(self._validate_language_pair(pair))
        return validation_results

    def _validate_task_results_input(self, benchmark_results: list[TaskResult]) -> None:
        """Validate input parameters for task results processing."""
        if not isinstance(benchmark_results, list):
            raise ValidationError(f"Expected list, got {type(benchmark_results)}")

        for i, result in enumerate(benchmark_results):
            if not isinstance(result, TaskResult):
                raise ValidationError(f"Item {i} is not a TaskResult: {type(result)}")
            if not hasattr(result, "samples") or not isinstance(result.samples, list):
                raise ValidationError(f"TaskResult {i} missing or invalid samples list")

    def _validate_language_pair(self, pair: LanguagePair) -> ValidationResult:
        """Validate a Rust-TinyGo language pair."""
        # Handle missing implementations
        if not pair.rust_results and not pair.tinygo_results:
            return self._create_validation_result(
                pair.task,
                pair.scale,
                issues=[
                    f"No benchmark results found for task={pair.task}, scale={pair.scale}"
                ],
            )

        if not pair.rust_results:
            tinygo_data = self._extract_sample_data(pair.tinygo_results[0])
            return self._create_validation_result(
                pair.task,
                pair.scale,
                tinygo_hash=tinygo_data.hash,
                tinygo_dimensions=tinygo_data.dimensions,
                tinygo_records=tinygo_data.records,
                issues=[
                    f"Missing Rust implementation for task={pair.task}, scale={pair.scale}"
                ],
            )

        if not pair.tinygo_results:
            rust_data = self._extract_sample_data(pair.rust_results[0])
            return self._create_validation_result(
                pair.task,
                pair.scale,
                rust_hash=rust_data.hash,
                rust_dimensions=rust_data.dimensions,
                rust_records=rust_data.records,
                issues=[
                    f"Missing TinyGo implementation for task={pair.task}, scale={pair.scale}"
                ],
            )

        # Both implementations available - validate consistency
        rust_result = pair.rust_results[0]
        tinygo_result = pair.tinygo_results[0]

        # Check internal consistency if multiple results per language
        internal_issues = []
        internal_issues.extend(
            self._check_internal_consistency(pair.rust_results, "Rust")
        )
        internal_issues.extend(
            self._check_internal_consistency(pair.tinygo_results, "TinyGo")
        )

        if internal_issues:
            rust_data = self._extract_sample_data(rust_result)
            tinygo_data = self._extract_sample_data(tinygo_result)
            return self._create_validation_result(
                pair.task,
                pair.scale,
                rust_hash=rust_data.hash,
                tinygo_hash=tinygo_data.hash,
                rust_dimensions=rust_data.dimensions,
                tinygo_dimensions=tinygo_data.dimensions,
                rust_records=rust_data.records,
                tinygo_records=tinygo_data.records,
                issues=internal_issues,
            )

        # Perform cross-language validation
        return self._validate_cross_language_consistency(rust_result, tinygo_result)

    def _check_internal_consistency(
        self, results: list[TaskResult], language: str
    ) -> list[str]:
        """Check internal consistency within a language implementation."""
        if len(results) <= 1:
            return []

        issues = []
        base_result = results[0]

        for result in results[1:]:
            consistency = self._verify_cross_language_hash_match(
                base_result.samples, result.samples
            )
            if not consistency.is_consistent:
                issues.append(
                    f"Internal {language} consistency failure: {consistency.issues}"
                )

        return issues

    def _extract_sample_data(self, task_result: TaskResult) -> SampleData:
        """Extract sample data efficiently."""
        if not task_result.samples:
            return SampleData()

        # Use first successful sample with safe success checking
        successful_samples = [
            s for s in task_result.samples if hasattr(s, "success") and s.success
        ]
        if not successful_samples:
            return SampleData()

        sample = successful_samples[0]
        return SampleData(
            hash=sample.resultHash,
            dimensions=getattr(sample, "resultDimensions", None),
            records=getattr(sample, "recordsProcessed", None),
        )

    def _create_validation_result(
        self,
        task: str,
        scale: str,
        rust_hash: int = 0,
        tinygo_hash: int = 0,
        rust_dimensions: Optional[list[int]] = None,
        tinygo_dimensions: Optional[list[int]] = None,
        rust_records: Optional[int] = None,
        tinygo_records: Optional[int] = None,
        issues: Optional[list[str]] = None,
    ) -> ValidationResult:
        """Create ValidationResult with standard parameters."""
        return ValidationResult(
            task=task,
            scale=scale,
            rust_hash=rust_hash,
            tinygo_hash=tinygo_hash,
            rust_dimensions=rust_dimensions,
            tinygo_dimensions=tinygo_dimensions,
            rust_records=rust_records,
            tinygo_records=tinygo_records,
            validation_passed=not bool(issues),
            validation_issues=issues or [],
        )

    def _validate_cross_language_consistency(
        self, rust_result: TaskResult, tinygo_result: TaskResult
    ) -> ValidationResult:
        """Validate Rust vs TinyGo consistency. Assumes languages are already identified."""
        issues = []

        # Basic validations
        if rust_result.task != tinygo_result.task:
            issues.append(f"Task mismatch: {rust_result.task} vs {tinygo_result.task}")

        if rust_result.scale != tinygo_result.scale:
            issues.append(
                f"Scale mismatch: {rust_result.scale} vs {tinygo_result.scale}"
            )

        # Success rate validation
        required_rate = self.config.required_success_rate
        if rust_result.success_rate < required_rate:
            issues.append(
                f"Rust success rate {rust_result.success_rate:.1%} below threshold {required_rate:.1%}"
            )

        if tinygo_result.success_rate < required_rate:
            issues.append(
                f"TinyGo success rate {tinygo_result.success_rate:.1%} below threshold {required_rate:.1%}"
            )

        # Sample size validation
        if len(rust_result.samples) < self.constants.MIN_SAMPLES:
            issues.append(
                f"Rust has insufficient samples: {len(rust_result.samples)} < {self.constants.MIN_SAMPLES}"
            )

        if len(tinygo_result.samples) < self.constants.MIN_SAMPLES:
            issues.append(
                f"TinyGo has insufficient samples: {len(tinygo_result.samples)} < {self.constants.MIN_SAMPLES}"
            )

        # Hash consistency validation
        hash_result = self._verify_cross_language_hash_match(
            rust_result.samples, tinygo_result.samples
        )
        if not hash_result.is_consistent:
            issues.extend(f"Hash consistency: {issue}" for issue in hash_result.issues)

        # Extract data for both languages
        rust_data = self._extract_sample_data(rust_result)
        tinygo_data = self._extract_sample_data(tinygo_result)

        # Structural consistency validation
        if rust_data.dimensions != tinygo_data.dimensions:
            issues.append(
                f"Dimension mismatch: {rust_data.dimensions} vs {tinygo_data.dimensions}"
            )

        if rust_data.records != tinygo_data.records:
            issues.append(
                f"Record count mismatch: {rust_data.records} vs {tinygo_data.records}"
            )

        return ValidationResult(
            task=rust_result.task,
            scale=rust_result.scale,
            rust_hash=rust_data.hash,
            tinygo_hash=tinygo_data.hash,
            rust_dimensions=rust_data.dimensions,
            tinygo_dimensions=tinygo_data.dimensions,
            rust_records=rust_data.records,
            tinygo_records=tinygo_data.records,
            validation_passed=not bool(issues),
            validation_issues=issues,
        )

    def _apply_sample_limit(
        self, samples: list[BenchmarkSample]
    ) -> list[BenchmarkSample]:
        """Apply sample limit if configured."""
        sample_limit = getattr(self.config, "sample_limit", 0)
        return (
            samples[:sample_limit]
            if sample_limit > 0 and len(samples) > sample_limit
            else samples
        )

    def _verify_cross_language_hash_match(
        self,
        primary_samples: list[BenchmarkSample],
        secondary_samples: list[BenchmarkSample],
    ) -> ConsistencyResult:
        """Verify two language implementations produce identical result hashes."""
        issues = []

        # Early validation
        if not primary_samples or not secondary_samples:
            missing = []
            if not primary_samples:
                missing.append("Primary samples list is empty")
            if not secondary_samples:
                missing.append("Secondary samples list is empty")
            return ConsistencyResult(is_consistent=False, issues=missing)

        # Build hash lookup tables efficiently
        primary_lookup = self._build_hash_lookup(primary_samples, "primary", issues)
        secondary_lookup = self._build_hash_lookup(
            secondary_samples, "secondary", issues
        )

        # Compare test case coverage
        primary_keys = set(primary_lookup.keys())
        secondary_keys = set(secondary_lookup.keys())

        self._check_test_coverage(primary_keys, secondary_keys, issues)

        # Compare hash values for common test cases
        common_keys = primary_keys & secondary_keys
        hash_mismatches = self._compare_hashes(
            primary_lookup, secondary_lookup, common_keys, issues
        )

        # Apply tolerance threshold
        if common_keys and hash_mismatches > 0:
            mismatch_rate = hash_mismatches / len(common_keys)
            tolerance = 1.0 - self.config.required_success_rate

            if mismatch_rate > tolerance:
                issues.append(
                    f"Hash mismatch rate {mismatch_rate:.1%} exceeds tolerance {tolerance:.1%}"
                )

        return ConsistencyResult(
            is_consistent=hash_mismatches == 0 and not issues, issues=issues
        )

    def _build_hash_lookup(
        self, samples: list[BenchmarkSample], label: str, issues: list[str]
    ) -> dict:
        """Build hash lookup table and detect internal inconsistencies."""
        lookup = {}
        for sample in samples:
            key = (sample.task, sample.scale, sample.inputDataHash)
            if key in lookup and lookup[key] != sample.resultHash:
                issues.append(
                    f"Inconsistent {label} results for {key}: {lookup[key]} vs {sample.resultHash}"
                )
            else:
                lookup[key] = sample.resultHash
        return lookup

    def _check_test_coverage(
        self, primary_keys: set, secondary_keys: set, issues: list[str]
    ) -> None:
        """Check for missing test cases between implementations."""
        missing_in_secondary = primary_keys - secondary_keys
        missing_in_primary = secondary_keys - primary_keys

        for key in missing_in_secondary:
            task, scale, input_hash = key
            issues.append(
                f"Test case missing in secondary: task={task}, scale={scale}, inputHash={input_hash}"
            )

        for key in missing_in_primary:
            task, scale, input_hash = key
            issues.append(
                f"Test case missing in primary: task={task}, scale={scale}, inputHash={input_hash}"
            )

    def _compare_hashes(
        self,
        primary_lookup: dict,
        secondary_lookup: dict,
        common_keys: set,
        issues: list[str],
    ) -> int:
        """Compare hash values and return mismatch count."""
        mismatches = 0
        for key in common_keys:
            primary_hash = primary_lookup[key]
            secondary_hash = secondary_lookup[key]

            if primary_hash != secondary_hash:
                mismatches += 1
                task, scale, input_hash = key
                issues.append(
                    f"Hash mismatch for task={task}, scale={scale}, inputHash={input_hash}: primary={primary_hash}, secondary={secondary_hash}"
                )

        return mismatches


def main():
    """
    Command-line interface for benchmark validation operations.

    Supports quick mode for faster validation with relaxed tolerances.
    """
    args = common.setup_analysis_cli("Benchmark validation for engineering decisions")

    try:
        _execute_validation_pipeline(quick_mode=args.quick)
    except Exception as e:
        common.handle_critical_error(f"Validation pipeline error: {e}")


def _execute_validation_pipeline(quick_mode: bool = False) -> None:
    """
    Execute the complete validation pipeline with proper error handling.
    """
    # Setup using common utilities
    common.print_analysis_header(
        "WebAssembly Benchmark Validation Analysis", quick_mode
    )
    output_dir = common.setup_output_directory("validation")

    # Load benchmark data and configuration using common utilities
    latest_file, raw_data = common.load_latest_results(quick_mode)
    config_parser = common.load_configuration(quick_mode)
    validation_config = config_parser.get_validation_config()

    print("🔄 Executing validation pipeline...")
    print(
        f"📁 Configuration loaded from: {'configs/bench-quick.yaml' if quick_mode else 'configs/bench.yaml'}"
    )
    print(f"📁 Data loaded from: {latest_file}")

    # Convert raw JSON data to structured data models
    benchmark_results = _convert_raw_data_to_task_results(raw_data)

    # Initialize validator with configuration
    validator = BenchmarkValidator(validation_config)

    # Execute validation analysis
    validation_results = validator._validate_task_results(benchmark_results)

    # Generate validation report
    validation_report = _generate_validation_report(
        latest_file, validation_config, validation_results
    )

    # Save reports with proper error handling
    _save_validation_report(output_dir, validation_report)

    # Print summary
    _print_validation_summary(validation_results, output_dir)


def _convert_raw_data_to_task_results(raw_data: dict) -> list[TaskResult]:
    """Convert raw JSON data to structured TaskResult objects."""
    task_results = []
    raw_results = raw_data.get("results", [])

    for result_data in raw_results:
        samples = _convert_raw_samples_to_benchmark_samples(result_data)

        # Group samples by task-language-scale combination
        task_groups = {}
        for sample in samples:
            key = (sample.task, sample.language, sample.scale)
            if key not in task_groups:
                task_groups[key] = []
            task_groups[key].append(sample)

        # Create TaskResult for each group
        for (task, language, scale), group_samples in task_groups.items():
            successful_samples = [s for s in group_samples if s.success]
            failed_samples = [s for s in group_samples if not s.success]

            total_attempts = len(group_samples)
            success_rate = (
                len(successful_samples) / total_attempts if total_attempts > 0 else 0.0
            )

            task_result = TaskResult(
                task=task,
                language=language,
                scale=scale,
                samples=successful_samples,
                successful_runs=len(successful_samples),
                failed_runs=len(failed_samples),
                success_rate=success_rate,
            )
            task_results.append(task_result)

    return task_results


def _convert_raw_samples_to_benchmark_samples(
    result_data: dict,
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


def _generate_validation_report(
    latest_file,
    validation_config: ValidationConfiguration,
    validation_results: list[ValidationResult],
) -> dict:
    """Generate comprehensive validation report."""
    from datetime import datetime

    # Calculate summary statistics
    total_validations = len(validation_results)
    passed_validations = len([r for r in validation_results if r.validation_passed])
    failed_validations = total_validations - passed_validations

    return {
        "timestamp": datetime.now().isoformat(),
        "input_file": str(latest_file),
        "configuration": {
            "required_success_rate": validation_config.required_success_rate,
        },
        "validation_summary": {
            "total_validations": total_validations,
            "passed_validations": passed_validations,
            "failed_validations": failed_validations,
            "success_rate": (
                passed_validations / total_validations if total_validations > 0 else 0.0
            ),
        },
        "validation_results": [
            {
                "task": result.task,
                "scale": result.scale,
                "rust_hash": result.rust_hash,
                "tinygo_hash": result.tinygo_hash,
                "rust_dimensions": result.rust_dimensions,
                "tinygo_dimensions": result.tinygo_dimensions,
                "rust_records": result.rust_records,
                "tinygo_records": result.tinygo_records,
                "validation_passed": result.validation_passed,
                "validation_issues": result.validation_issues,
            }
            for result in validation_results
        ],
    }


def _save_validation_report(output_dir: Path, validation_report: dict) -> None:
    """Save validation report with comprehensive error handling."""
    import json
    import sys

    try:
        report_path = output_dir / "validation_report.json"
        report_path.parent.mkdir(parents=True, exist_ok=True)

        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(validation_report, f, indent=2, ensure_ascii=False)

        logger.info(f"Validation report saved to {report_path}")
        print(f"✅ Validation report saved to {report_path}")

    except PermissionError as e:
        logger.error(f"Permission denied writing to {report_path}: {e}")
        print(f"❌ Permission denied writing validation report: {e}")
        sys.exit(1)
    except OSError as e:
        logger.error(f"System error writing validation report: {e}")
        print(f"❌ Error saving validation report: {e}")
        sys.exit(1)
    except (TypeError, ValueError) as e:
        logger.error(f"Data serialization error: {e}")
        print(f"❌ Error serializing validation report: {e}")
        sys.exit(1)


def _print_validation_summary(
    validation_results: list[ValidationResult], output_dir: Path
) -> None:
    """Print comprehensive validation summary."""
    total_validations = len(validation_results)
    passed_validations = len([r for r in validation_results if r.validation_passed])
    failed_validations = total_validations - passed_validations

    print(f"\n📊 Validation Summary:")
    print(f"   • Total Validations: {total_validations}")
    print(f"   • Passed: {passed_validations}")
    print(f"   • Failed: {failed_validations}")
    if total_validations > 0:
        success_rate = passed_validations / total_validations
        print(f"   • Success Rate: {success_rate:.1%}")

    # Show failed validations details
    failed_results = [r for r in validation_results if not r.validation_passed]
    if failed_results:
        print(f"\n⚠️  Failed Validations:")
        for result in failed_results[:5]:  # Show first 5 failures
            print(
                f"   • {result.task}-{result.scale}: {', '.join(result.validation_issues)}"
            )
        if len(failed_results) > 5:
            print(f"   • ... and {len(failed_results) - 5} more failures")

    print(f"\n🔍 Validation analysis complete!")
    print(f"📁 Reports saved in {output_dir}")

    if failed_validations > 0:
        print(
            f"\n⚠️  Warning: {failed_validations} validation(s) failed - review before proceeding"
        )


if __name__ == "__main__":
    main()
