"""
Visualization module for WebAssembly benchmark analysis results.

Generates performance comparison charts, statistical visualizations, and decision
support graphics with configurable styling and engineering-focused presentation.
"""

import json
import os
import sys
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.colors import TwoSlopeNorm
from matplotlib.lines import Line2D
from matplotlib.patches import Rectangle

from . import common
from .data_models import (
    ComparisonResult,
    EffectSize,
    EffectSizeResult,
    MetricComparison,
    MetricType,
    PerformanceStatistics,
    PlotsConfiguration,
    SignificanceCategory,
    StatisticalResult,
    TTestResult,
)


class ChartConstants:
    """Constants for chart styling and configuration."""

    BAR_WIDTH = 0.35
    MARKER_SIZE = 50
    MARKER_FONTSIZE = 12
    WINNER_FONTSIZE = 14
    EFFECT_SIZE_THRESHOLDS = {"small": 0.3, "medium": 0.6, "large": 1.0}

    # Significance markers
    SIGNIFICANCE_MARKERS = {
        SignificanceCategory.STRONG_EVIDENCE: {"marker": "🔥", "color": "red"},
        SignificanceCategory.STATISTICALLY_SIGNIFICANT_BUT_SMALL_EFFECT: {
            "marker": "⚠️",
            "color": "orange",
        },
        SignificanceCategory.LARGE_EFFECT_BUT_NOT_STATISTICALLY_CONFIRMED: {
            "marker": "💡",
            "color": "blue",
        },
    }
    DEFAULT_SIGNIFICANCE = {"marker": "≈", "color": "gray"}


