"""
Visualization module for WebAssembly benchmark analysis results.

Generates performance comparison charts, statistical visualizations, and decision
support graphics with configurable styling and engineering-focused presentation.
"""

import os

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.lines import Line2D
from matplotlib.patches import Rectangle

from . import common
from .data_models import (ComparisonResult, PlotsConfiguration,
                          SignificanceCategory)


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

    def create_execution_time_comparison(
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
        # Validate input
        if not comparisons:
            raise ValueError("No comparison results provided")

        # Check data completeness
        for comparison in comparisons:
            if not hasattr(comparison, "execution_time_comparison") or not hasattr(
                comparison.execution_time_comparison, "t_test"
            ):
                raise ValueError(
                    f"Missing execution time comparison data for {comparison.task}_{comparison.scale}"
                )

        # Create figure with appropriate size for enhanced information
        _, (ax_main, ax_stats) = plt.subplots(
            2,
            1,
            figsize=(
                self.config.figure_sizes["detailed"][0],
                self.config.figure_sizes["detailed"][1] * 1.4,
            ),
        )

        # Prepare data for plotting
        task_scale_labels = []
        rust_means = []
        tinygo_means = []
        rust_medians = []
        tinygo_medians = []
        rust_errors = []
        tinygo_errors = []
        significance_categories = []
        rust_cvs = []
        tinygo_cvs = []

        for comparison in comparisons:
            # Create task-scale label
            label = f"{comparison.task}\n{comparison.scale}"
            task_scale_labels.append(label)

            # Extract comprehensive execution time statistics
            rust_stats = comparison.rust_performance.execution_time
            tinygo_stats = comparison.tinygo_performance.execution_time

            rust_means.append(rust_stats.mean)
            tinygo_means.append(tinygo_stats.mean)
            rust_medians.append(rust_stats.median)
            tinygo_medians.append(tinygo_stats.median)
            rust_cvs.append(rust_stats.coefficient_variation)
            tinygo_cvs.append(tinygo_stats.coefficient_variation)

            # Calculate proper error bars using standard error
            rust_std_err = rust_stats.std / np.sqrt(rust_stats.count)
            tinygo_std_err = tinygo_stats.std / np.sqrt(tinygo_stats.count)
            rust_errors.append(rust_std_err)
            tinygo_errors.append(tinygo_std_err)

            # Use comprehensive significance category instead of just is_significant
            significance_categories.append(
                comparison.execution_time_comparison.significance_category
            )

        # Create grouped bar chart for means
        x = np.arange(len(task_scale_labels))
        width = 0.35

        _ = ax_main.bar(
            x - width / 2,
            rust_means,
            width,
            label="Rust (Mean)",
            color=self.rust_color,
            yerr=rust_errors,
            capsize=5,
            alpha=0.8,
        )
        _ = ax_main.bar(
            x + width / 2,
            tinygo_means,
            width,
            label="TinyGo (Mean)",
            color=self.tinygo_color,
            yerr=tinygo_errors,
            capsize=5,
            alpha=0.8,
        )

        # Add median indicators as diamond markers
        _ = ax_main.scatter(
            x - width / 2,
            rust_medians,
            marker="D",
            color="darkred",
            s=50,
            zorder=3,
            label="Rust (Median)",
            alpha=0.9,
        )
        _ = ax_main.scatter(
            x + width / 2,
            tinygo_medians,
            marker="D",
            color="darkblue",
            s=50,
            zorder=3,
            label="TinyGo (Median)",
            alpha=0.9,
        )

        # Enhanced significance markers with comprehensive categories
        for i, category in enumerate(significance_categories):
            max_height = max(
                rust_means[i] + rust_errors[i], tinygo_means[i] + tinygo_errors[i]
            )

            if category == SignificanceCategory.STRONG_EVIDENCE:
                marker = "🔥"
                color = "red"
            elif (
                category
                == SignificanceCategory.STATISTICALLY_SIGNIFICANT_BUT_SMALL_EFFECT
            ):
                marker = "⚠️"
                color = "orange"
            elif (
                category
                == SignificanceCategory.LARGE_EFFECT_BUT_NOT_STATISTICALLY_CONFIRMED
            ):
                marker = "💡"
                color = "blue"
            else:  # "No significant difference"
                marker = "≈"
                color = "gray"

            ax_main.text(
                i,
                max_height * 1.05,
                marker,
                ha="center",
                va="bottom",
                fontweight="bold",
                fontsize=12,
                color=color,
            )

        # Add winner indicators considering both statistical and practical significance
        for i, comparison in enumerate(comparisons):
            winner = comparison.execution_time_winner
            if winner:
                y_pos = (
                    max(
                        rust_means[i] + rust_errors[i],
                        tinygo_means[i] + tinygo_errors[i],
                    )
                    * 1.15
                )
                winner_symbol = "🏆" if winner == "rust" else "🥇"
                ax_main.text(
                    i, y_pos, winner_symbol, ha="center", va="bottom", fontsize=14
                )

        # Configure main chart axes and labels
        ax_main.set_ylabel(
            "Execution Time (ms)", fontsize=self.config.font_sizes["labels"]
        )
        ax_main.set_title(
            "Execution Time Comparison: Rust vs TinyGo (Mean ± SE with Medians)",
            fontsize=self.config.font_sizes["titles"],
            fontweight="bold",
        )
        ax_main.set_xticks(x)
        ax_main.set_xticklabels(task_scale_labels, rotation=45, ha="right")

        # Create statistics summary panel
        ax_stats.axis("off")

        # Create table with comprehensive statistics
        stats_data = []
        for i, comparison in enumerate(comparisons):
            rust_stats = comparison.rust_performance.execution_time
            tinygo_stats = comparison.tinygo_performance.execution_time

            row = [
                task_scale_labels[i].replace("\n", " "),
                f"{rust_stats.mean:.1f}",
                f"{rust_stats.median:.1f}",
                f"{rust_stats.coefficient_variation:.3f}",
                f"{tinygo_stats.mean:.1f}",
                f"{tinygo_stats.median:.1f}",
                f"{tinygo_stats.coefficient_variation:.3f}",
                (
                    significance_categories[i][:15] + "..."
                    if len(significance_categories[i]) > 15
                    else significance_categories[i]
                ),
            ]
            stats_data.append(row)

        # Create table
        columns = [
            "Task/Scale",
            "Rust Mean",
            "Rust Med",
            "Rust CV",
            "TinyGo Mean",
            "TinyGo Med",
            "TinyGo CV",
            "Significance",
        ]
        table = ax_stats.table(
            cellText=stats_data, colLabels=columns, loc="center", cellLoc="center"
        )
        table.auto_set_font_size(False)
        table.set_fontsize(8)
        table.scale(1, 2)

        # Style the table
        for i in range(len(columns)):
            table[(0, i)].set_facecolor("#E6E6FA")
            table[(0, i)].set_text_props(weight="bold")

        ax_stats.set_title(
            "Statistical Summary",
            fontsize=self.config.font_sizes["labels"],
            fontweight="bold",
            pad=20,
        )

        # Enhanced legend for main chart
        legend_elements = [
            Rectangle((0, 0), 1, 1, facecolor=self.rust_color, alpha=0.8, label="Rust"),
            Rectangle(
                (0, 0), 1, 1, facecolor=self.tinygo_color, alpha=0.8, label="TinyGo"
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

        # Enhanced significance legend
        sig_legend_text = [
            "🔥 Strong evidence",
            "⚠️ Stat. sig. only",
            "💡 Large effect only",
            "≈ No difference",
            "🏆 Winner (both sig.)",
        ]
        for text in sig_legend_text:
            legend_elements.append(Line2D([0], [0], color="white", label=text))

        ax_main.legend(
            handles=legend_elements, loc="upper left", bbox_to_anchor=(1.02, 1)
        )

        # Adjust layout to prevent overlapping
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

    def create_memory_usage_comparison(
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
        # Validate input
        if not comparisons:
            raise ValueError("No comparison results provided")

        # Check data completeness
        for comparison in comparisons:
            if not hasattr(comparison, "memory_usage_comparison") or not hasattr(
                comparison.memory_usage_comparison, "t_test"
            ):
                raise ValueError(
                    f"Missing memory usage comparison data for {comparison.task}_{comparison.scale}"
                )

        # Create figure with appropriate size for enhanced information
        _, (ax_main, ax_stats) = plt.subplots(
            2,
            1,
            figsize=(
                self.config.figure_sizes["detailed"][0],
                self.config.figure_sizes["detailed"][1] * 1.4,
            ),
        )

        # Prepare data for plotting
        task_scale_labels = []
        rust_means = []
        tinygo_means = []
        rust_medians = []
        tinygo_medians = []
        rust_errors = []
        tinygo_errors = []
        significance_categories = []
        rust_cvs = []
        tinygo_cvs = []

        for comparison in comparisons:
            # Create task-scale label
            label = f"{comparison.task}\n{comparison.scale}"
            task_scale_labels.append(label)

            # Extract comprehensive memory usage statistics
            rust_stats = comparison.rust_performance.memory_usage
            tinygo_stats = comparison.tinygo_performance.memory_usage

            rust_means.append(rust_stats.mean)
            tinygo_means.append(tinygo_stats.mean)
            rust_medians.append(rust_stats.median)
            tinygo_medians.append(tinygo_stats.median)
            rust_cvs.append(rust_stats.coefficient_variation)
            tinygo_cvs.append(tinygo_stats.coefficient_variation)

            # Calculate proper error bars using standard error
            rust_std_err = rust_stats.std / np.sqrt(rust_stats.count)
            tinygo_std_err = tinygo_stats.std / np.sqrt(tinygo_stats.count)
            rust_errors.append(rust_std_err)
            tinygo_errors.append(tinygo_std_err)

            # Use comprehensive significance category
            significance_categories.append(
                comparison.memory_usage_comparison.significance_category
            )

        # Create grouped bar chart for means
        x = np.arange(len(task_scale_labels))
        width = 0.35

        _ = ax_main.bar(
            x - width / 2,
            rust_means,
            width,
            label="Rust (Mean)",
            color=self.rust_color,
            yerr=rust_errors,
            capsize=5,
            alpha=0.8,
        )
        _ = ax_main.bar(
            x + width / 2,
            tinygo_means,
            width,
            label="TinyGo (Mean)",
            color=self.tinygo_color,
            yerr=tinygo_errors,
            capsize=5,
            alpha=0.8,
        )

        # Add median indicators as diamond markers
        _ = ax_main.scatter(
            x - width / 2,
            rust_medians,
            marker="D",
            color="darkred",
            s=50,
            zorder=3,
            label="Rust (Median)",
            alpha=0.9,
        )
        _ = ax_main.scatter(
            x + width / 2,
            tinygo_medians,
            marker="D",
            color="darkblue",
            s=50,
            zorder=3,
            label="TinyGo (Median)",
            alpha=0.9,
        )

        # Enhanced significance markers with comprehensive categories
        for i, category in enumerate(significance_categories):
            max_height = max(
                rust_means[i] + rust_errors[i], tinygo_means[i] + tinygo_errors[i]
            )

            if category == SignificanceCategory.STRONG_EVIDENCE:
                marker = "🔥"
                color = "red"
            elif (
                category
                == SignificanceCategory.STATISTICALLY_SIGNIFICANT_BUT_SMALL_EFFECT
            ):
                marker = "⚠️"
                color = "orange"
            elif (
                category
                == SignificanceCategory.LARGE_EFFECT_BUT_NOT_STATISTICALLY_CONFIRMED
            ):
                marker = "💡"
                color = "blue"
            else:  # "No significant difference"
                marker = "≈"
                color = "gray"

            ax_main.text(
                i,
                max_height * 1.05,
                marker,
                ha="center",
                va="bottom",
                fontweight="bold",
                fontsize=12,
                color=color,
            )

        # Add winner indicators for memory efficiency (lower is better)
        for i, comparison in enumerate(comparisons):
            winner = comparison.memory_usage_winner
            if winner:
                y_pos = (
                    max(
                        rust_means[i] + rust_errors[i],
                        tinygo_means[i] + tinygo_errors[i],
                    )
                    * 1.15
                )
                winner_symbol = "🏆" if winner == "rust" else "🥇"
                ax_main.text(
                    i, y_pos, winner_symbol, ha="center", va="bottom", fontsize=14
                )

        # Configure main chart axes and labels
        ax_main.set_ylabel(
            "Memory Usage (KB)", fontsize=self.config.font_sizes["labels"]
        )
        ax_main.set_title(
            "Memory Usage Comparison: Rust vs TinyGo (Mean ± SE with Medians)",
            fontsize=self.config.font_sizes["titles"],
            fontweight="bold",
        )
        ax_main.set_xticks(x)
        ax_main.set_xticklabels(task_scale_labels, rotation=45, ha="right")

        # Create statistics summary panel
        ax_stats.axis("off")

        # Create table with comprehensive statistics
        stats_data = []
        for i, comparison in enumerate(comparisons):
            rust_stats = comparison.rust_performance.memory_usage
            tinygo_stats = comparison.tinygo_performance.memory_usage

            # Calculate percentage difference (for efficiency comparison)
            pct_diff = ((tinygo_stats.mean - rust_stats.mean) / rust_stats.mean) * 100

            row = [
                task_scale_labels[i].replace("\n", " "),
                f"{rust_stats.mean:.1f}",
                f"{rust_stats.median:.1f}",
                f"{rust_stats.coefficient_variation:.3f}",
                f"{tinygo_stats.mean:.1f}",
                f"{tinygo_stats.median:.1f}",
                f"{tinygo_stats.coefficient_variation:.3f}",
                f"{pct_diff:+.1f}%",
                (
                    significance_categories[i][:12] + "..."
                    if len(significance_categories[i]) > 12
                    else significance_categories[i]
                ),
            ]
            stats_data.append(row)

        # Create table
        columns = [
            "Task/Scale",
            "Rust Mean",
            "Rust Med",
            "Rust CV",
            "TinyGo Mean",
            "TinyGo Med",
            "TinyGo CV",
            "Diff %",
            "Significance",
        ]
        table = ax_stats.table(
            cellText=stats_data, colLabels=columns, loc="center", cellLoc="center"
        )
        table.auto_set_font_size(False)
        table.set_fontsize(8)
        table.scale(1, 2)

        # Style the table
        for i in range(len(columns)):
            table[(0, i)].set_facecolor("#E6E6FA")
            table[(0, i)].set_text_props(weight="bold")

        # Color-code the difference percentage column
        for i in range(1, len(stats_data) + 1):
            diff_cell = table[(i, 7)]  # Diff % column
            diff_value = float(stats_data[i - 1][7].replace("+", "").replace("%", ""))
            if diff_value < 0:  # Rust uses less memory (good for Rust)
                diff_cell.set_facecolor("#FFE6E6")  # Light red background
            elif diff_value > 0:  # TinyGo uses more memory (good for Rust)
                diff_cell.set_facecolor("#E6FFE6")  # Light green background

        ax_stats.set_title(
            "Memory Usage Statistical Summary (Lower is Better)",
            fontsize=self.config.font_sizes["labels"],
            fontweight="bold",
            pad=20,
        )

        # Enhanced legend for main chart
        legend_elements = [
            Rectangle(
                (0, 0),
                1,
                1,
                facecolor=self.rust_color,
                alpha=0.8,
                label="Rust (Zero-cost)",
            ),
            Rectangle(
                (0, 0),
                1,
                1,
                facecolor=self.tinygo_color,
                alpha=0.8,
                label="TinyGo (GC)",
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

        # Enhanced significance legend
        sig_legend_text = [
            "🔥 Strong evidence",
            "⚠️ Stat. sig. only",
            "💡 Large effect only",
            "≈ No difference",
            "🏆 More efficient",
        ]
        for text in sig_legend_text:
            legend_elements.append(Line2D([0], [0], color="white", label=text))

        ax_main.legend(
            handles=legend_elements, loc="upper left", bbox_to_anchor=(1.02, 1)
        )

        # Adjust layout to prevent overlapping
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

    def create_effect_size_heatmap(
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
        row_labels = [label.replace('\n', ' ') for label in task_scale_labels]
        col_labels = ['Execution Time', 'Memory Usage']

        # Create diverging colormap centered at 0
        # Positive values (Rust advantage) = red, Negative values (TinyGo advantage) = blue
        from matplotlib.colors import TwoSlopeNorm

        # Determine color scale limits
        vmax = max(abs(effect_matrix.min()), abs(effect_matrix.max()))
        vmax = max(vmax, 1.0)  # Ensure we can see at least up to large effect size

        norm = TwoSlopeNorm(vmin=-vmax, vcenter=0, vmax=vmax)

        # Create heatmap
        im = ax_main.imshow(
            effect_matrix,
            cmap='RdBu_r',  # Red=positive (Rust advantage), Blue=negative (TinyGo advantage)
            norm=norm,
            aspect='auto'
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
                text_color = 'white' if abs(cohens_d_value) > 0.5 else 'black'
                ax_main.text(
                    j, i, f'{cohens_d_value:.2f}',
                    ha='center', va='center',
                    fontsize=self.config.font_sizes["default"] - 1,
                    fontweight='bold',
                    color=text_color
                )

        # Add colorbar
        cbar = fig.colorbar(im, ax=ax_main, shrink=0.8)
        cbar.set_label("Cohen's d Effect Size", fontsize=self.config.font_sizes["labels"])

        # Add threshold lines on colorbar
        effect_thresholds = [0.3, 0.6, 1.0]  # small, medium, large
        for threshold in effect_thresholds:
            cbar.ax.axhline(y=threshold, color='black', linestyle='--', alpha=0.7, linewidth=1)
            cbar.ax.axhline(y=-threshold, color='black', linestyle='--', alpha=0.7, linewidth=1)

        # Set title
        ax_main.set_title(
            'Cohen\'s d Effect Size Heatmap\n(Red = Rust Advantage, Blue = TinyGo Advantage)',
            fontsize=self.config.font_sizes["titles"],
            fontweight='bold',
            pad=20
        )

        # Create legend panel
        ax_legend.axis('off')

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
            weight = 'bold' if line.endswith(':') or line.startswith('Effect') else 'normal'
            size = self.config.font_sizes["labels"] if weight == 'bold' else self.config.font_sizes["default"] - 1
            ax_legend.text(
                0.05, y_pos, line,
                transform=ax_legend.transAxes,
                fontsize=size,
                fontweight=weight,
                verticalalignment='top'
            )
            y_pos -= 0.05

        # Add significance indicators for each comparison
        y_pos -= 0.05
        ax_legend.text(
            0.05, y_pos, "Statistical Significance:",
            transform=ax_legend.transAxes,
            fontsize=self.config.font_sizes["labels"],
            fontweight='bold',
            verticalalignment='top'
        )
        y_pos -= 0.05

        for i, comparison in enumerate(comparisons):
            exec_sig = "✓" if comparison.execution_time_comparison.is_significant else "✗"
            mem_sig = "✓" if comparison.memory_usage_comparison.is_significant else "✗"

            task_label = row_labels[i][:15] + "..." if len(row_labels[i]) > 15 else row_labels[i]

            ax_legend.text(
                0.05, y_pos, f"{task_label}:",
                transform=ax_legend.transAxes,
                fontsize=self.config.font_sizes["default"] - 2,
                fontweight='bold',
                verticalalignment='top'
            )
            y_pos -= 0.03

            ax_legend.text(
                0.1, y_pos, f"Exec: {exec_sig}  Mem: {mem_sig}",
                transform=ax_legend.transAxes,
                fontsize=self.config.font_sizes["default"] - 2,
                verticalalignment='top'
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

    def create_decision_summary_panel(
        self,
        comparisons: list[ComparisonResult],
        output_path: str = "reports/plots/decision_summary_panel.png",
    ) -> str:
        """
        Generate engineering decision summary panel with clear recommendations.

        Provides actionable language selection guidance based on statistical
        analysis, effect sizes, and practical engineering considerations.

        Args:
            comparisons: Complete statistical comparison results
            output_path: Path for saving the generated decision summary panel

        Returns:
            str: Path to the generated chart file

        Raises:
            ValueError: If insufficient data for decision recommendations
        """
        # TODO: Validate decision data: ensure all comparisons have complete recommendation and confidence data
        # TODO: Extract recommendations: comparison.overall_recommendation, comparison.recommendation_level.value
        # TODO: Handle reliability warnings: check comparison.is_reliable() and display appropriate indicators
        # TODO: Map confidence levels: comparison.confidence_level ("Very High", "High", "Medium", "Low")
        # TODO: Calculate reliability: comparison.is_reliable() for data quality assessment
        # TODO: Create text panel: matplotlib text with structured layout and professional typography
        # TODO: Map confidence to indicators: "Very High" → 🔥, "High" → 👍, "Medium" → 🤔, "Low" → ⚖️
        # TODO: Summarize evidence: execution_time_winner, memory_usage_winner, effect sizes, p-values
        # TODO: Include considerations: comparison.execution_time_comparison.practical_significance vs statistical significance
        # TODO: Format decisions: comparison.recommendation_level.value with actionable guidance
        # TODO: Apply styling: self.config.text_font_size, self.config.panel_background_color
        # TODO: Add warnings: display quality flags when not comparison.is_reliable()
        # TODO: Save panel: plt.savefig(output_path, dpi=self.config.dpi, format='png')
        # TODO: Return validated output_path after successful text panel generation
        return output_path


def main():
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
    """Execute the complete visualization pipeline."""

    # Setup using common utilities
    common.print_analysis_header(
        "WebAssembly Benchmark Visualization Analysis", quick_mode
    )
    output_dir = common.setup_output_directory("plots")

    print("🔄 Executing visualization pipeline...")
    print("⚠️  Note: Visualization functionality is currently under development")
    print(
        f"📁 Configuration loaded from: {'configs/bench-quick.yaml' if quick_mode else 'configs/bench.yaml'}"
    )
    print(f"📁 Reports would be saved to: {output_dir}")

    print("\n📊 Visualization Summary:")
    print("   • Status: Implementation in progress")
    print("   • Framework: Ready for plot generation logic")
    print("   • Infrastructure: Complete")
    print("\n🔍 Visualization pipeline setup complete!")
    print(f"📁 Output directory ready: {output_dir}")
    # TODO: Generate HTML index: link to charts and reports/statistics/ results with navigation
    # TODO: Output summary: print generated file paths, chart count, any errors or warnings
    # TODO: Return exit code: 0 for success, 1 for partial failure, 2 for complete failure
    pass


if __name__ == "__main__":
    main()
