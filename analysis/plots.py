"""
Visualization module for WebAssembly benchmark analysis results.

Generates performance comparison charts, statistical visualizations, and decision
support graphics with configurable styling and engineering-focused presentation.
"""

import json
import os
import sys
import warnings
from pathlib import Path
from typing import Any

import matplotlib.patheffects as patheffects
import matplotlib.pyplot as plt
import numpy as np
from jinja2 import Environment, FileSystemLoader
from matplotlib.colors import TwoSlopeNorm
from matplotlib.lines import Line2D
from matplotlib.patches import FancyBboxPatch, Rectangle

from . import common
from .data_models import (ComparisonResult, EffectSize, EffectSizeResult,
                          MetricComparison, MetricType, PerformanceStatistics,
                          PlotsConfiguration, StatisticalResult, TTestResult)
from .decision import DecisionSummaryGenerator


class ChartConstants:
    """Constants for chart styling and configuration."""

    BAR_WIDTH = 0.35
    MARKER_SIZE = 30  # Reduced from 50 to make median markers less prominent
    MARKER_FONTSIZE = 12
    WINNER_FONTSIZE = 14
    EFFECT_SIZE_THRESHOLDS = {"small": 0.3, "medium": 0.6, "large": 1.0}



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
        self._configure_fonts()
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

        # Add median indicators as diamond markers - less prominent
        ax.scatter(
            x - width / 2,
            data["rust_medians"],
            marker="D",
            color="darkred",
            s=self.constants.MARKER_SIZE,
            zorder=2,  # Lower z-order
            label="Rust (Median)",
            alpha=0.6,  # Reduced transparency
        )
        ax.scatter(
            x + width / 2,
            data["tinygo_medians"],
            marker="D",
            color="darkblue",
            s=self.constants.MARKER_SIZE,
            zorder=2,  # Lower z-order
            label="TinyGo (Median)",
            alpha=0.6,  # Reduced transparency
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
        metric_type: str,
    ) -> None:
        """
        Add simplified significance markers to chart.

        Args:
            ax: Matplotlib axes object
            data: Dictionary containing statistical data
            comparisons: List of comparison results
            metric_type: Type of metric for winner determination
        """
        # Add only simple significance indicators for strong evidence
        for i, comparison in enumerate(comparisons):
            comparison_obj = getattr(comparison, f"{metric_type}_comparison")

            # Only mark cases with both statistical significance AND large effect
            if (comparison_obj.is_significant and
                comparison_obj.effect_size.effect_size.value in ['medium', 'large']):

                max_height = max(
                    data["rust_means"][i] + data["rust_errors"][i],
                    data["tinygo_means"][i] + data["tinygo_errors"][i],
                )

                # Simple asterisk for significance - make more prominent
                ax.text(
                    i,
                    max_height * 1.05,
                    "*",
                    ha="center",
                    va="bottom",
                    fontweight="bold",
                    fontsize=18,
                    color="red",
                )

    def _create_comparison_legend(
        self, ax, metric_type: str = "execution_time"
    ) -> None:
        """
        Create simplified legend for comparison charts.

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
            Line2D(
                [0],
                [0],
                color="red",
                marker="*",
                linestyle="None",
                markersize=16,
                label="* Statistically significant",
            ),
        ]

        ax.legend(handles=legend_elements, loc="upper left", bbox_to_anchor=(1.02, 1))

    def _add_statistical_note(self, fig, comparisons: list[ComparisonResult], metric_type: str) -> None:
        """
        Add statistical summary note below the chart.

        Args:
            fig: Matplotlib figure object
            comparisons: List of comparison results
            metric_type: Type of metric for analysis
        """
        # Count significant results
        significant_count = 0
        rust_wins = 0
        tinygo_wins = 0

        for comparison in comparisons:
            comparison_obj = getattr(comparison, f"{metric_type}_comparison")
            winner = getattr(comparison, f"{metric_type}_winner")

            if (comparison_obj.is_significant and
                comparison_obj.effect_size.effect_size.value in ['medium', 'large']):
                significant_count += 1

                if winner == "rust":
                    rust_wins += 1
                elif winner == "tinygo":
                    tinygo_wins += 1

        # Create summary text
        total_comparisons = len(comparisons)
        note_text = (
            f"Statistical Summary: {significant_count}/{total_comparisons} comparisons "
            f"show statistically significant differences (p<0.05) with medium/large effect sizes. "
        )

        if rust_wins > 0 or tinygo_wins > 0:
            note_text += f"Rust ({rust_wins}), TinyGo ({tinygo_wins})."
        else:
            note_text += "No clear performance advantage found."

        # Add note at bottom of figure with proper spacing
        fig.text(0.1, 0.12, note_text, fontsize=12, ha="left", va="bottom",
                 wrap=True, fontweight='bold', color='#333333')

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

        # Adjust layout to prevent overlapping with more bottom space
        plt.tight_layout(rect=(0, 0.15, 1, 1))  # Leave 15% space at bottom

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

        # Create figure with a single main axis
        fig, ax_main = plt.subplots(
            1,
            1,
            figsize=(
                self.config.figure_sizes["detailed"][0],
                self.config.figure_sizes["detailed"][1] * 1.2,
            ),
        )

        # Extract statistical data for plotting
        data = self._extract_comparison_statistics(comparisons, "execution_time")

        # Create bar chart
        self._create_comparison_bar_chart(ax_main, data, "Execution Time (ms)")

        # Add significance markers and winner indicators
        self._add_significance_markers(ax_main, data, comparisons, "execution_time")

        # Create simplified legend
        self._create_comparison_legend(ax_main, "execution_time")

        # Add statistical summary as figure note
        self._add_statistical_note(fig, comparisons, "execution_time")

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

        # Create figure with a single main axis
        fig, ax_main = plt.subplots(
            1,
            1,
            figsize=(
                self.config.figure_sizes["detailed"][0],
                self.config.figure_sizes["detailed"][1] * 1.2,
            ),
        )

        # Extract statistical data for plotting
        data = self._extract_comparison_statistics(comparisons, "memory_usage")

        # Create bar chart
        self._create_comparison_bar_chart(ax_main, data, "Memory Usage (KB)")

        # Add significance markers and winner indicators
        self._add_significance_markers(ax_main, data, comparisons, "memory_usage")

        # Create simplified legend
        self._create_comparison_legend(ax_main, "memory_usage")

        # Add statistical summary as figure note
        self._add_statistical_note(fig, comparisons, "memory_usage")

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
        # Use the heatmap's colormap + normalization to compute the actual
        # background color for each cell, then pick a high-contrast text
        # color and draw the label with a stroked outline so numbers remain
        # legible on light or dark backgrounds. All annotations use the
        # same font settings from configuration.
        for i in range(len(row_labels)):
            for j in range(len(col_labels)):
                cohens_d_value = effect_matrix[i, j]

                # Map the value to an RGBA color using the image's colormap
                try:
                    rgba = im.cmap(norm(cohens_d_value))
                except Exception:
                    # Fallback: normalize manually and sample cmap
                    cmap = plt.get_cmap("RdBu_r")
                    normalized_value = (cohens_d_value + vmax) / (2 * vmax)
                    rgba = cmap(normalized_value)

                # Compute perceived luminance (standard rec. 709 luma)
                r, g, b, _ = rgba
                luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b

                # Choose text color and contrasting stroke color
                if luminance < 0.5:
                    text_color = "white"
                    stroke_color = "black"
                else:
                    text_color = "black"
                    stroke_color = "white"

                # Draw text with a stroke outline for robust contrast
                txt = ax_main.text(
                    j,
                    i,
                    f"{cohens_d_value:.2f}",
                    ha="center",
                    va="center",
                    fontsize=self.config.font_sizes["default"],
                    fontweight="normal",
                    color=text_color,
                    family=plt.rcParams.get("font.family", ["sans-serif"])[0],
                    zorder=5,
                )

                # Apply a thin contrasting stroke so text is readable on any color
                txt.set_path_effects(
                    [patheffects.withStroke(linewidth=2.5, foreground=stroke_color),]
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

        # Create legend panel
        ax_legend.axis("off")

        # NOTE: a legacy `legend_text` list used to live here. It did not
        # participate in drawing the legend because the code below renders
        # the legend explicitly with multiple `ax_legend.text` and
        # `ax_legend.scatter` calls (which correctly use f-strings such as
        # f"Small: ±{effect_thresholds[0]:.1f}").
        #
        # If you expect changes to the legend to affect the plot, edit the
        # explicit `ax_legend.text` blocks below (or replace them with a
        # rendering loop that consumes a formatted list). Keeping this note
        # here to avoid confusion for future edits.

        # Draw a rounded panel with subtle shadow to contain the legend text
        # Use a structured `legend_items` list to drive rendering so editing
        # the list will change the figure. This avoids duplicated manual
        # text blocks and makes future edits easier.
        legend_items = [
            {"type": "title", "text": "Effect Size Interpretation"},
            {"type": "spacer"},
            {
                "type": "marker",
                "color": self.rust_color,
                "label": "Positive",
                "desc": "Rust performs better",
            },
            {"type": "spacer_small"},
            {
                "type": "marker",
                "color": self.tinygo_color,
                "label": "Negative",
                "desc": "TinyGo performs better",
            },
            {"type": "spacer"},
            {"type": "subheading", "text": "Magnitude Thresholds"},
            {"type": "threshold", "text": f"    Small: ±{effect_thresholds[0]:.1f}"},
            {"type": "threshold", "text": f"    Medium: ±{effect_thresholds[1]:.1f}"},
            {"type": "threshold", "text": f"    Large: ±{effect_thresholds[2]:.1f}"},
            {"type": "spacer"},
            {"type": "subheading", "text": "Cohen's d Guidelines"},
            {"type": "guideline", "text": "    |d| < 0.3: Negligible"},
            {"type": "guideline", "text": "    |d| ≥ 0.3: Small effect"},
            {"type": "guideline", "text": "    |d| ≥ 0.6: Medium effect"},
            {"type": "guideline", "text": "    |d| ≥ 1.0: Large effect"},
        ]

        # Layout parameters
        total_lines = len(legend_items)
        line_height = 0.05
        padding = 0.03
        top = 0.96
        height = total_lines * line_height + padding
        bottom = top - height
        left = 0.04
        width = 0.9

        # Shadow (slightly offset, low alpha)
        shadow = FancyBboxPatch(
            (left + 0.01, bottom - 0.01),
            width,
            height,
            boxstyle="round,pad=0.02,rounding_size=6",
            transform=ax_legend.transAxes,
            linewidth=0,
            facecolor="#000000",
            alpha=0.08,
            zorder=1,
        )
        ax_legend.add_patch(shadow)

        # Main rounded box (soft white fill, subtle light-gray border)
        panel = FancyBboxPatch(
            (left, bottom),
            width,
            height,
            boxstyle="round,pad=0.02,rounding_size=6",
            transform=ax_legend.transAxes,
            linewidth=1,
            edgecolor="#e6e6e6",
            facecolor="#ffffff",
            alpha=0.95,
            zorder=2,
        )
        ax_legend.add_patch(panel)

        # Render legend items driven by legend_items list
        y_pos = top - 0.02
        marker_x = left + 0.06
        label_x = left + 0.12

        for item in legend_items:
            typ = item.get("type")
            if typ == "title":
                ax_legend.text(
                    left + 0.03,
                    y_pos,
                    item["text"],
                    transform=ax_legend.transAxes,
                    fontsize=self.config.font_sizes["labels"],
                    fontweight="bold",
                    verticalalignment="top",
                    zorder=3,
                )
                y_pos -= line_height * 1.2

            elif typ == "marker":
                ax_legend.scatter(
                    [marker_x],
                    [y_pos],
                    transform=ax_legend.transAxes,
                    color=item.get("color"),
                    s=120,
                    marker="o",
                    edgecolors="#333333",
                    linewidths=0.6,
                    zorder=4,
                )
                ax_legend.text(
                    label_x,
                    y_pos,
                    item.get("label"),
                    transform=ax_legend.transAxes,
                    fontsize=self.config.font_sizes["default"],
                    fontweight="bold",
                    verticalalignment="center",
                    zorder=4,
                )
                y_pos -= line_height * 0.9
                ax_legend.text(
                    label_x,
                    y_pos,
                    item.get("desc"),
                    transform=ax_legend.transAxes,
                    fontsize=self.config.font_sizes["default"] - 1,
                    color="#222222",
                    verticalalignment="top",
                    zorder=3,
                )
                y_pos -= line_height * 1.1

            elif typ == "subheading":
                ax_legend.text(
                    left + 0.03,
                    y_pos,
                    item.get("text"),
                    transform=ax_legend.transAxes,
                    fontsize=self.config.font_sizes["default"],
                    fontweight="bold",
                    verticalalignment="top",
                    zorder=3,
                )
                y_pos -= line_height * 0.9

            elif typ == "threshold" or typ == "guideline":
                ax_legend.text(
                    left + 0.06,
                    y_pos,
                    item.get("text"),
                    transform=ax_legend.transAxes,
                    fontsize=self.config.font_sizes["default"] - 1,
                    verticalalignment="top",
                    zorder=3,
                )
                y_pos -= line_height * 0.85

            elif typ == "guideline":
                # handled above
                pass

            elif typ == "spacer":
                y_pos -= line_height * 1.0

            elif typ == "spacer_small":
                y_pos -= line_height * 0.6

            else:
                # Unknown type: render as plain text
                ax_legend.text(
                    left + 0.03,
                    y_pos,
                    str(item),
                    transform=ax_legend.transAxes,
                    fontsize=self.config.font_sizes["default"] - 1,
                    verticalalignment="top",
                    zorder=3,
                )
                y_pos -= line_height * 0.9

        # Layout handled by bbox_inches="tight" in savefig below
        # No manual tight_layout needed

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

    def _create_distribution_variance_analysis(
        self,
        comparisons: list[ComparisonResult],
        output_path: str = "reports/plots/distribution_variance_analysis.png",
    ) -> str:
        """
        Generate distribution and variance analysis using side-by-side box plots.

        Creates comprehensive visualization of data distribution patterns and performance
        variance to support engineering decision-making beyond simple mean comparisons.
        Essential for assessing performance consistency and stability characteristics.

        Args:
            comparisons: Statistical comparison results with complete five-number summaries
            output_path: Path for saving the generated distribution analysis chart

        Returns:
            str: Path to the generated chart file

        Raises:
            ValueError: If required statistical summary data is missing
        """
        # Validate input data and completeness
        if not comparisons:
            raise ValueError("No comparison results provided")

        # Validate that required statistical data exists
        for comparison in comparisons:
            for lang in ['rust', 'tinygo']:
                lang_perf = getattr(comparison, f"{lang}_performance")
                for metric in ['execution_time', 'memory_usage']:
                    stats = getattr(lang_perf, metric)
                    required_fields = ['median', 'q1', 'q3', 'min', 'max', 'mean', 'coefficient_variation']
                    for field in required_fields:
                        if not hasattr(stats, field):
                            raise ValueError(f"Missing {field} in {lang} {metric} statistics")

        # Extract box plot data efficiently using vectorized operations
        box_data = self._extract_box_plot_data(comparisons)

        # Create dual subplot layout with optimized sizing
        fig, (ax_exec, ax_mem) = plt.subplots(
            1,
            2,
            figsize=(
                self.config.figure_sizes["detailed"][0] * 1.4,
                # Increase height to make room for the legend placed above the axes
                self.config.figure_sizes["detailed"][1] * 1.25,
            ),
            gridspec_kw={"wspace": 0.3},
        )

        # Reserve bottom space so we can place the summary note below the axes
        # This avoids overlaying x-axis tick labels. Use subplots_adjust to be
        # explicit about reserved margins instead of relying only on tight_layout.
        # Lower `top` slightly to make layout stable when legends are placed above
        # the axes; we still save with bbox_inches='tight' to include any overflow.
        fig.subplots_adjust(bottom=0.22, top=0.90, left=0.06, right=0.98)

        # Generate box plots for execution time
        self._create_optimized_box_plots(
            ax_exec, box_data["execution_time"], "Execution Time (ms)"
        )

        # Generate box plots for memory usage
        self._create_optimized_box_plots(
            ax_mem, box_data["memory_usage"], "Memory Usage (KB)"
        )

        # Add comprehensive legend
        self._create_distribution_legend(fig)

        # Add statistical summary note (will be placed inside the reserved bottom area)
        self._add_distribution_summary_note(fig, comparisons)

        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        # Layout is already optimally managed by subplots_adjust() above
        # No additional tight_layout needed - manual positioning handles complex elements

        # Save the plot with high quality settings
        # Suppress matplotlib tight_layout warnings for complex manual layouts
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", message="This figure includes Axes that are not compatible with tight_layout")
            plt.savefig(
                output_path,
                dpi=self.config.dpi_detailed,
                format=self.config.output_format,
                bbox_inches="tight",
            )
        plt.close()

        return output_path

    def _extract_box_plot_data(self, comparisons: list[ComparisonResult]) -> dict:
        """
        Extract box plot data efficiently using vectorized operations.

        Returns:
            Dict with 'execution_time' and 'memory_usage' keys, each containing
            task labels and box plot statistics for Rust and TinyGo
        """
        # Pre-allocate data structures for efficiency
        task_labels = [f"{comp.task}\n{comp.scale}" for comp in comparisons]

        # Extract execution time data using list comprehensions (vectorized)
        exec_time_data = {
            'task_labels': task_labels,
            'rust_stats': [self._create_box_stats(comp.rust_performance.execution_time)
                          for comp in comparisons],
            'tinygo_stats': [self._create_box_stats(comp.tinygo_performance.execution_time)
                            for comp in comparisons],
            'rust_cvs': [comp.rust_performance.execution_time.coefficient_variation
                        for comp in comparisons],
            'tinygo_cvs': [comp.tinygo_performance.execution_time.coefficient_variation
                          for comp in comparisons],
        }

        # Extract memory usage data using list comprehensions (vectorized)
        memory_data = {
            'task_labels': task_labels,
            'rust_stats': [self._create_box_stats(comp.rust_performance.memory_usage)
                          for comp in comparisons],
            'tinygo_stats': [self._create_box_stats(comp.tinygo_performance.memory_usage)
                            for comp in comparisons],
            'rust_cvs': [comp.rust_performance.memory_usage.coefficient_variation
                        for comp in comparisons],
            'tinygo_cvs': [comp.tinygo_performance.memory_usage.coefficient_variation
                          for comp in comparisons],
        }

        return {
            'execution_time': exec_time_data,
            'memory_usage': memory_data
        }

    def _create_box_stats(self, stats) -> dict:
        """Create box plot statistics dictionary from StatisticalResult."""
        return {
            'med': stats.median,
            'q1': stats.q1,
            'q3': stats.q3,
            'whislo': stats.min,
            'whishi': stats.max,
            'mean': stats.mean,
            'fliers': []  # No individual outlier points in our statistical summaries
        }

    def _create_optimized_box_plots(self, ax, data: dict, ylabel: str) -> None:
        """
        Create optimized box plots using matplotlib's built-in functionality.

        Args:
            ax: Matplotlib axes object
            data: Box plot data dictionary
            ylabel: Y-axis label
        """
        n_tasks = len(data['task_labels'])
        x_positions = np.arange(n_tasks)

        # Create box plots using matplotlib's bxp function for efficiency
        rust_boxes = ax.bxp(
            data['rust_stats'],
            positions=x_positions - 0.2,  # Offset for side-by-side display
            widths=0.3,
            patch_artist=True,
            showmeans=True,
            meanline=False,
            medianprops={'linewidth': 2, 'color': 'darkred'},
            meanprops={'marker': 'D', 'markerfacecolor': 'darkred',
                      'markeredgecolor': 'darkred', 'markersize': 6},
            boxprops={'facecolor': self.rust_color, 'alpha': 0.7},
            whiskerprops={'linewidth': 1.5},
            capprops={'linewidth': 1.5}
        )

        tinygo_boxes = ax.bxp(
            data['tinygo_stats'],
            positions=x_positions + 0.2,  # Offset for side-by-side display
            widths=0.3,
            patch_artist=True,
            showmeans=True,
            meanline=False,
            medianprops={'linewidth': 2, 'color': 'darkblue'},
            meanprops={'marker': 'D', 'markerfacecolor': 'darkblue',
                      'markeredgecolor': 'darkblue', 'markersize': 6},
            boxprops={'facecolor': self.tinygo_color, 'alpha': 0.7},
            whiskerprops={'linewidth': 1.5},
            capprops={'linewidth': 1.5}
        )

        # Optimized variance warnings with red borders for high CV (>0.1)
        cv_threshold = 0.1
        # Vectorized threshold checking
        rust_high_cv = np.array(data['rust_cvs']) > cv_threshold
        tinygo_high_cv = np.array(data['tinygo_cvs']) > cv_threshold

        # Batch styling operations for performance
        for i, (rust_high, tinygo_high) in enumerate(zip(rust_high_cv, tinygo_high_cv)):
            if rust_high:
                rust_boxes['boxes'][i].set_edgecolor('red')
                rust_boxes['boxes'][i].set_linewidth(2)
            if tinygo_high:
                tinygo_boxes['boxes'][i].set_edgecolor('red')
                tinygo_boxes['boxes'][i].set_linewidth(2)

        # Optimized coefficient of variation annotations with proper spacing
        # Vectorized max height calculation
        rust_maxes = np.array([stats['whishi'] for stats in data['rust_stats']])
        tinygo_maxes = np.array([stats['whishi'] for stats in data['tinygo_stats']])
        max_heights = np.maximum(rust_maxes, tinygo_maxes)

        # Pre-compute styling for batch operations
        rust_cvs = np.array(data['rust_cvs'])
        tinygo_cvs = np.array(data['tinygo_cvs'])

        # Create staggered annotation heights to prevent overlap
        # Place CV annotations for each task, ensuring Rust/TinyGo labels do not overlap
        for i in range(n_tasks):
            base_height = max_heights[i] * 1.02

            rust_x = x_positions[i] - 0.2
            tinygo_x = x_positions[i] + 0.2
            rust_y = base_height
            tinygo_y = base_height + max_heights[i] * 0.05

            # Create the text objects so we can check for overlap and adjust if needed
            fig = ax.figure

            rust_text = ax.text(
                rust_x,
                rust_y,
                f"CV:{rust_cvs[i]:.2f}",
                ha="center",
                va="bottom",
                fontsize=8,
                color="darkred",
                fontweight="bold" if rust_high_cv[i] else "normal",
                bbox=dict(
                    boxstyle="round,pad=0.2",
                    facecolor="white",
                    edgecolor="darkred",
                    alpha=0.8,
                    linewidth=0.5,
                ),
            )

            tiny_text = ax.text(
                tinygo_x,
                tinygo_y,
                f"CV:{tinygo_cvs[i]:.2f}",
                ha="center",
                va="bottom",
                fontsize=8,
                color="darkblue",
                fontweight="bold" if tinygo_high_cv[i] else "normal",
                bbox=dict(
                    boxstyle="round,pad=0.2",
                    facecolor="white",
                    edgecolor="darkblue",
                    alpha=0.8,
                    linewidth=0.5,
                ),
            )

            # Try to detect overlap in rendered (pixel) space and shift TinyGo up if needed
            try:
                # Ensure renderer is available and layout is realized
                # suppress warnings about tight_layout incompatibility during draw
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    fig.canvas.draw()
                renderer = fig.canvas.get_renderer()

                rust_bbox = rust_text.get_window_extent(renderer)
                tiny_bbox = tiny_text.get_window_extent(renderer)

                if rust_bbox.overlaps(tiny_bbox):
                    # Shift tiny_text upward by the height of the rust bbox plus a small margin (pixels)
                    shift_px = rust_bbox.height + 4
                    # Convert pixel shift to data coordinates (y-direction)
                    inv = ax.transData.inverted()
                    _, dy0 = inv.transform((0, shift_px)) - inv.transform((0, 0))
                    # Apply shift in data coordinates
                    tiny_text.set_y(tinygo_y + dy0)
            except Exception:
                # Renderer may not be available (rare); fall back to an additional relative offset
                tiny_text.set_y(tinygo_y + max_heights[i] * 0.05)

        # Configure axes with consistent styling
        ax.set_ylabel(ylabel, fontsize=self.config.font_sizes["labels"])
        ax.set_xticks(x_positions)
        ax.set_xticklabels(data['task_labels'], rotation=45, ha='right')
        ax.grid(True, alpha=0.3)

    def _create_distribution_legend(self, fig) -> None:
        """Create comprehensive legend for distribution analysis."""
        legend_elements = [
            Rectangle((0, 0), 1, 1, facecolor=self.rust_color, alpha=0.7,
                     edgecolor='black', label='Rust'),
            Rectangle((0, 0), 1, 1, facecolor=self.tinygo_color, alpha=0.7,
                     edgecolor='black', label='TinyGo'),
            Line2D([0], [0], color='black', linewidth=2, label='Median'),
            Line2D([0], [0], color='black', marker='D', linestyle='None',
                  markersize=6, label='Mean'),
            Line2D([0], [0], color='red', linewidth=2, label='High Variance (CV>0.1)'),
        ]

        fig.legend(handles=legend_elements, loc='upper center',
                  bbox_to_anchor=(0.5, 1.02), ncol=5, frameon=True)

    def _add_distribution_summary_note(self, fig, comparisons: list[ComparisonResult]) -> None:
        """Add statistical summary note about distribution characteristics."""
        # Optimized distribution statistics calculation using vectorized operations
        cv_threshold = 0.1

        # Extract all CV values efficiently
        exec_cvs = []
        mem_cvs = []
        for comparison in comparisons:
            exec_cvs.extend([
                comparison.rust_performance.execution_time.coefficient_variation,
                comparison.tinygo_performance.execution_time.coefficient_variation
            ])
            mem_cvs.extend([
                comparison.rust_performance.memory_usage.coefficient_variation,
                comparison.tinygo_performance.memory_usage.coefficient_variation
            ])

        # Vectorized threshold checking
        exec_high_cv = np.array(exec_cvs) > cv_threshold
        mem_high_cv = np.array(mem_cvs) > cv_threshold
        high_variance_count = np.sum(exec_high_cv | mem_high_cv)
        total_comparisons = len(comparisons) * 2  # 2 languages per comparison

        # Calculate additional distribution insights
        avg_exec_cv = np.mean(exec_cvs)
        avg_mem_cv = np.mean(mem_cvs)

        # Determine stability assessment
        stability_assessment = "excellent" if high_variance_count == 0 else \
                              "good" if high_variance_count < total_comparisons * 0.3 else \
                              "moderate" if high_variance_count < total_comparisons * 0.6 else "poor"

        summary_text = (
            f"Distribution Analysis Summary ({stability_assessment} performance consistency):\n"
            f"• Variance Assessment: {high_variance_count}/{total_comparisons} measurements show high variability (CV>0.1, red borders)\n"
            f"• Average Coefficients: Execution {avg_exec_cv:.3f}, Memory {avg_mem_cv:.3f}\n"
            f"• Statistical Interpretation: Mean markers (◊) offset from median indicate distribution skewness\n"
            f"• Complements Execution Time Comparison: Variance affects reliability of mean-based performance conclusions\n"
            f"• Supports Effect Size Analysis: High variance (CV>0.1) reduces Cohen's d reliability and practical significance\n"
            f"• Engineering Decision Impact: Low variance = predictable performance, high variance = increased deployment risk"
        )

        # Place the summary box centered below the entire figure (full-width) so
        # it sits directly under the chart area. This avoids overlapping the
        # subplots and keeps the note visually centered under the composed plot.
        try:
            # Use appropriate vertical spacing in the reserved bottom area
            center_x = 0.5
            # Position the text with appropriate distance from the plot area
            text_y = 0.05

            fig.text(
                center_x,
                text_y,
                summary_text,
                fontsize=9,
                ha="center",
                va="bottom",
                bbox=dict(
                    boxstyle="round,pad=0.6",
                    facecolor="#f8f9fa",
                    edgecolor="#dee2e6",
                    alpha=0.95,
                ),
                wrap=True,
                fontweight="normal",
                color="#212529",
                linespacing=1.5,
                transform=fig.transFigure,
            )
        except Exception:
            # Fallback safe absolute placement
            fig.text(
                0.5,
                0.04,
                summary_text,
                fontsize=9,
                ha="center",
                va="bottom",
                bbox=dict(
                    boxstyle="round,pad=0.6",
                    facecolor="#f8f9fa",
                    edgecolor="#dee2e6",
                    alpha=0.95,
                ),
                wrap=True,
                fontweight="normal",
                color="#212529",
                linespacing=1.5,
                transform=fig.transFigure,
            )

    def _extract_stability_insights(self, comparisons: list[ComparisonResult]) -> dict:
        """
        Extract performance stability insights for decision summary integration.

        This method provides quantitative stability metrics that enhance engineering
        decision-making beyond simple mean performance comparisons.

        Args:
            comparisons: Statistical comparison results with variance data

        Returns:
            Dict containing stability insights:
            - stability_score: Overall stability rating (0.0-1.0, higher = more stable)
            - high_variance_ratio: Fraction of measurements with CV > 0.1
            - consistency_winner: Language with better overall consistency
            - risk_assessment: Deployment risk level based on variance patterns
            - detailed_metrics: Per-language CV statistics
        """
        if not comparisons:
            return {}

        cv_threshold = 0.1

        # Extract CV data efficiently
        rust_exec_cvs = [comp.rust_performance.execution_time.coefficient_variation
                        for comp in comparisons]
        rust_mem_cvs = [comp.rust_performance.memory_usage.coefficient_variation
                       for comp in comparisons]
        tinygo_exec_cvs = [comp.tinygo_performance.execution_time.coefficient_variation
                          for comp in comparisons]
        tinygo_mem_cvs = [comp.tinygo_performance.memory_usage.coefficient_variation
                         for comp in comparisons]

        # Calculate language-specific stability metrics
        rust_high_variance = (np.sum(np.array(rust_exec_cvs) > cv_threshold) +
                             np.sum(np.array(rust_mem_cvs) > cv_threshold))
        tinygo_high_variance = (np.sum(np.array(tinygo_exec_cvs) > cv_threshold) +
                               np.sum(np.array(tinygo_mem_cvs) > cv_threshold))

        total_measurements = len(comparisons) * 2  # 2 metrics per comparison

        # Calculate stability scores (inverse of variance ratio)
        rust_stability = 1.0 - (rust_high_variance / total_measurements)
        tinygo_stability = 1.0 - (tinygo_high_variance / total_measurements)
        overall_stability = 1.0 - ((rust_high_variance + tinygo_high_variance) / (total_measurements * 2))

        # Determine consistency winner
        consistency_winner = "rust" if rust_stability > tinygo_stability else \
                           "tinygo" if tinygo_stability > rust_stability else "tie"

        # Risk assessment based on overall stability
        if overall_stability >= 0.9:
            risk_level = "low"
        elif overall_stability >= 0.7:
            risk_level = "moderate"
        elif overall_stability >= 0.5:
            risk_level = "high"
        else:
            risk_level = "critical"

        return {
            'stability_score': overall_stability,
            'high_variance_ratio': (rust_high_variance + tinygo_high_variance) / (total_measurements * 2),
            'consistency_winner': consistency_winner,
            'risk_assessment': risk_level,
            'detailed_metrics': {
                'rust': {
                    'stability_score': rust_stability,
                    'avg_exec_cv': np.mean(rust_exec_cvs),
                    'avg_mem_cv': np.mean(rust_mem_cvs),
                    'high_variance_count': rust_high_variance
                },
                'tinygo': {
                    'stability_score': tinygo_stability,
                    'avg_exec_cv': np.mean(tinygo_exec_cvs),
                    'avg_mem_cv': np.mean(tinygo_mem_cvs),
                    'high_variance_count': tinygo_high_variance
                }
            },
            'engineering_insights': [
                f"Performance consistency leader: {consistency_winner.title() if consistency_winner != 'tie' else 'Neither (tied)'}",
                f"Deployment risk level: {risk_level.title()}",
                f"Stability confidence: {overall_stability:.1%}",
                "High variance reduces the reliability of mean-based performance comparisons",
                "Effect size interpretations should account for variance heterogeneity"
            ]
        }

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
            "distribution_variance_analysis": output_dir / "distribution_variance_analysis.png",
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

        # Load and render template using Jinja2
        template_dir = output_dir / "templates"
        if not template_dir.exists():
            raise FileNotFoundError(f"Template directory not found: {template_dir}")

        env = Environment(loader=FileSystemLoader(str(template_dir)))
        template = env.get_template("decision_summary.tpl")

        # Extract stability insights for enhanced decision making
        stability_insights = self._extract_stability_insights(comparisons)

        # Prepare template data using DecisionSummaryGenerator
        decision_generator = DecisionSummaryGenerator()
        template_data = decision_generator.prepare_template_data(
            comparisons, expected_plots
        )

        # Add stability insights to template data
        template_data['stability_insights'] = stability_insights

        # Render template with data
        html_content = template.render(**template_data)

        # Write generated HTML file
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(html_content)

        return output_path

    def _configure_fonts(self):
        """Configure matplotlib fonts for professional charts."""
        plt.rcParams["font.family"] = "sans-serif"
        plt.rcParams["font.sans-serif"] = ["DejaVu Sans", "Arial", "sans-serif"]


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

        # Generate distribution and variance analysis chart
        print("📊 Creating distribution and variance analysis...")
        distribution_path = str(output_dir / "distribution_variance_analysis.png")
        generated_distribution = viz_generator._create_distribution_variance_analysis(
            comparison_results, distribution_path
        )
        generated_files.append(generated_distribution)
        print(f"  ✅ Saved distribution analysis: {generated_distribution}")

        # Generate decision summary panel HTML
        print("📊 Creating decision summary panel...")
        decision_path = str(output_dir / "decision_summary.html")
        try:
            generated_decision = viz_generator._create_decision_summary_panel(
                comparison_results, decision_path
            )
            generated_files.append(generated_decision)
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