class VisualizationGenerator:
    """
    Chart and visualization generator for benchmark analysis results.

    Integrates with StatisticalAnalysis pipeline to create engineering-focused
    visualizations from ComparisonResult objects. Handles memory units in KB
    (as calculated by statistics.py: (memoryUsed + wasmMemoryBytes) / 1024).

    Note: All chart generation methods expect List[ComparisonResult] with
    complete statistical analysis including t_test, effect_size, and
    practical_significance assessments.
    """

    def __init__(self, plots_config: PlotsConfiguration):
        """
        Initialize visualization generator with configuration settings.

        Args:
            plots_config: Plotting configuration parameters
        """
        self.config = plots_config
        self.constants = ChartConstants()
        self._setup_plotting_style()

    def _setup_plotting_style(self) -> None:
        """Configure matplotlib styling based on configuration settings"""
        # Configure DPI for high-quality output
        plt.rcParams["figure.dpi"] = self.config.dpi_basic
        plt.rcParams["savefig.dpi"] = self.config.dpi_detailed

        # Set professional font styling
        plt.rcParams["font.family"] = "sans-serif"
        plt.rcParams["font.sans-serif"] = ["Arial", "DejaVu Sans", "Liberation Sans"]
        plt.rcParams["font.size"] = self.config.font_sizes["default"]
        plt.rcParams["axes.labelsize"] = self.config.font_sizes["labels"]
        plt.rcParams["axes.titlesize"] = self.config.font_sizes["titles"]
        plt.rcParams["legend.fontsize"] = self.config.font_sizes["default"]
        plt.rcParams["xtick.labelsize"] = self.config.font_sizes["default"]
        plt.rcParams["ytick.labelsize"] = self.config.font_sizes["default"]

        # Configure professional styling with clean appearance
        plt.rcParams["axes.spines.top"] = False
        plt.rcParams["axes.spines.right"] = False
        plt.rcParams["axes.linewidth"] = 0.8
        plt.rcParams["axes.edgecolor"] = "#333333"
        plt.rcParams["axes.grid"] = True
        plt.rcParams["grid.alpha"] = 0.3
        plt.rcParams["grid.linewidth"] = 0.5
        plt.rcParams["grid.color"] = "#cccccc"

        # Set default figure size
        plt.rcParams["figure.figsize"] = self.config.figure_sizes["basic"]

        # Configure layout and spacing
        plt.rcParams["figure.autolayout"] = True
        plt.rcParams["axes.axisbelow"] = True

        # Store language colors for easy access
        self.rust_color = self.config.color_scheme["rust"]
        self.tinygo_color = self.config.color_scheme["tinygo"]

    def _validate_comparison_data(
        self, comparisons: list[ComparisonResult], metric_type: str
    ) -> None:
        """
        Validate comparison data completeness and structure.

        Args:
            comparisons: List of comparison results to validate
            metric_type: Type of metric being validated ('execution_time' or 'memory_usage')

        Raises:
            ValueError: If comparison data is missing or invalid
        """
        if not comparisons:
            raise ValueError("No comparison results provided")

        for comparison in comparisons:
            comparison_attr = f"{metric_type}_comparison"
            if not hasattr(comparison, comparison_attr):
                raise ValueError(
                    f"Missing {metric_type} comparison data for {comparison.task}_{comparison.scale}"
                )

            comparison_obj = getattr(comparison, comparison_attr)
            if not hasattr(comparison_obj, "t_test"):
                raise ValueError(
                    f"Missing t_test data in {metric_type} comparison for {comparison.task}_{comparison.scale}"
                )

    def _extract_comparison_statistics(
        self, comparisons: list[ComparisonResult], metric_type: str
    ) -> dict:
        """
        Extract statistical data for plotting from comparison results.

        Args:
            comparisons: List of comparison results
            metric_type: Type of metric ('execution_time' or 'memory_usage')

        Returns:
            Dictionary containing extracted statistics for plotting
        """
        data = {
            "task_scale_labels": [],
            "rust_means": [],
            "rust_medians": [],
            "rust_errors": [],
            "rust_cvs": [],
            "tinygo_means": [],
            "tinygo_medians": [],
            "tinygo_errors": [],
            "tinygo_cvs": [],
            "significance_categories": [],
        }

        for comparison in comparisons:
            # Create task-scale label
            label = f"{comparison.task}\n{comparison.scale}"
            data["task_scale_labels"].append(label)

            # Extract statistics based on metric type
            if metric_type == "execution_time":
                rust_stats = comparison.rust_performance.execution_time
                tinygo_stats = comparison.tinygo_performance.execution_time
                significance_category = (
                    comparison.execution_time_comparison.significance_category
                )
            else:  # memory_usage
                rust_stats = comparison.rust_performance.memory_usage
                tinygo_stats = comparison.tinygo_performance.memory_usage
                significance_category = (
                    comparison.memory_usage_comparison.significance_category
                )

            # Extract mean, median, and coefficient of variation
            data["rust_means"].append(rust_stats.mean)
            data["rust_medians"].append(rust_stats.median)
            data["rust_cvs"].append(rust_stats.coefficient_variation)

            data["tinygo_means"].append(tinygo_stats.mean)
            data["tinygo_medians"].append(tinygo_stats.median)
            data["tinygo_cvs"].append(tinygo_stats.coefficient_variation)

            # Calculate standard error for error bars
            rust_std_err = rust_stats.std / np.sqrt(rust_stats.count)
            tinygo_std_err = tinygo_stats.std / np.sqrt(tinygo_stats.count)
            data["rust_errors"].append(rust_std_err)
            data["tinygo_errors"].append(tinygo_std_err)

            data["significance_categories"].append(significance_category)

        return data

    def _create_comparison_bar_chart(
        self, ax, data: dict, metric_label: str
    ) -> np.ndarray:
        """
        Create grouped bar chart with means and median markers.

        Args:
            ax: Matplotlib axes object
            data: Dictionary containing statistical data
            metric_label: Label for the metric (e.g., "Execution Time (ms)")

        Returns:
            Array of x positions for additional annotations
        """
        x = np.arange(len(data["task_scale_labels"]))
        width = self.constants.BAR_WIDTH

        # Create grouped bar chart for means
        ax.bar(
            x - width / 2,
            data["rust_means"],
            width,
            label="Rust (Mean)",
            color=self.rust_color,
            yerr=data["rust_errors"],
            capsize=5,
            alpha=0.8,
        )
        ax.bar(
            x + width / 2,
            data["tinygo_means"],
            width,
            label="TinyGo (Mean)",
            color=self.tinygo_color,
            yerr=data["tinygo_errors"],
            capsize=5,
            alpha=0.8,
        )

        # Add median indicators as diamond markers
        ax.scatter(
            x - width / 2,
            data["rust_medians"],
            marker="D",
            color="darkred",
            s=self.constants.MARKER_SIZE,
            zorder=3,
            label="Rust (Median)",
            alpha=0.9,
        )
        ax.scatter(
            x + width / 2,
            data["tinygo_medians"],
            marker="D",
            color="darkblue",
            s=self.constants.MARKER_SIZE,
            zorder=3,
            label="TinyGo (Median)",
            alpha=0.9,
        )

        # Configure axes
        ax.set_ylabel(metric_label, fontsize=self.config.font_sizes["labels"])
        ax.set_xticks(x)
        ax.set_xticklabels(data["task_scale_labels"], rotation=45, ha="right")

        return x

    def _add_significance_markers(
        self,
        ax,
        data: dict,
        comparisons: list[ComparisonResult],
        x_positions: np.ndarray,
        metric_type: str,
    ) -> None:
        """
        Add significance markers and winner indicators to chart.

        Args:
            ax: Matplotlib axes object
            data: Dictionary containing statistical data
            comparisons: List of comparison results
            x_positions: Array of x positions for markers
            metric_type: Type of metric for winner determination
        """
        for i, category in enumerate(data["significance_categories"]):
            max_height = max(
                data["rust_means"][i] + data["rust_errors"][i],
                data["tinygo_means"][i] + data["tinygo_errors"][i],
            )

            # Get marker configuration
            marker_config = self.constants.SIGNIFICANCE_MARKERS.get(
                category, self.constants.DEFAULT_SIGNIFICANCE
            )

            ax.text(
                i,
                max_height * 1.05,
                marker_config["marker"],
                ha="center",
                va="bottom",
                fontweight="bold",
                fontsize=self.constants.MARKER_FONTSIZE,
                color=marker_config["color"],
            )

        # Add winner indicators
        for i, comparison in enumerate(comparisons):
            winner = getattr(comparison, f"{metric_type}_winner")
            if winner:
                y_pos = (
                    max(
                        data["rust_means"][i] + data["rust_errors"][i],
                        data["tinygo_means"][i] + data["tinygo_errors"][i],
                    )
                    * 1.15
                )
                winner_symbol = "🏆" if winner == "rust" else "🥇"
                ax.text(
                    i,
                    y_pos,
                    winner_symbol,
                    ha="center",
                    va="bottom",
                    fontsize=self.constants.WINNER_FONTSIZE,
                )

    def _create_statistics_table(
        self,
        ax,
        data: dict,
        comparisons: list[ComparisonResult],
        metric_type: str,
        include_percentage_diff: bool = False,
    ) -> None:
        """
        Create statistics summary table for comparison results.

        Args:
            ax: Matplotlib axes object for the table
            data: Dictionary containing statistical data
            comparisons: List of comparison results
            metric_type: Type of metric ('execution_time' or 'memory_usage')
            include_percentage_diff: Whether to include percentage difference column
        """
        ax.axis("off")

        # Build table data
        stats_data = []
        for i, comparison in enumerate(comparisons):
            if metric_type == "execution_time":
                rust_stats = comparison.rust_performance.execution_time
                tinygo_stats = comparison.tinygo_performance.execution_time
            else:  # memory_usage
                rust_stats = comparison.rust_performance.memory_usage
                tinygo_stats = comparison.tinygo_performance.memory_usage

            row = [
                data["task_scale_labels"][i].replace("\n", " "),
                f"{rust_stats.mean:.1f}",
                f"{rust_stats.median:.1f}",
                f"{rust_stats.coefficient_variation:.3f}",
                f"{tinygo_stats.mean:.1f}",
                f"{tinygo_stats.median:.1f}",
                f"{tinygo_stats.coefficient_variation:.3f}",
            ]

            if include_percentage_diff:
                pct_diff = (
                    (tinygo_stats.mean - rust_stats.mean) / rust_stats.mean
                ) * 100
                row.append(f"{pct_diff:+.1f}%")

            significance_text = data["significance_categories"][i].value
            if len(significance_text) > 15:
                significance_text = significance_text[:12] + "..."
            row.append(significance_text)

            stats_data.append(row)

        # Define columns
        columns = [
            "Task/Scale",
            "Rust Mean",
            "Rust Med",
            "Rust CV",
            "TinyGo Mean",
            "TinyGo Med",
            "TinyGo CV",
        ]
        if include_percentage_diff:
            columns.append("Diff %")
        columns.append("Significance")

        # Create table
        table = ax.table(
            cellText=stats_data, colLabels=columns, loc="center", cellLoc="center"
        )
        table.auto_set_font_size(False)
        table.set_fontsize(8)
        table.scale(1, 2)

        # Style the table header
        for i in range(len(columns)):
            table[(0, i)].set_facecolor("#E6E6FA")
            table[(0, i)].set_text_props(weight="bold")

        # Color-code percentage difference column if present
        if include_percentage_diff:
            diff_col_idx = len(columns) - 2  # Second to last column
            for i in range(1, len(stats_data) + 1):
                diff_cell = table[(i, diff_col_idx)]
                diff_value = float(
                    stats_data[i - 1][diff_col_idx].replace("+", "").replace("%", "")
                )
                if diff_value < 0:  # Rust performs better
                    diff_cell.set_facecolor("#FFE6E6")  # Light red
                elif diff_value > 0:  # TinyGo performs worse
                    diff_cell.set_facecolor("#E6FFE6")  # Light green

        # Set table title
        title_suffix = " (Lower is Better)" if metric_type == "memory_usage" else ""
        title = f"Statistical Summary{title_suffix}"
        ax.set_title(
            title,
            fontsize=self.config.font_sizes["labels"],
            fontweight="bold",
            pad=20,
        )

    def _create_comparison_legend(
        self, ax, metric_type: str = "execution_time"
    ) -> None:
        """
        Create enhanced legend for comparison charts.

        Args:
            ax: Matplotlib axes object
            metric_type: Type of metric for context-specific labels
        """
        # Create language-specific labels based on metric type
        if metric_type == "memory_usage":
            rust_label = "Rust (Zero-cost)"
            tinygo_label = "TinyGo (GC)"
        else:
            rust_label = "Rust"
            tinygo_label = "TinyGo"

        legend_elements = [
            Rectangle(
                (0, 0), 1, 1, facecolor=self.rust_color, alpha=0.8, label=rust_label
            ),
            Rectangle(
                (0, 0), 1, 1, facecolor=self.tinygo_color, alpha=0.8, label=tinygo_label
            ),
            Line2D(
                [0],
                [0],
                color="black",
                marker="_",
                linestyle="None",
                markersize=10,
                label="95% CI (SE)",
            ),
            Line2D(
                [0],
                [0],
                color="black",
                marker="D",
                linestyle="None",
                markersize=8,
                label="Median",
            ),
        ]

        # Add significance interpretation
        sig_legend_text = [
            "🔥 Strong evidence",
            "⚠️ Stat. sig. only",
            "💡 Large effect only",
            "≈ No difference",
        ]

        winner_label = (
            "🏆 Winner (both sig.)"
            if metric_type == "execution_time"
            else "🏆 More efficient"
        )
        sig_legend_text.append(winner_label)

        for text in sig_legend_text:
            legend_elements.append(Line2D([0], [0], color="white", label=text))

        ax.legend(handles=legend_elements, loc="upper left", bbox_to_anchor=(1.02, 1))

    def _save_plot(self, output_path: str) -> str:
        """
        Save plot with consistent settings and error handling.

        Args:
            output_path: Path for saving the plot

        Returns:
            str: Path to the saved plot file

        Raises:
            OSError: If unable to create output directory or save file
        """
        # Create output directory if it doesn't exist
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        # Adjust layout to prevent overlapping
        plt.tight_layout()

        # Save the plot with high quality settings
        plt.savefig(
            output_path,
            dpi=self.config.dpi_detailed,
            format=self.config.output_format,
            bbox_inches="tight",
        )
        plt.close()

        return output_path

    def _create_execution_time_comparison(
        self,
        comparisons: list[ComparisonResult],
        output_path: str = "reports/plots/execution_time_comparison.png",
    ) -> str:
        """
        Generate execution time comparison chart across all benchmark tasks.

        Shows Rust vs TinyGo execution times with comprehensive statistical analysis including
        means, medians, variability metrics, and both statistical and practical significance.

        Args:
            comparisons: Statistical comparison results for all tasks and scales
            output_path: Path for saving the generated execution time chart

        Returns:
            str: Path to the generated chart file

        Raises:
            ValueError: If no comparison results provided or invalid data
        """
        # Validate input and data completeness
        self._validate_comparison_data(comparisons, "execution_time")

        # Create figure with appropriate size for enhanced information
        _, (ax_main, ax_stats) = plt.subplots(
            2,
            1,
            figsize=(
                self.config.figure_sizes["detailed"][0],
                self.config.figure_sizes["detailed"][1] * 1.4,
            ),
        )

        # Extract statistical data for plotting
        data = self._extract_comparison_statistics(comparisons, "execution_time")

        # Create bar chart and get x positions
        x = self._create_comparison_bar_chart(ax_main, data, "Execution Time (ms)")

        # Add significance markers and winner indicators
        self._add_significance_markers(ax_main, data, comparisons, x, "execution_time")

        # Set main chart title
        ax_main.set_title(
            "Execution Time Comparison: Rust vs TinyGo (Mean ± SE with Medians)",
            fontsize=self.config.font_sizes["titles"],
            fontweight="bold",
        )

        # Create statistics summary table
        self._create_statistics_table(ax_stats, data, comparisons, "execution_time")

        # Create enhanced legend
        self._create_comparison_legend(ax_main, "execution_time")

        # Save plot
        return self._save_plot(output_path)

    def _create_memory_usage_comparison(
        self,
        comparisons: list[ComparisonResult],
        output_path: str = "reports/plots/memory_usage_comparison.png",
    ) -> str:
        """
        Generate memory usage comparison chart for WebAssembly runtime analysis.

        Compares memory consumption patterns between Rust (zero-cost abstractions)
        and TinyGo (garbage collected) across different computational workloads.

        Args:
            comparisons: Statistical comparison results with memory usage data
            output_path: Path for saving the generated memory usage chart

        Returns:
            str: Path to the generated chart file

        Raises:
            ValueError: If memory usage data is missing or invalid
        """
        # Validate input and data completeness
        self._validate_comparison_data(comparisons, "memory_usage")

        # Create figure with appropriate size for enhanced information
        _, (ax_main, ax_stats) = plt.subplots(
            2,
            1,
            figsize=(
                self.config.figure_sizes["detailed"][0],
                self.config.figure_sizes["detailed"][1] * 1.4,
            ),
        )

        # Extract statistical data for plotting
        data = self._extract_comparison_statistics(comparisons, "memory_usage")

        # Create bar chart and get x positions
        x = self._create_comparison_bar_chart(ax_main, data, "Memory Usage (KB)")

        # Add significance markers and winner indicators
        self._add_significance_markers(ax_main, data, comparisons, x, "memory_usage")

        # Set main chart title
        ax_main.set_title(
            "Memory Usage Comparison: Rust vs TinyGo (Mean ± SE with Medians)",
            fontsize=self.config.font_sizes["titles"],
            fontweight="bold",
        )

        # Create statistics summary table with percentage difference
        self._create_statistics_table(
            ax_stats, data, comparisons, "memory_usage", include_percentage_diff=True
        )

        # Create enhanced legend
        self._create_comparison_legend(ax_main, "memory_usage")

        # Save plot
        return self._save_plot(output_path)

    def _create_effect_size_heatmap(
        self,
        comparisons: list[ComparisonResult],
        output_path: str = "reports/plots/effect_size_heatmap.png",
    ) -> str:
        """
        Generate Cohen's d effect size heatmap for practical significance analysis.

        Visualizes the magnitude of performance differences between languages
        across tasks and scales using color-coded effect size classifications.

        Args:
            comparisons: Statistical comparison results with effect size calculations
            output_path: Path for saving the generated effect size heatmap

        Returns:
            str: Path to the generated chart file

        Raises:
            ValueError: If effect size data is missing from comparisons
        """
        # Validate input
        if not comparisons:
            raise ValueError("No comparison results provided")

        # Check data completeness
        for comparison in comparisons:
            if (
                not hasattr(comparison, "execution_time_comparison")
                or not hasattr(comparison.execution_time_comparison, "effect_size")
                or not hasattr(comparison, "memory_usage_comparison")
                or not hasattr(comparison.memory_usage_comparison, "effect_size")
            ):
                raise ValueError(
                    f"Missing effect size data for {comparison.task}_{comparison.scale}"
                )

        # Create figure with appropriate size
        fig, (ax_main, ax_legend) = plt.subplots(
            1,
            2,
            figsize=(
                self.config.figure_sizes["detailed"][0],
                self.config.figure_sizes["detailed"][1] * 0.8,
            ),
            gridspec_kw={"width_ratios": [4, 1]},
        )

        # Prepare data structure
        task_scale_labels = []
        execution_cohens_d = []
        memory_cohens_d = []

        for comparison in comparisons:
            # Create task-scale label
            label = f"{comparison.task}\n{comparison.scale}"
            task_scale_labels.append(label)

            # Extract Cohen's d values
            exec_cohens_d = comparison.execution_time_comparison.effect_size.cohens_d
            mem_cohens_d = comparison.memory_usage_comparison.effect_size.cohens_d

            execution_cohens_d.append(exec_cohens_d)
            memory_cohens_d.append(mem_cohens_d)

        # Create matrix for heatmap: rows = task×scale, columns = [execution_time, memory_usage]
        effect_matrix = np.array([execution_cohens_d, memory_cohens_d]).T

        # Define row and column labels
        row_labels = [label.replace("\n", " ") for label in task_scale_labels]
        col_labels = ["Execution Time", "Memory Usage"]

        # Create diverging colormap centered at 0
        # Positive values (Rust advantage) = red, Negative values (TinyGo advantage) = blue

        # Determine color scale limits
        vmax = max(abs(effect_matrix.min()), abs(effect_matrix.max()))
        vmax = max(vmax, 1.0)  # Ensure we can see at least up to large effect size

        norm = TwoSlopeNorm(vmin=-vmax, vcenter=0, vmax=vmax)

        # Create heatmap
        im = ax_main.imshow(
            effect_matrix,
            cmap="RdBu_r",  # Red=positive (Rust advantage), Blue=negative (TinyGo advantage)
            norm=norm,
            aspect="auto",
        )

        # Set ticks and labels
        ax_main.set_xticks(range(len(col_labels)))
        ax_main.set_xticklabels(col_labels, fontsize=self.config.font_sizes["labels"])
        ax_main.set_yticks(range(len(row_labels)))
        ax_main.set_yticklabels(row_labels, fontsize=self.config.font_sizes["default"])

        # Annotate cells with Cohen's d values
        for i in range(len(row_labels)):
            for j in range(len(col_labels)):
                cohens_d_value = effect_matrix[i, j]
                text_color = "white" if abs(cohens_d_value) > 0.5 else "black"
                ax_main.text(
                    j,
                    i,
                    f"{cohens_d_value:.2f}",
                    ha="center",
                    va="center",
                    fontsize=self.config.font_sizes["default"] - 1,
                    fontweight="bold",
                    color=text_color,
                )

        # Add colorbar
        cbar = fig.colorbar(im, ax=ax_main, shrink=0.8)
        cbar.set_label(
            "Cohen's d Effect Size", fontsize=self.config.font_sizes["labels"]
        )

        # Add threshold lines on colorbar
        effect_thresholds = [0.3, 0.6, 1.0]  # small, medium, large
        for threshold in effect_thresholds:
            cbar.ax.axhline(
                y=threshold, color="black", linestyle="--", alpha=0.7, linewidth=1
            )
            cbar.ax.axhline(
                y=-threshold, color="black", linestyle="--", alpha=0.7, linewidth=1
            )

        # Set title
        ax_main.set_title(
            "Cohen's d Effect Size Heatmap\n(Red = Rust Advantage, Blue = TinyGo Advantage)",
            fontsize=self.config.font_sizes["titles"],
            fontweight="bold",
            pad=20,
        )

        # Create legend panel
        ax_legend.axis("off")

        # Add effect size interpretation legend
        legend_text = [
            "Effect Size Interpretation:",
            "",
            "🔴 Positive (Red):",
            "  Rust performs better",
            "",
            "🔵 Negative (Blue):",
            "  TinyGo performs better",
            "",
            "Magnitude Thresholds:",
            f"  Small: ±{effect_thresholds[0]:.1f}",
            f"  Medium: ±{effect_thresholds[1]:.1f}",
            f"  Large: ±{effect_thresholds[2]:.1f}",
            "",
            "Cohen's d Guidelines:",
            "  |d| < 0.3: Negligible",
            "  |d| ≥ 0.3: Small effect",
            "  |d| ≥ 0.6: Medium effect",
            "  |d| ≥ 1.0: Large effect",
        ]

        y_pos = 0.95
        for line in legend_text:
            weight = (
                "bold" if line.endswith(":") or line.startswith("Effect") else "normal"
            )
            size = (
                self.config.font_sizes["labels"]
                if weight == "bold"
                else self.config.font_sizes["default"] - 1
            )
            ax_legend.text(
                0.05,
                y_pos,
                line,
                transform=ax_legend.transAxes,
                fontsize=size,
                fontweight=weight,
                verticalalignment="top",
            )
            y_pos -= 0.05

        # Add significance indicators for each comparison
        y_pos -= 0.05
        ax_legend.text(
            0.05,
            y_pos,
            "Statistical Significance:",
            transform=ax_legend.transAxes,
            fontsize=self.config.font_sizes["labels"],
            fontweight="bold",
            verticalalignment="top",
        )
        y_pos -= 0.05

        for i, comparison in enumerate(comparisons):
            exec_sig = (
                "✓" if comparison.execution_time_comparison.is_significant else "✗"
            )
            mem_sig = "✓" if comparison.memory_usage_comparison.is_significant else "✗"

            task_label = (
                row_labels[i][:15] + "..." if len(row_labels[i]) > 15 else row_labels[i]
            )

            ax_legend.text(
                0.05,
                y_pos,
                f"{task_label}:",
                transform=ax_legend.transAxes,
                fontsize=self.config.font_sizes["default"] - 2,
                fontweight="bold",
                verticalalignment="top",
            )
            y_pos -= 0.03

            ax_legend.text(
                0.1,
                y_pos,
                f"Exec: {exec_sig}  Mem: {mem_sig}",
                transform=ax_legend.transAxes,
                fontsize=self.config.font_sizes["default"] - 2,
                verticalalignment="top",
            )
            y_pos -= 0.04

        # Adjust layout
        plt.tight_layout()

        # Create output directory if it doesn't exist
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        # Save the plot
        plt.savefig(
            output_path,
            dpi=self.config.dpi_detailed,
            format=self.config.output_format,
            bbox_inches="tight",
        )
        plt.close()

        return output_path

    def _create_decision_summary_panel(
        self,
        comparisons: list[ComparisonResult],
        output_path: str = "reports/plots/decision_summary.html",
    ) -> str:
        """
        Generate engineering decision summary HTML page using template.

        Creates an HTML dashboard that references the generated visualization plots
        and provides comprehensive analysis results for engineering decision-making.

        Args:
            comparisons: Complete statistical comparison results for analysis
            output_path: Path for saving the generated HTML page

        Returns:
            str: Path to the generated HTML file

        Raises:
            FileNotFoundError: If required visualization plots are missing
            ValueError: If no comparison results provided
        """
        if not comparisons:
            raise ValueError("No comparison results provided for decision summary")

        # Create output directory if it doesn't exist
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        # Define expected plot file paths relative to output directory
        output_dir = Path(output_path).parent
        expected_plots = {
            "execution_time": output_dir / "execution_time_comparison.png",
            "memory_usage": output_dir / "memory_usage_comparison.png",
            "effect_size": output_dir / "effect_size_heatmap.png",
        }

        # Validate that all required plot files exist
        missing_plots = []
        for plot_name, plot_path in expected_plots.items():
            if not plot_path.exists():
                missing_plots.append(f"{plot_name} ({plot_path})")

        if missing_plots:
            error_msg = (
                f"Required visualization plots are missing: {', '.join(missing_plots)}"
            )
            raise FileNotFoundError(error_msg)

        # Load HTML template
        template_path = output_dir / "decision_summary.tpl"
        if not template_path.exists():
            raise FileNotFoundError(f"HTML template not found: {template_path}")

        # Read template content
        with open(template_path, encoding="utf-8") as f:
            template_content = f.read()

        # Generate HTML content using template (placeholder for now)
        # TODO: Implement template variable substitution with comparison data
        html_content = template_content.replace(
            "<!-- HTML template content will be added here -->",
            f"<!-- Analysis of {len(comparisons)} comparison results -->",
        )

        # Write generated HTML file
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(html_content)

        return output_path


