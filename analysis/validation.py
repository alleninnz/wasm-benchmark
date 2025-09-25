"""
Benchmark validation module for WebAssembly performance analysis.

Validates implementation correctness across Rust and TinyGo through hash verification
and result consistency checks. Focuses on engineering reliability over academic rigor.
"""

from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Optional

from . import common
from .data_models import (BenchmarkSample, ConsistencyResult, TaskResult,
                          ValidationConfiguration, ValidationResult)


@dataclass
class SampleData:
    """Extracted sample data for validation."""
    hash: int = 0
    dimensions: Optional[list[int]] = None
    records: Optional[int] = None


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

    Optimized for Rust vs TinyGo comparison with simplified validation logic.
    """

    # Configuration constants
    MIN_SAMPLES = 10

    def __init__(self, validation_config: ValidationConfiguration):
        """Initialize validator with configuration."""
        self.config = validation_config

    def _validate_task_results(
        self, benchmark_results: list[TaskResult]
    ) -> list[ValidationResult]:
        """Validate benchmark results with optimized Rust vs TinyGo comparison."""
        if not benchmark_results:
            return []

        # Group by (task, scale) using defaultdict for cleaner code
        task_groups = defaultdict(list)
        for result in benchmark_results:
            task_groups[(result.task, result.scale)].append(result)

        validation_results = []
        for (task, scale), results in task_groups.items():
            rust_results = [r for r in results if r.language == 'rust']
            tinygo_results = [r for r in results if r.language == 'tinygo']
            pair = LanguagePair(rust_results, tinygo_results, task, scale)
            validation_results.append(self._validate_language_pair(pair))
        return validation_results

    def _validate_language_pair(self, pair: LanguagePair) -> ValidationResult:
        """Validate a Rust-TinyGo language pair."""
        # Handle missing implementations
        if not pair.rust_results and not pair.tinygo_results:
            return self._create_validation_result(
                pair.task, pair.scale,
                issues=[f"No benchmark results found for task={pair.task}, scale={pair.scale}"]
            )

        if not pair.rust_results:
            tinygo_data = self._extract_sample_data(pair.tinygo_results[0])
            return self._create_validation_result(
                pair.task, pair.scale,
                tinygo_hash=tinygo_data.hash, tinygo_dimensions=tinygo_data.dimensions, tinygo_records=tinygo_data.records,
                issues=[f"Missing Rust implementation for task={pair.task}, scale={pair.scale}"]
            )

        if not pair.tinygo_results:
            rust_data = self._extract_sample_data(pair.rust_results[0])
            return self._create_validation_result(
                pair.task, pair.scale,
                rust_hash=rust_data.hash, rust_dimensions=rust_data.dimensions, rust_records=rust_data.records,
                issues=[f"Missing TinyGo implementation for task={pair.task}, scale={pair.scale}"]
            )

        # Both implementations available - validate consistency
        rust_result = pair.rust_results[0]
        tinygo_result = pair.tinygo_results[0]

        # Check internal consistency if multiple results per language
        internal_issues = []
        internal_issues.extend(self._check_internal_consistency(pair.rust_results, "Rust"))
        internal_issues.extend(self._check_internal_consistency(pair.tinygo_results, "TinyGo"))

        if internal_issues:
            rust_data = self._extract_sample_data(rust_result)
            tinygo_data = self._extract_sample_data(tinygo_result)
            return self._create_validation_result(
                pair.task, pair.scale,
                rust_hash=rust_data.hash, tinygo_hash=tinygo_data.hash,
                rust_dimensions=rust_data.dimensions, tinygo_dimensions=tinygo_data.dimensions,
                rust_records=rust_data.records, tinygo_records=tinygo_data.records,
                issues=internal_issues
            )

        # Perform cross-language validation
        return self._validate_cross_language_consistency(rust_result, tinygo_result)

    def _check_internal_consistency(self, results: list[TaskResult], language: str) -> list[str]:
        """Check internal consistency within a language implementation."""
        if len(results) <= 1:
            return []

        issues = []
        base_result = results[0]

        for result in results[1:]:
            consistency = self._verify_cross_language_hash_match(base_result.samples, result.samples)
            if not consistency.is_consistent:
                issues.append(f"Internal {language} consistency failure: {consistency.issues}")

        return issues

    def _extract_sample_data(self, task_result: TaskResult) -> SampleData:
        """Extract sample data efficiently."""
        if not task_result.samples:
            return SampleData()

        # Use first successful sample
        successful_samples = [s for s in task_result.samples if getattr(s, 'success', True)]
        if not successful_samples:
            return SampleData()

        sample = successful_samples[0]
        return SampleData(
            hash=sample.resultHash,
            dimensions=getattr(sample, 'resultDimensions', None),
            records=getattr(sample, 'recordsProcessed', None)
        )

    def _create_validation_result(
        self, task: str, scale: str,
        rust_hash: int = 0, tinygo_hash: int = 0,
        rust_dimensions: Optional[list[int]] = None, tinygo_dimensions: Optional[list[int]] = None,
        rust_records: Optional[int] = None, tinygo_records: Optional[int] = None,
        issues: Optional[list[str]] = None
    ) -> ValidationResult:
        """Create ValidationResult with standard parameters."""
        return ValidationResult(
            task=task, scale=scale,
            rust_hash=rust_hash, tinygo_hash=tinygo_hash,
            rust_dimensions=rust_dimensions, tinygo_dimensions=tinygo_dimensions,
            rust_records=rust_records, tinygo_records=tinygo_records,
            validation_passed=not bool(issues),
            validation_issues=issues or []
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
            issues.append(f"Scale mismatch: {rust_result.scale} vs {tinygo_result.scale}")

        # Success rate validation
        required_rate = self.config.required_success_rate
        if rust_result.success_rate < required_rate:
            issues.append(f"Rust success rate {rust_result.success_rate:.1%} below threshold {required_rate:.1%}")

        if tinygo_result.success_rate < required_rate:
            issues.append(f"TinyGo success rate {tinygo_result.success_rate:.1%} below threshold {required_rate:.1%}")

        # Sample size validation
        if len(rust_result.samples) < self.MIN_SAMPLES:
            issues.append(f"Rust has insufficient samples: {len(rust_result.samples)} < {self.MIN_SAMPLES}")

        if len(tinygo_result.samples) < self.MIN_SAMPLES:
            issues.append(f"TinyGo has insufficient samples: {len(tinygo_result.samples)} < {self.MIN_SAMPLES}")

        # Hash consistency validation
        hash_result = self._verify_cross_language_hash_match(rust_result.samples, tinygo_result.samples)
        if not hash_result.is_consistent:
            issues.extend(f"Hash consistency: {issue}" for issue in hash_result.issues)

        # Extract data for both languages
        rust_data = self._extract_sample_data(rust_result)
        tinygo_data = self._extract_sample_data(tinygo_result)

        # Structural consistency validation
        if rust_data.dimensions != tinygo_data.dimensions:
            issues.append(f"Dimension mismatch: {rust_data.dimensions} vs {tinygo_data.dimensions}")

        if rust_data.records != tinygo_data.records:
            issues.append(f"Record count mismatch: {rust_data.records} vs {tinygo_data.records}")

        return ValidationResult(
            task=rust_result.task, scale=rust_result.scale,
            rust_hash=rust_data.hash, tinygo_hash=tinygo_data.hash,
            rust_dimensions=rust_data.dimensions, tinygo_dimensions=tinygo_data.dimensions,
            rust_records=rust_data.records, tinygo_records=tinygo_data.records,
            validation_passed=not bool(issues),
            validation_issues=issues
        )

    def _verify_hash_consistency(self, benchmark_samples: list[BenchmarkSample]) -> ConsistencyResult:
        """Verify implementation produces consistent results across multiple runs."""
        if not benchmark_samples:
            return ConsistencyResult(is_consistent=False, issues=["Empty sample list"])

        # Apply sample limit if configured
        samples = self._apply_sample_limit(benchmark_samples)
        issues = [] if len(samples) == len(benchmark_samples) else [
            f"Limited validation to first {len(samples)} samples (from {len(benchmark_samples)} total)"
        ]

        # Group samples by test case and verify consistency
        sample_groups = defaultdict(list)
        for sample in samples:
            sample_groups[(sample.task, sample.scale, sample.inputDataHash)].append(sample)

        inconsistent_groups = 0
        for key, group_samples in sample_groups.items():
            if len(group_samples) < 2:
                continue

            # Check hash consistency within group
            result_hashes = [s.resultHash for s in group_samples]
            hash_counts = Counter(result_hashes)

            if len(hash_counts) > 1:
                inconsistent_groups += 1
                task, scale, input_hash = key
                hash_summary = ", ".join(f"{h}({c}x)" for h, c in hash_counts.items())
                issues.append(f"Inconsistent results for task={task}, scale={scale}, inputHash={input_hash}: {hash_summary}")

        # Validate data integrity
        invalid_samples = [s for s in samples if s.resultHash is None or s.inputDataHash is None]
        if invalid_samples:
            issues.append(f"Found {len(invalid_samples)} samples with missing hash data")

        failed_samples = [s for s in samples if not getattr(s, 'success', True)]
        if failed_samples:
            failure_rate = len(failed_samples) / len(samples)
            issues.append(f"Found {len(failed_samples)} failed executions ({failure_rate:.1%} failure rate)")

        # Check consistency rate
        if sample_groups:
            consistency_rate = 1.0 - (inconsistent_groups / len(sample_groups))
            required_rate = getattr(self.config, 'required_success_rate', 0.95)

            if consistency_rate < required_rate:
                issues.append(f"Consistency rate {consistency_rate:.1%} below required {required_rate:.1%}")

        return ConsistencyResult(is_consistent=inconsistent_groups == 0, issues=issues)

    def _apply_sample_limit(self, samples: list[BenchmarkSample]) -> list[BenchmarkSample]:
        """Apply sample limit if configured."""
        sample_limit = getattr(self.config, 'sample_limit', 0)
        return samples[:sample_limit] if sample_limit > 0 and len(samples) > sample_limit else samples

    def _verify_cross_language_hash_match(
        self, primary_samples: list[BenchmarkSample], secondary_samples: list[BenchmarkSample]
    ) -> ConsistencyResult:
        """Verify two language implementations produce identical result hashes."""
        issues = []

        # Early validation
        if not primary_samples or not secondary_samples:
            missing = []
            if not primary_samples: missing.append("Primary samples list is empty")
            if not secondary_samples: missing.append("Secondary samples list is empty")
            return ConsistencyResult(is_consistent=False, issues=missing)

        # Build hash lookup tables efficiently
        primary_lookup = self._build_hash_lookup(primary_samples, "primary", issues)
        secondary_lookup = self._build_hash_lookup(secondary_samples, "secondary", issues)

        # Compare test case coverage
        primary_keys = set(primary_lookup.keys())
        secondary_keys = set(secondary_lookup.keys())

        self._check_test_coverage(primary_keys, secondary_keys, issues)

        # Compare hash values for common test cases
        common_keys = primary_keys & secondary_keys
        hash_mismatches = self._compare_hashes(primary_lookup, secondary_lookup, common_keys, issues)

        # Apply tolerance threshold
        if common_keys and hash_mismatches > 0:
            mismatch_rate = hash_mismatches / len(common_keys)
            tolerance = 1.0 - self.config.required_success_rate

            if mismatch_rate > tolerance:
                issues.append(f"Hash mismatch rate {mismatch_rate:.1%} exceeds tolerance {tolerance:.1%}")

        return ConsistencyResult(is_consistent=hash_mismatches == 0 and not issues, issues=issues)

    def _build_hash_lookup(self, samples: list[BenchmarkSample], label: str, issues: list[str]) -> dict:
        """Build hash lookup table and detect internal inconsistencies."""
        lookup = {}
        for sample in samples:
            key = (sample.task, sample.scale, sample.inputDataHash)
            if key in lookup and lookup[key] != sample.resultHash:
                issues.append(f"Inconsistent {label} results for {key}: {lookup[key]} vs {sample.resultHash}")
            else:
                lookup[key] = sample.resultHash
        return lookup

    def _check_test_coverage(self, primary_keys: set, secondary_keys: set, issues: list[str]) -> None:
        """Check for missing test cases between implementations."""
        missing_in_secondary = primary_keys - secondary_keys
        missing_in_primary = secondary_keys - primary_keys

        for key in missing_in_secondary:
            task, scale, input_hash = key
            issues.append(f"Test case missing in secondary: task={task}, scale={scale}, inputHash={input_hash}")

        for key in missing_in_primary:
            task, scale, input_hash = key
            issues.append(f"Test case missing in primary: task={task}, scale={scale}, inputHash={input_hash}")

    def _compare_hashes(self, primary_lookup: dict, secondary_lookup: dict, common_keys: set, issues: list[str]) -> int:
        """Compare hash values and return mismatch count."""
        mismatches = 0
        for key in common_keys:
            primary_hash = primary_lookup[key]
            secondary_hash = secondary_lookup[key]

            if primary_hash != secondary_hash:
                mismatches += 1
                task, scale, input_hash = key
                issues.append(f"Hash mismatch for task={task}, scale={scale}, inputHash={input_hash}: primary={primary_hash}, secondary={secondary_hash}")

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
    config_parser.get_validation_config()

    print("🔄 Executing validation pipeline...")
    print("⚠️  Note: Validation functionality is currently under development")
    print(
        f"📁 Configuration loaded from: {'configs/bench-quick.yaml' if quick_mode else 'configs/bench.yaml'}"
    )
    print(f"📁 Data loaded from: {latest_file}")
    print(f"📁 Reports would be saved to: {output_dir}")

    print("\n📊 Validation Summary:")
    print("   • Status: Implementation in progress")
    print("   • Framework: Ready for validation logic")
    print("   • Infrastructure: Complete")
    print("\n🔍 Validation pipeline setup complete!")
    print(f"📁 Output directory ready: {output_dir}")


if __name__ == "__main__":
    main()
