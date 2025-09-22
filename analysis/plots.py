"""
Visualization module for WebAssembly benchmark analysis results.

Generates performance comparison charts, statistical visualizations, and decision
support graphics with configurable styling and engineering-focused presentation.
"""

import os
from typing import Dict, List

import matplotlib as mpl
import matplotlib.pyplot as plt
import numpy as np

from .data_models import ComparisonResult, PlotsConfiguration


class VisualizationGenerator:
    """Chart and visualization generator for benchmark analysis results"""

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
        mpl.rcParams["figure.dpi"] = self.config.dpi_detailed
        mpl.rcParams["savefig.dpi"] = self.config.dpi_detailed
        mpl.rcParams["savefig.format"] = self.config.output_format

        # Set professional font configuration
        mpl.rcParams["font.family"] = "sans-serif"
        mpl.rcParams["font.sans-serif"] = ["Arial", "DejaVu Sans", "Liberation Sans"]
        mpl.rcParams["font.size"] = self.config.font_sizes.get("default", 12)
        mpl.rcParams["axes.titlesize"] = self.config.font_sizes.get("title", 16)
        mpl.rcParams["axes.labelsize"] = self.config.font_sizes.get("label", 14)
        mpl.rcParams["xtick.labelsize"] = self.config.font_sizes.get("tick", 12)
        mpl.rcParams["ytick.labelsize"] = self.config.font_sizes.get("tick", 12)
        mpl.rcParams["legend.fontsize"] = self.config.font_sizes.get("legend", 12)

        # Configure professional styling
        mpl.rcParams["axes.spines.top"] = False
        mpl.rcParams["axes.spines.right"] = False
        mpl.rcParams["axes.linewidth"] = 0.8
        mpl.rcParams["axes.edgecolor"] = "#333333"
        mpl.rcParams["axes.labelcolor"] = "#333333"

        # Grid styling for better readability
        mpl.rcParams["axes.grid"] = True
        mpl.rcParams["grid.alpha"] = 0.3
        mpl.rcParams["grid.linewidth"] = 0.5
        mpl.rcParams["grid.color"] = "#cccccc"

        # Color configuration for consistent language representation
        plt.style.use("default")  # Start with clean slate

        # Set consistent color scheme
        self._language_colors = {
            "rust": self.config.color_scheme.get("rust", "#CE422B"),
            "tinygo": self.config.color_scheme.get("tinygo", "#00ADD8"),
            "default": self.config.color_scheme.get("default", "#2E8B57"),
        }

        # Configure figure layout
        mpl.rcParams["figure.constrained_layout.use"] = True
        mpl.rcParams["figure.autolayout"] = False

    def create_performance_comparison_chart(
        self,
        comparisons: List[ComparisonResult],
        output_path: str = "reports/plots/performance_comparison.png",
    ) -> str:
        """
        Generate comprehensive performance comparison chart across all tasks.

        Args:
            comparisons: Statistical comparison results for all tasks
            output_path: Path for saving the generated chart

        Returns:
            str: Path to the generated chart file
        """

        if not comparisons:
            raise ValueError("No comparison results provided for chart generation")

        # Extract performance data and confidence intervals from comparisons
        tasks = [comp.task for comp in comparisons]
        rust_means = [comp.rust_stats.mean for comp in comparisons]
        tinygo_means = [comp.tinygo_stats.mean for comp in comparisons]

        # Calculate confidence intervals (95% CI using t-distribution approximation)
        rust_ci_lower = [
            (
                comp.t_test.confidence_interval_lower + comp.rust_stats.mean
                if comp.t_test.confidence_interval_lower < 0
                else comp.rust_stats.mean - abs(comp.t_test.confidence_interval_lower)
            )
            for comp in comparisons
        ]
        rust_ci_upper = [
            (
                comp.t_test.confidence_interval_upper + comp.rust_stats.mean
                if comp.t_test.confidence_interval_upper > 0
                else comp.rust_stats.mean + abs(comp.t_test.confidence_interval_upper)
            )
            for comp in comparisons
        ]

        # Error bars for confidence intervals
        rust_errors = [
            [mean - lower for mean, lower in zip(rust_means, rust_ci_lower)],
            [upper - mean for mean, upper in zip(rust_means, rust_ci_upper)],
        ]

        # TinyGo uses same CI logic
        tinygo_ci_lower = [
            comp.tinygo_stats.mean - abs(comp.t_test.confidence_interval_lower)
            for comp in comparisons
        ]
        tinygo_ci_upper = [
            comp.tinygo_stats.mean + abs(comp.t_test.confidence_interval_upper)
            for comp in comparisons
        ]

        tinygo_errors = [
            [mean - lower for mean, lower in zip(tinygo_means, tinygo_ci_lower)],
            [upper - mean for mean, upper in zip(tinygo_means, tinygo_ci_upper)],
        ]

        # Create grouped bar chart
        fig_size = self.config.figure_sizes.get("performance", [12, 8])
        fig, ax = plt.subplots(figsize=fig_size)

        x = np.arange(len(tasks))
        width = 0.35

        # Create bars with error bars representing confidence intervals
        rust_bars = ax.bar(
            x - width / 2,
            rust_means,
            width,
            yerr=rust_errors,
            label="Rust",
            color=self._language_colors["rust"],
            alpha=0.8,
            capsize=5,
            error_kw={"linewidth": 1.5, "capthick": 1.5},
        )

        tinygo_bars = ax.bar(
            x + width / 2,
            tinygo_means,
            width,
            yerr=tinygo_errors,
            label="TinyGo",
            color=self._language_colors["tinygo"],
            alpha=0.8,
            capsize=5,
            error_kw={"linewidth": 1.5, "capthick": 1.5},
        )

        # Include statistical significance indicators (*, **, ***)
        for i, comp in enumerate(comparisons):
            if comp.t_test.is_significant:
                p_val = comp.t_test.p_value
                if p_val < 0.001:
                    sig_marker = "***"
                elif p_val < 0.01:
                    sig_marker = "**"
                elif p_val < 0.05:
                    sig_marker = "*"
                else:
                    continue

                # Place significance marker above the taller bar
                max_height = max(
                    rust_means[i] + rust_errors[1][i],
                    tinygo_means[i] + tinygo_errors[1][i],
                )
                ax.text(
                    i,
                    max_height * 1.05,
                    sig_marker,
                    ha="center",
                    va="bottom",
                    fontweight="bold",
                    fontsize=14,
                )

        # Add clear axis labels and title
        ax.set_xlabel("Benchmark Tasks", fontweight="bold")
        ax.set_ylabel("Execution Time (ms)", fontweight="bold")
        ax.set_title(
            "WebAssembly Performance Comparison: Rust vs TinyGo",
            fontweight="bold",
            pad=20,
        )
        ax.set_xticks(x)
        ax.set_xticklabels(tasks, rotation=45, ha="right")

        # Include legend with confidence level explanations
        from matplotlib.lines import Line2D
        from matplotlib.patches import Rectangle

        legend_elements = [
            Rectangle(
                (0, 0),
                1,
                1,
                facecolor=self._language_colors["rust"],
                alpha=0.8,
                label="Rust",
            ),
            Rectangle(
                (0, 0),
                1,
                1,
                facecolor=self._language_colors["tinygo"],
                alpha=0.8,
                label="TinyGo",
            ),
            Line2D(
                [0], [0], color="black", linewidth=1.5, label="95% Confidence Interval"
            ),
        ]

        ax.legend(
            handles=legend_elements,
            loc="upper right",
            frameon=True,
            fancybox=True,
            shadow=True,
        )

        # Add significance legend
        sig_text = "Significance: * p<0.05, ** p<0.01, *** p<0.001"
        ax.text(
            0.02,
            0.98,
            sig_text,
            transform=ax.transAxes,
            fontsize=10,
            verticalalignment="top",
            bbox=dict(boxstyle="round", facecolor="white", alpha=0.8),
        )

        # Ensure output directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        # Save chart with configured DPI and format
        plt.tight_layout()
        plt.savefig(
            output_path,
            dpi=self.config.dpi_detailed,
            format=self.config.output_format,
            bbox_inches="tight",
        )
        plt.close()

        return output_path

    def create_effect_size_visualization(
        self,
        comparisons: List[ComparisonResult],
        output_path: str = "reports/plots/effect_sizes.png",
    ) -> str:
        """
        Generate effect size visualization showing practical significance.

        Args:
            comparisons: Comparison results with effect size calculations
            output_path: Path for saving the effect size chart

        Returns:
            str: Path to the generated chart file
        """
        # TODO: Extract Cohen's d values from all comparisons
        # TODO: Create horizontal bar chart of effect sizes by task
        # TODO: Color-code bars by effect size magnitude (small/medium/large)
        # TODO: Add reference lines for effect size thresholds
        # TODO: Include confidence intervals for effect sizes
        # TODO: Apply professional styling and clear labeling
        # TODO: Save chart with configured output settings
        # TODO: Return path to generated visualization

        return output_path


def main():
    """Command-line interface for visualization generation"""
    # TODO: Parse command-line arguments for input files and output preferences
    # TODO: Load analysis results from statistical analysis pipeline
    # TODO: Initialize visualization generator with configuration
    # TODO: Generate all requested visualizations
    # TODO: Save charts to specified output directory
    # TODO: Generate visualization manifest for reporting integration
    pass


if __name__ == "__main__":
    main()