def main() -> None:
    """
    Command-line interface for comprehensive visualization generation.

    Orchestrates the creation of all four performance analysis visualizations
    to support engineering decision-making for Rust vs TinyGo selection.
    """
    args = common.setup_analysis_cli(
        "Visualization generation for WebAssembly benchmark analysis"
    )

    try:
        _execute_visualization_pipeline(quick_mode=args.quick)
    except Exception as e:
        common.handle_critical_error(f"Visualization pipeline error: {e}")


def _execute_visualization_pipeline(quick_mode: bool = False) -> None:
    """Execute the complete visualization pipeline with proper error handling."""
    # Setup using common utilities
    common.print_analysis_header(
        "WebAssembly Benchmark Visualization Analysis", quick_mode
    )
    output_dir = common.setup_output_directory("plots")

    # Input path for statistical analysis report
    input_path = Path("reports/statistics/statistical_analysis_report.json")

    # Step 1: Load configuration
    print("🔧 Loading visualization configuration...")
    plots_config = _load_plots_config(quick_mode)

    # Step 2: Load statistical analysis report
    print(f"📂 Loading statistical analysis report from {input_path}...")
    statistical_report = _load_statistical_report(input_path)

    # Step 3: Parse comparison results
    print("🔄 Parsing comparison results...")
    comparison_results = _parse_comparison_results(statistical_report)

    # Step 4: Initialize visualization generator
    print("⚙️ Initializing visualization generator...")
    viz_generator = VisualizationGenerator(plots_config)

    # Step 5: Generate all visualizations
    print("📊 Generating performance visualization plots...")
    generated_files = _generate_all_visualizations(
        comparison_results, viz_generator, output_dir
    )

    # Step 6: Print summary
    _print_visualization_summary(generated_files, output_dir)

    print("\n✅ Visualization pipeline completed successfully!")


