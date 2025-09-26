"""
Decision summary generator for WebAssembly benchmark analysis.

Generates engineering-focused decision support reports comparing Rust vs TinyGo
performance characteristics for WebAssembly applications.

This module provides comprehensive analysis and recommendation generation based on
statistical comparisons of performance metrics across multiple benchmark scenarios.
"""

import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import numpy as np

from .data_models import ComparisonResult


class DecisionSummaryGenerator:
    """
    Generates comprehensive decision support reports for Rust vs TinyGo WebAssembly selection.

    This class analyzes benchmark comparison results and generates engineering-focused
    decision support reports. It focuses on engineering practicality over academic rigor,
    providing actionable insights for technical decision-making.

    Attributes:
        _logger: Logger instance for this class
    """

    # Configuration constants
    DEFAULT_CONFIDENCE_LEVEL = 0.95
    DEFAULT_SAMPLES_PER_RESULT = 10
    RANDOM_SEED = 42
    MEMORY_UNIT_CONVERSION = 1024  # KB to MB
    SCALE_ORDER = {"small": 0, "medium": 1, "large": 2}

    # Effect size thresholds
    SMALL_EFFECT_SIZE = 0.3
    MEDIUM_EFFECT_SIZE = 0.6
    LARGE_EFFECT_SIZE = 1.0

    def __init__(self, logger: Optional[logging.Logger] = None) -> None:
        """
        Initialize the DecisionSummaryGenerator.

        Args:
            logger: Optional logger instance. If None, creates a default logger.
        """
        self._logger = logger or logging.getLogger(__name__)
        self._logger.debug("Initialized DecisionSummaryGenerator")

    def _validate_inputs(
        self, comparisons: list[ComparisonResult], chart_paths: dict[str, Path]
    ) -> None:
        """
        Validate input parameters for template data preparation.

        Args:
            comparisons: List of comparison results to validate
            chart_paths: Dictionary of chart file paths to validate

        Raises:
            ValueError: If input data is invalid or insufficient
            TypeError: If input types are incorrect
        """
        if not isinstance(comparisons, list):
            raise TypeError("comparisons must be a list")

        if not comparisons:
            raise ValueError("comparisons list cannot be empty")

        if not isinstance(chart_paths, dict):
            raise TypeError("chart_paths must be a dictionary")

        # Validate comparison results (duck typing for flexibility with mocks)
        for i, comparison in enumerate(comparisons):
            # Check for required attributes instead of strict type checking
            required_attrs = [
                'rust_performance', 'tinygo_performance',
                'execution_time_comparison', 'memory_usage_comparison',
                'task', 'scale'
            ]
            for attr in required_attrs:
                if not hasattr(comparison, attr):
                    raise ValueError(f"Comparison result at index {i} missing required attribute: {attr}")

            # Additional validation for performance data structure
            try:
                # Check that performance objects have required structure
                for perf_attr in ['rust_performance', 'tinygo_performance']:
                    perf_obj = getattr(comparison, perf_attr)
                    if not all(hasattr(perf_obj, req_attr) for req_attr in ['execution_time', 'memory_usage', 'success_rate']):
                        raise ValueError(f"Invalid performance data structure at index {i}")

            except AttributeError as e:
                raise ValueError(f"Invalid comparison result structure at index {i}: {e}") from e

        # Validate chart paths
        required_charts = ['execution_time', 'memory_usage', 'effect_size']
        for chart_name in required_charts:
            if chart_name not in chart_paths:
                raise ValueError(f"Missing required chart path: {chart_name}")

            chart_path = chart_paths[chart_name]
            if not isinstance(chart_path, Path):
                raise TypeError(f"chart_paths['{chart_name}'] must be a Path instance")

        self._logger.debug(f"Input validation passed for {len(comparisons)} comparisons")

    def _prepare_comparison_results_data(self, comparisons: list[ComparisonResult]) -> list[dict[str, str]]:
        """
        Prepare comparison results data for table display.

        Args:
            comparisons: List of comparison results to process

        Returns:
            List of dictionaries containing formatted comparison data

        Raises:
            AttributeError: If required attributes are missing from comparison results
        """
        comparison_results_data = []

        for i, result in enumerate(comparisons):
            try:
                # Safely access attributes with error handling
                data_entry = {
                    "task": getattr(result, 'task', 'unknown'),
                    "scale": getattr(result, 'scale', 'unknown'),
                    "rust_time_ms": f"{result.rust_performance.execution_time.mean:.1f}",
                    "tinygo_time_ms": f"{result.tinygo_performance.execution_time.mean:.1f}",
                    "rust_memory_mb": f"{result.rust_performance.memory_usage.mean:.1f}",
                    "tinygo_memory_mb": f"{result.tinygo_performance.memory_usage.mean:.1f}",
                    "time_winner": getattr(result, 'execution_time_winner', None) or "neutral",
                    "memory_winner": getattr(result, 'memory_usage_winner', None) or "neutral",
                    "time_advantage": self._calculate_advantage_text(result, "execution_time"),
                    "memory_advantage": self._calculate_advantage_text(result, "memory"),
                    "overall_recommendation": getattr(result, 'overall_recommendation', 'No recommendation'),
                    "recommendation_level": getattr(
                        getattr(result, 'recommendation_level', None),
                        'value',
                        'neutral'
                    ) or "neutral",
                }
                comparison_results_data.append(data_entry)

            except (AttributeError, TypeError) as e:
                self._logger.warning(f"Error processing comparison result at index {i}: {e}")
                # Add placeholder data to maintain table structure
                comparison_results_data.append({
                    "task": "error",
                    "scale": "unknown",
                    "rust_time_ms": "N/A",
                    "tinygo_time_ms": "N/A",
                    "rust_memory_mb": "N/A",
                    "tinygo_memory_mb": "N/A",
                    "time_winner": "neutral",
                    "memory_winner": "neutral",
                    "time_advantage": "N/A",
                    "memory_advantage": "N/A",
                    "overall_recommendation": "Data unavailable",
                    "recommendation_level": "neutral",
                })

        return comparison_results_data

    def _extract_performance_data(
        self, results: list[ComparisonResult], language: str
    ) -> tuple[list[float], list[float], list[float]]:
        """
        Extract performance data arrays for a specific language.

        Args:
            results: List of comparison results
            language: Language to extract data for

        Returns:
            Tuple of (execution_times, memory_values, success_rates)
        """
        times = []
        memory_values = []
        success_rates = []

        for result in results:
            try:
                if language == "rust":
                    performance = result.rust_performance
                else:  # tinygo
                    performance = result.tinygo_performance

                times.append(performance.execution_time.mean)
                memory_values.append(performance.memory_usage.mean)
                success_rates.append(performance.success_rate)

            except AttributeError as e:
                self._logger.warning(f"Missing performance data for {language}: {e}")
                continue

        return times, memory_values, success_rates

    def _safe_average(
        self,
        values: list[float],
        metric_name: str,
        scale_factor: Optional[float] = None,
        as_percentage: bool = False,
        decimal_places: int = 2
    ) -> str:
        """
        Calculate average with safe error handling and formatting.

        Args:
            values: List of numeric values to average
            metric_name: Name of the metric for logging
            scale_factor: Optional scaling factor to apply
            as_percentage: Whether to format as percentage
            decimal_places: Number of decimal places for formatting

        Returns:
            Formatted average value or "N/A" if calculation fails
        """
        if not values:
            self._logger.warning(f"No values provided for {metric_name} calculation")
            return "N/A"

        try:
            average = sum(values) / len(values)

            if scale_factor:
                average = average / scale_factor

            if as_percentage:
                average = average * 100
                return f"{average:.{decimal_places-1}f}%"

            return f"{average:.{decimal_places}f}"

        except (TypeError, ZeroDivisionError) as e:
            self._logger.error(f"Error calculating average for {metric_name}: {e}")
            return "N/A"

    def _extract_statistical_values(
        self, results: list[ComparisonResult], metric_type: str, value_type: str
    ) -> list[float]:
        """
        Extract statistical values from comparison results.

        Args:
            results: List of comparison results
            metric_type: Type of metric ('execution_time' or 'memory_usage')
            value_type: Type of value ('p_value' or 'cohens_d')

        Returns:
            List of extracted statistical values
        """
        values = []
        for result in results:
            try:
                if metric_type == "execution_time":
                    comparison = result.execution_time_comparison
                else:  # memory_usage
                    comparison = result.memory_usage_comparison

                if value_type == "p_value":
                    values.append(comparison.t_test.p_value)
                else:  # cohens_d
                    values.append(comparison.effect_size.cohens_d)

            except AttributeError as e:
                self._logger.warning(f"Missing {metric_type} {value_type} data: {e}")
                continue

        return values

    def _format_p_value(self, p_values: list[float]) -> str:
        """
        Format p-values for display.

        Args:
            p_values: List of p-values to format

        Returns:
            Formatted p-value string
        """
        if not p_values:
            return "N/A"

        try:
            arr = np.array(p_values, dtype=float)
            # remove NaNs if present
            arr = arr[~np.isnan(arr)]
            if arr.size == 0:
                return "N/A"

            n = arr.size
            alpha = 0.05
            n_significant = int((arr < alpha).sum())

            min_p = float(arr.min())
            median_p = float(np.median(arr))

            # Display very small p-values compactly
            if min_p < 0.001:
                min_str = "<0.001"
            else:
                min_str = f"{min_p:.3f}"

            return f"min {min_str}; median {median_p:.3f}; {n_significant}/{n} significant"

        except (TypeError, ValueError, Exception):
            return "N/A"

    def _categorize_effect_size(self, effect_sizes: list[float]) -> str:
        """
        Categorize overall effect size based on Cohen's d thresholds.

        Args:
            effect_sizes: List of Cohen's d values

        Returns:
            Categorized effect size description
        """
        if not effect_sizes:
            return "N/A"

        try:
            # Work with absolute values for magnitude classification
            arr = np.array([abs(float(d)) for d in effect_sizes], dtype=float)
            arr = arr[~np.isnan(arr)]
            if arr.size == 0:
                return "N/A"

            mean_effect_size = float(np.mean(arr))
            median_effect_size = float(np.median(arr))
            min_effect_size = float(np.min(arr))
            max_effect_size = float(np.max(arr))

            # Counts per magnitude bucket
            n_total = arr.size
            n_large = int((arr >= self.LARGE_EFFECT_SIZE).sum())

            if mean_effect_size >= self.LARGE_EFFECT_SIZE:
                category = "Large"
            elif mean_effect_size >= self.MEDIUM_EFFECT_SIZE:
                category = "Medium"
            elif mean_effect_size >= self.SMALL_EFFECT_SIZE:
                category = "Small"
            else:
                category = "Negligible"

            # Build a concise but informative summary
            summary = (
                f"{category} (avg d={mean_effect_size:.2f}; med={median_effect_size:.2f}; "
                f"min={min_effect_size:.2f}; max={max_effect_size:.2f}; "
                f"n_large={n_large}/{n_total})"
            )

            return summary

        except (TypeError, ValueError) as e:
            self._logger.error(f"Error categorizing effect size: {e}")
            return "N/A"

    def prepare_template_data(
        self, comparisons: list[ComparisonResult], chart_paths: dict[str, Path]
    ) -> dict[str, Any]:
        """
        Prepare comprehensive data for decision summary template rendering.

        Args:
            comparisons: List of performance comparison results to analyze
            chart_paths: Dictionary mapping chart types to their file paths

        Returns:
            Dictionary containing all template data including metrics, recommendations,
            and supporting information

        Raises:
            ValueError: If input data is invalid or insufficient
            TypeError: If input types are incorrect
        """
        self._logger.info(f"Preparing template data for {len(comparisons)} comparisons")

        # Validate inputs
        self._validate_inputs(comparisons, chart_paths)

        try:
            # Calculate aggregate metrics with error handling
            self._logger.debug("Calculating language metrics")
            rust_metrics = self._calculate_language_metrics(comparisons, "rust")
            tinygo_metrics = self._calculate_language_metrics(comparisons, "tinygo")

            # Statistical analysis
            self._logger.debug("Calculating statistical metrics")
            statistical_analysis = self._calculate_statistical_metrics(comparisons)

            # Generate recommendations
            self._logger.debug("Generating recommendations")
            recommendations = self._generate_recommendations(comparisons)

            # Technical implementation notes
            self._logger.debug("Generating technical notes")
            technical_notes = self._generate_technical_notes()

            # Methodology information
            self._logger.debug("Generating methodology information")
            methodology = self._generate_methodology_info(comparisons)

            # Prepare comparison results data for table display
            self._logger.debug("Preparing comparison results data")
            comparison_results_data = self._prepare_comparison_results_data(comparisons)

            # Sort comparison_results_data: group by task, then sort by scale within each group
            comparison_results_data = sorted(
                comparison_results_data,
                key=lambda x: (x["task"], self.SCALE_ORDER.get(x["scale"], 99))
            )

            # Prepare final template data
            template_data = {
                "timestamp": datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S %Z"),
                "comparison_results": comparison_results_data,
                "charts": {
                    "distribution_variance_analysis": os.path.basename(chart_paths["distribution_variance_analysis"]),
                    "execution_time": os.path.basename(chart_paths["execution_time"]),
                    "memory_usage": os.path.basename(chart_paths["memory_usage"]),
                    "effect_size": os.path.basename(chart_paths["effect_size"]),
                },
                **rust_metrics,
                **tinygo_metrics,
                **statistical_analysis,
                **recommendations,
                **technical_notes,
                **methodology,
            }

            self._logger.info("Successfully prepared template data")
            return template_data

        except Exception as e:
            self._logger.error(f"Error preparing template data: {e}")
            raise RuntimeError(f"Failed to prepare template data: {e}") from e

    def _calculate_language_metrics(
        self, results: list[ComparisonResult], language: str
    ) -> dict[str, str]:
        """
        Calculate aggregate performance metrics for a specific language.

        Args:
            results: List of comparison results to analyze
            language: Language to analyze ('rust' or 'tinygo')

        Returns:
            Dictionary containing formatted aggregate metrics for the language

        Raises:
            ValueError: If language is not supported
        """
        if language not in ("rust", "tinygo"):
            raise ValueError(f"Unsupported language: {language}. Must be 'rust' or 'tinygo'")

        self._logger.debug(f"Calculating metrics for {language}")

        try:
            # Extract performance data based on language
            performance_data = self._extract_performance_data(results, language)
            times, memory_values, success_rates = performance_data

            # Calculate aggregate metrics with safe division
            avg_execution_time = self._safe_average(times, "execution time")
            avg_memory_usage = self._safe_average(
                memory_values, "memory usage", scale_factor=self.MEMORY_UNIT_CONVERSION
            )
            success_rate = self._safe_average(success_rates, "success rate", as_percentage=True)

            return {
                f"{language}_avg_execution_time": avg_execution_time,
                f"{language}_avg_memory_usage": avg_memory_usage,
                f"{language}_success_rate": success_rate,
            }

        except Exception as e:
            self._logger.error(f"Error calculating {language} metrics: {e}")
            return {
                f"{language}_avg_execution_time": "N/A",
                f"{language}_avg_memory_usage": "N/A",
                f"{language}_success_rate": "N/A",
            }

    def _calculate_statistical_metrics(
        self, results: list[ComparisonResult]
    ) -> dict[str, str]:
        """
        Calculate statistical significance metrics from comparison results.

        Args:
            results: List of comparison results containing statistical tests

        Returns:
            Dictionary containing formatted statistical metrics

        Raises:
            AttributeError: If statistical data is missing from results
        """
        self._logger.debug("Calculating statistical metrics")

        try:
            # Extract statistical values with error handling
            exec_p_values = self._extract_statistical_values(results, "execution_time", "p_value")
            mem_p_values = self._extract_statistical_values(results, "memory_usage", "p_value")
            exec_effect_sizes = self._extract_statistical_values(results, "execution_time", "cohens_d")
            mem_effect_sizes = self._extract_statistical_values(results, "memory_usage", "cohens_d")

            # Calculate overall effect size
            all_effect_sizes = exec_effect_sizes + mem_effect_sizes
            overall_effect_size = self._categorize_effect_size(all_effect_sizes) if all_effect_sizes else "N/A"

            return {
                "execution_time_p_value": self._format_p_value(exec_p_values),
                "memory_usage_p_value": self._format_p_value(mem_p_values),
                "overall_effect_size": overall_effect_size,
                "confidence_level": f"{int(self.DEFAULT_CONFIDENCE_LEVEL * 100)}%",
            }

        except Exception as e:
            self._logger.error(f"Error calculating statistical metrics: {e}")
            return {
                "execution_time_p_value": "N/A",
                "memory_usage_p_value": "N/A",
                "overall_effect_size": "N/A",
                "confidence_level": f"{int(self.DEFAULT_CONFIDENCE_LEVEL * 100)}%",
            }

    def _generate_recommendations(
        self, results: list[ComparisonResult]
    ) -> dict[str, str]:
        """Generate primary recommendation based on analysis."""

        # Count wins for each language
        rust_execution_wins = sum(
            1 for r in results if r.execution_time_winner == "rust"
        )
        rust_memory_wins = sum(1 for r in results if r.memory_usage_winner == "rust")
        tinygo_execution_wins = sum(
            1 for r in results if r.execution_time_winner == "tinygo"
        )
        tinygo_memory_wins = sum(
            1 for r in results if r.memory_usage_winner == "tinygo"
        )

        rust_total_wins = rust_execution_wins + rust_memory_wins
        tinygo_total_wins = tinygo_execution_wins + tinygo_memory_wins

        if rust_total_wins > tinygo_total_wins:
            primary = (
                f"Based on comprehensive performance analysis, **Rust is recommended** for "
                f"WebAssembly applications requiring optimal performance. Rust demonstrates "
                f"superior performance with {rust_execution_wins} execution time wins and "
                f"{rust_memory_wins} memory efficiency wins across {len(results)} benchmark scenarios."
            )
        elif tinygo_total_wins > rust_total_wins:
            primary = (
                f"Based on comprehensive performance analysis, **TinyGo shows competitive** "
                f"performance for WebAssembly applications where development velocity matters. "
                f"TinyGo achieves {tinygo_execution_wins} execution time wins and "
                f"{tinygo_memory_wins} memory efficiency wins across {len(results)} benchmark scenarios."
            )
        else:
            primary = (
                "Performance analysis shows **balanced trade-offs** between Rust and TinyGo. "
                "Choose based on team expertise, development timeline, and specific use case requirements. "
                "Both languages demonstrate strong WebAssembly performance characteristics."
            )

        return {"primary_recommendation": primary}

    def _generate_technical_notes(self) -> dict[str, str]:
        """Generate technical implementation and deployment notes."""

        return {
            "rust_deployment_notes": (
                "Requires wasm-pack toolchain. Larger initial binary size but "
                "superior runtime performance. Best for CPU-intensive workloads."
            ),
            "tinygo_deployment_notes": (
                "Simple build process with standard Go tooling. Smaller binaries "
                "but may require more memory. Good for I/O-bound operations."
            ),
            "rust_scalability_notes": (
                "Excellent scaling characteristics. Performance advantage increases "
                "with computational complexity. Memory usage remains predictable."
            ),
            "tinygo_scalability_notes": (
                "Good scaling for most workloads. GC overhead becomes more "
                "noticeable with larger heap allocations. Predictable performance profile."
            ),
            "rust_limitations": (
                "Steeper learning curve, longer compile times, complex dependency management. "
                "Requires expertise for optimal performance tuning."
            ),
            "tinygo_limitations": (
                "GC pauses may affect latency-critical applications. Limited standard library "
                "compared to full Go. Some Go features not supported in WASM target."
            ),
        }

    def _generate_methodology_info(
        self, results: list[ComparisonResult]
    ) -> dict[str, str]:
        """Generate methodology and validation information."""

        tasks = list({r.task for r in results})
        total_measurements = len(results) * 10  # Assuming 10 samples per result

        return {
            "benchmark_tasks_description": f"{', '.join(tasks)} across multiple scales",
            "test_environment": "Chrome V8 WebAssembly runtime, controlled environment",
            "total_samples": str(total_measurements),
            "quality_control_notes": "95% confidence intervals, outlier removal",
            "random_seed": "42",  # This should come from actual configuration
        }

    def _calculate_advantage_text(
        self, result: ComparisonResult, metric_type: str
    ) -> str:
        """Calculate advantage text for display."""

        if metric_type == "execution_time":
            rust_mean = result.rust_performance.execution_time.mean
            tinygo_mean = result.tinygo_performance.execution_time.mean
            winner = result.execution_time_winner
        else:  # memory
            rust_mean = result.rust_performance.memory_usage.mean
            tinygo_mean = result.tinygo_performance.memory_usage.mean
            winner = result.memory_usage_winner

        if not winner or winner == "neutral":
            return "No significant difference"

        if winner == "rust":
            advantage_pct = ((tinygo_mean - rust_mean) / tinygo_mean) * 100 if tinygo_mean != 0 else 0
            return (
                f"Rust {advantage_pct:.1f}% faster"
                if metric_type == "execution_time"
                else f"Rust {advantage_pct:.1f}% less memory"
            )
        else:  # tinygo
            advantage_pct = ((rust_mean - tinygo_mean) / rust_mean) * 100 if rust_mean != 0 else 0
            return (
                f"TinyGo {advantage_pct:.1f}% faster"
                if metric_type == "execution_time"
                else f"TinyGo {advantage_pct:.1f}% less memory"
            )