def _load_plots_config(quick_mode: bool = False) -> PlotsConfiguration:
    """
    Load plots configuration from YAML file.

    Args:
        quick_mode: Whether to use quick configuration

    Returns:
        PlotsConfiguration: Plotting configuration parameters

    Raises:
        FileNotFoundError: If configuration file doesn't exist
        ValueError: If configuration is invalid
    """
    try:
        config_parser = common.load_configuration(quick_mode)
        return config_parser.get_plots_config()
    except Exception as e:
        print(f"❌ Failed to load plotting configuration: {e}")
        sys.exit(1)


def _load_statistical_report(input_path: Path) -> dict[str, Any]:
    """
    Load statistical analysis report from JSON file.

    Args:
        input_path: Path to statistical analysis report JSON file

    Returns:
        Dict containing the loaded statistical report data

    Raises:
        FileNotFoundError: If the input file does not exist
        ValueError: If the file content is not valid JSON or has incorrect format
    """
    try:
        if not input_path.exists():
            raise FileNotFoundError(
                f"Statistical analysis report not found: {input_path}"
            )

        with open(input_path) as f:
            raw_data = json.load(f)

        # Validate required fields
        _validate_statistical_report_structure(raw_data)

        print(
            f"✅ Loaded statistical report with {raw_data.get('total_comparisons', 0)} comparisons"
        )
        return raw_data

    except FileNotFoundError:
        print(f"❌ Statistical analysis report not found: {input_path}")
        print("💡 Run statistical analysis first to generate the report")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON format in {input_path}: {e}")
        sys.exit(1)
    except (ValueError, KeyError) as e:
        print(f"❌ Invalid statistical report format: {e}")
        sys.exit(1)
    except OSError as e:
        print(f"❌ Error reading {input_path}: {e}")
        sys.exit(1)


def _validate_statistical_report_structure(raw_data: dict[str, Any]) -> None:
    """
    Validate that the loaded JSON has the expected statistical report structure.

    Args:
        raw_data: Dictionary containing the loaded statistical report data

    Raises:
        ValueError: If required fields are missing or data structure is invalid
    """
    required_fields = ["comparison_results", "total_comparisons"]
    for field in required_fields:
        if field not in raw_data:
            raise ValueError(f"Missing required field '{field}' in statistical report")

    if not isinstance(raw_data["comparison_results"], list):
        raise ValueError("Field 'comparison_results' must be a list")

    if raw_data["total_comparisons"] != len(raw_data["comparison_results"]):
        raise ValueError("Inconsistent comparison count in statistical report")


def _parse_comparison_results(
    statistical_report: dict[str, Any],
) -> list[ComparisonResult]:
    """
    Parse comparison results from statistical report JSON data.

    Args:
        statistical_report: Statistical analysis report data

    Returns:
        List of ComparisonResult objects

    Raises:
        ValueError: If comparison data is invalid or incomplete
    """
    try:
        comparison_results = []
        raw_comparisons = statistical_report.get("comparison_results", [])

        if not raw_comparisons:
            print("⚠️ Warning: No comparison results found in statistical report")
            return comparison_results

        print(f"🔍 Parsing {len(raw_comparisons)} comparison results...")

        for i, raw_comparison in enumerate(raw_comparisons):
            try:
                # Convert dictionary data back to ComparisonResult object
                comparison_result = _dict_to_comparison_result(raw_comparison)
                comparison_results.append(comparison_result)

                # Log parsing progress
                task = comparison_result.task
                scale = comparison_result.scale
                print(f"  ✓ Parsed {task}_{scale}")

            except Exception as e:
                print(f"❌ Error parsing comparison {i}: {e}")
                continue

        print(f"✅ Successfully parsed {len(comparison_results)} comparison results")
        return comparison_results

    except Exception as e:
        print(f"❌ Failed to parse comparison results: {e}")
        sys.exit(1)


def _dict_to_comparison_result(raw_comparison: dict[str, Any]) -> ComparisonResult:
    """
    Convert dictionary data to ComparisonResult object.

    Args:
        raw_comparison: Dictionary containing comparison data

    Returns:
        ComparisonResult: Constructed comparison result object

    Raises:
        ValueError: If required fields are missing or invalid
    """
    # Parse comparison result data

    # Extract basic task information
    task = raw_comparison.get("task", "")
    scale = raw_comparison.get("scale", "")

    # Parse performance statistics for both languages
    rust_performance = _parse_performance_statistics(raw_comparison, "rust")
    tinygo_performance = _parse_performance_statistics(raw_comparison, "tinygo")

    # Parse execution time comparison
    execution_time_comparison = _parse_metric_comparison(
        raw_comparison,
        "execution_time_comparison",
        MetricType.EXECUTION_TIME,
        rust_performance,
        tinygo_performance,
    )

    # Parse memory usage comparison
    memory_usage_comparison = _parse_metric_comparison(
        raw_comparison,
        "memory_usage_comparison",
        MetricType.MEMORY_USAGE,
        rust_performance,
        tinygo_performance,
    )

    # Extract overall assessment
    confidence_level = raw_comparison.get("confidence_level", "Low")

    return ComparisonResult(
        task=task,
        scale=scale,
        rust_performance=rust_performance,
        tinygo_performance=tinygo_performance,
        execution_time_comparison=execution_time_comparison,
        memory_usage_comparison=memory_usage_comparison,
        confidence_level=confidence_level,
    )


def _parse_performance_statistics(
    raw_comparison: dict[str, Any], language: str
) -> PerformanceStatistics:
    """Parse performance statistics for a specific language."""

    # Parse from statistical analysis report format
    lang_data = raw_comparison[language]
    exec_time_stats = _parse_statistical_result(lang_data["execution_time"])
    memory_stats = _parse_statistical_result(lang_data["memory_usage"])
    success_rate = lang_data.get("success_rate", 1.0)

    return PerformanceStatistics(
        execution_time=exec_time_stats,
        memory_usage=memory_stats,
        success_rate=success_rate,
    )


def _parse_statistical_result(stats_data: dict[str, Any]) -> StatisticalResult:
    """Parse statistical result data."""

    # Parse full format from statistical analysis report
    # Extract min/max from range array if present
    min_val = stats_data.get("min", 0.0)
    max_val = stats_data.get("max", 0.0)

    if (
        "range" in stats_data
        and isinstance(stats_data["range"], list)
        and len(stats_data["range"]) == 2
    ):
        min_val, max_val = stats_data["range"]

    return StatisticalResult(
        count=stats_data.get("count", 0),
        mean=stats_data.get("mean", 0.0),
        std=stats_data.get("std", 0.0),
        min=min_val,
        max=max_val,
        median=stats_data.get("median", 0.0),
        q1=stats_data.get("q1", 0.0),
        q3=stats_data.get("q3", 0.0),
        iqr=stats_data.get("iqr", 0.0),
        coefficient_variation=stats_data.get("coefficient_variation", 0.0),
    )


def _parse_metric_comparison(
    raw_comparison: dict[str, Any],
    comparison_key: str,
    metric_type: MetricType,
    rust_performance: PerformanceStatistics,
    tinygo_performance: PerformanceStatistics,
) -> MetricComparison:
    """Parse metric comparison data."""

    comparison_data = raw_comparison.get(comparison_key, {})

    # Parse t-test results from statistical analysis report format
    t_test_data = comparison_data["test"]
    t_test = TTestResult(
        t_statistic=t_test_data.get("t_statistic", 0.0),
        p_value=t_test_data.get("p_value", 1.0),
        degrees_freedom=1.0,  # Not stored in report
        confidence_interval_lower=t_test_data.get("confidence_interval", [0.0, 0.0])[0],
        confidence_interval_upper=t_test_data.get("confidence_interval", [0.0, 0.0])[1],
        mean_difference=0.0,  # Not stored in report
        is_significant=t_test_data.get("significant", False),
        alpha=0.05,  # Default value
    )

    # Parse effect size results
    effect_data = comparison_data["effect"]
    effect_size_enum = _parse_effect_size_enum(
        effect_data.get("magnitude", "negligible")
    )
    effect_size = EffectSizeResult(
        cohens_d=effect_data.get("cohens_d", 0.0),
        effect_size=effect_size_enum,
        pooled_std=1.0,  # Not stored in report
        magnitude=abs(effect_data.get("cohens_d", 0.0)),
        interpretation=f"{effect_size_enum.value} effect",
        meets_minimum_detectable_effect=effect_data.get(
            "meets_minimum_detectable_effect", False
        ),
    )

    # Extract real statistics based on metric type
    if metric_type == MetricType.EXECUTION_TIME:
        rust_stats = rust_performance.execution_time
        tinygo_stats = tinygo_performance.execution_time
    elif metric_type == MetricType.MEMORY_USAGE:
        rust_stats = rust_performance.memory_usage
        tinygo_stats = tinygo_performance.memory_usage
    else:
        # Fallback - shouldn't happen with current metrics
        rust_stats = rust_performance.execution_time
        tinygo_stats = tinygo_performance.execution_time

    return MetricComparison(
        metric_type=metric_type,
        rust_stats=rust_stats,
        tinygo_stats=tinygo_stats,
        t_test=t_test,
        effect_size=effect_size,
    )


def _parse_effect_size_enum(magnitude_str: str) -> EffectSize:
    """
    Parse effect size string to enum value.

    Args:
        magnitude_str: Effect size magnitude ('negligible', 'small', 'medium', 'large')

    Returns:
        EffectSize: Corresponding enum value

    Raises:
        ValueError: If magnitude_str is not a valid string
    """
    if not isinstance(magnitude_str, str):
        raise ValueError(f"Expected string, got {type(magnitude_str)}")

    magnitude_map = {
        "negligible": EffectSize.NEGLIGIBLE,
        "small": EffectSize.SMALL,
        "medium": EffectSize.MEDIUM,
        "large": EffectSize.LARGE,
    }
    return magnitude_map.get(magnitude_str.lower(), EffectSize.NEGLIGIBLE)


def _generate_all_visualizations(
    comparison_results: list[ComparisonResult],
    viz_generator: VisualizationGenerator,
    output_dir: Path,
) -> list[str]:
    """
    Generate all visualization plots using the VisualizationGenerator.

    Args:
        comparison_results: List of comparison results to visualize
        viz_generator: Initialized visualization generator
        output_dir: Output directory for saving plots

    Returns:
        List of generated file paths

    Raises:
        ValueError: If no comparison results provided
        RuntimeError: If visualization generation fails
    """
    if not comparison_results:
        print("⚠️ Warning: No comparison results available for visualization")
        return []

    generated_files = []

    try:
        # Generate execution time comparison chart
        print("📊 Creating execution time comparison chart...")
        exec_time_path = str(output_dir / "execution_time_comparison.png")
        generated_exec_time = viz_generator._create_execution_time_comparison(
            comparison_results, exec_time_path
        )
        generated_files.append(generated_exec_time)
        print(f"  ✅ Saved execution time chart: {generated_exec_time}")

        # Generate memory usage comparison chart
        print("📊 Creating memory usage comparison chart...")
        memory_path = str(output_dir / "memory_usage_comparison.png")
        generated_memory = viz_generator._create_memory_usage_comparison(
            comparison_results, memory_path
        )
        generated_files.append(generated_memory)
        print(f"  ✅ Saved memory usage chart: {generated_memory}")

        # Generate effect size heatmap
        print("📊 Creating effect size heatmap...")
        heatmap_path = str(output_dir / "effect_size_heatmap.png")
        generated_heatmap = viz_generator._create_effect_size_heatmap(
            comparison_results, heatmap_path
        )
        generated_files.append(generated_heatmap)
        print(f"  ✅ Saved effect size heatmap: {generated_heatmap}")

        # Generate decision summary panel HTML
        print("📊 Creating decision summary panel...")
        decision_path = str(output_dir / "decision_summary.html")
        try:
            generated_decision = viz_generator._create_decision_summary_panel(
                comparison_results, decision_path
            )
            print(f"  ✅ Saved decision summary HTML: {generated_decision}")
        except NotImplementedError:
            print("  ⚠️ Decision summary panel not yet implemented")
        except Exception as e:
            print(f"  ❌ Failed to generate decision summary panel: {e}")

        print(f"✅ Successfully generated {len(generated_files)} visualization plots")
        return generated_files

    except Exception as e:
        print(f"❌ Error during visualization generation: {e}")
        raise RuntimeError(f"Visualization generation failed: {e}") from e


def _print_visualization_summary(generated_files: list[str], output_dir: Path) -> None:
    """
    Print comprehensive visualization generation summary.

    Args:
        generated_files: List of successfully generated file paths
        output_dir: Output directory where files were saved
    """
    print("\n📊 Visualization Generation Summary:")
    print(f"   • Total plots generated: {len(generated_files)}")
    print(f"   • Output directory: {output_dir}")

    if generated_files:
        print("   • Generated files:")
        for file_path in generated_files:
            file_name = Path(file_path).name
            file_size = Path(file_path).stat().st_size / 1024  # KB
            print(f"     - {file_name} ({file_size:.1f} KB)")

        print(f"\n📁 All visualization files saved in {output_dir}")
        print("💡 Open the PNG files to view performance comparison charts")
    else:
        print("   • No files generated - check for errors above")


if __name__ == "__main__":
    main()
