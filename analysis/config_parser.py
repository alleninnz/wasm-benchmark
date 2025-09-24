"""
Configuration parser module for WebAssembly benchmark analysis pipeline.

Loads and validates configuration from bench.yaml, providing typed access
to quality control, statistical analysis, and visualization parameters.
"""

from pathlib import Path
from typing import Optional

import yaml

from .data_models import (
    ConfigurationData,
    PlotsConfiguration,
    QCConfiguration,
    StatisticsConfiguration,
    ValidationConfiguration,
)


class ConfigParser:
    """Configuration parser for engineering-grade benchmark analysis"""

    def __init__(self, config_path: str = "configs/bench.yaml"):
        """Initialize configuration parser with path to bench.yaml"""
        self.config_path = Path(config_path)
        self._configuration_data: Optional[ConfigurationData] = None

    def load(self) -> "ConfigParser":
        """
        Load and validate configuration file, returning typed configuration data.

        Returns:
            ConfigParser: Self instance for method chaining

        Raises:
            FileNotFoundError: If config file doesn't exist
            yaml.YAMLError: If config file is malformed
            ValueError: If required configuration sections are missing
        """
        if not self.config_path.exists():
            raise FileNotFoundError(f"Configuration file not found: {self.config_path}")

        try:
            with open(self.config_path, encoding="utf-8") as f:
                config_data = yaml.safe_load(f)
        except yaml.YAMLError as e:
            raise yaml.YAMLError(f"Failed to parse YAML configuration: {e}") from e

        if not isinstance(config_data, dict):
            raise ValueError("Configuration file must contain a YAML object")

        # Validate required sections exist
        required_sections = ["qc", "statistics", "plots", "validation"]
        missing_sections = [
            section for section in required_sections if section not in config_data
        ]
        if missing_sections:
            raise ValueError(
                f"Missing required configuration sections: {missing_sections}"
            )

        # Parse QC configuration
        qc_section = config_data["qc"]
        qc_config = QCConfiguration(
            max_coefficient_variation=qc_section.get("max_coefficient_variation", 0.15),
            outlier_iqr_multiplier=qc_section.get("outlier_iqr_multiplier", 1.5),
            min_valid_samples=qc_section.get("min_valid_samples", 80),
            failure_rate=qc_section.get("failure_rate", 0.1),
            quality_invalid_threshold=qc_section.get("quality_invalid_threshold", 0.1),
            quality_warning_threshold=qc_section.get("quality_warning_threshold", 0.3),
        )

        # Parse statistics configuration
        stats_section = config_data["statistics"]
        effect_size_thresholds = stats_section.get("effect_size_thresholds", {})
        # Ensure we have the required effect size thresholds
        default_thresholds = {"small": 0.3, "medium": 0.6, "large": 1.0}
        default_thresholds.update(effect_size_thresholds)

        stats_config = StatisticsConfiguration(
            confidence_level=stats_section.get("confidence_level", 0.95),
            significance_alpha=stats_section.get("significance_alpha", 0.05),
            effect_size_thresholds=default_thresholds,
            minimum_detectable_effect=stats_section.get(
                "minimum_detectable_effect", 0.3
            ),
        )

        # Parse plots configuration
        plots_section = config_data["plots"]

        # Handle font sizes - support nested structure
        font_sizes = plots_section.get(
            "font_sizes",
            {
                "default": 11,
                "labels": 12,
                "titles": 14,
            },
        )

        # Handle figure sizes - support nested structure
        figure_sizes = plots_section.get(
            "figure_sizes",
            {
                "basic": [10, 6],
                "detailed": [16, 12],
            },
        )

        # Handle color scheme - default colors for rust and tinygo
        color_scheme = plots_section.get(
            "color_scheme",
            {
                "rust": "#CE422B",
                "tinygo": "#00ADD8",
            },
        )

        plots_config = PlotsConfiguration(
            dpi_basic=plots_section.get("dpi_basic", 150),
            dpi_detailed=plots_section.get("dpi_detailed", 300),
            output_format=plots_section.get("output_format", "png"),
            figure_sizes=figure_sizes,
            font_sizes=font_sizes,
            color_scheme=color_scheme,
        )

        # Parse validation configuration
        validation_section = config_data["validation"]
        validation_config = ValidationConfiguration(
            required_success_rate=validation_section.get("required_success_rate", 0.95),
            hash_tolerance=validation_section.get("hash_tolerance", 1e-8),
            sample_limit=validation_section.get("sample_limit", 100),
        )

        self._configuration_data = ConfigurationData(
            qc=qc_config,
            statistics=stats_config,
            plots=plots_config,
            validation=validation_config,
        )

        return self

    def get_qc_config(self) -> QCConfiguration:
        """
        Get quality control configuration parameters.

        Returns:
            QCConfiguration: Typed QC configuration object

        Raises:
            RuntimeError: If configuration has not been loaded yet
        """
        if self._configuration_data is None:
            raise RuntimeError("Configuration not loaded. Call load() first.")

        return self._configuration_data.qc

    def get_stats_config(self) -> StatisticsConfiguration:
        """
        Get statistical analysis configuration parameters.

        Returns:
            StatisticsConfiguration: Typed statistics configuration object

        Raises:
            RuntimeError: If configuration has not been loaded yet
        """
        if self._configuration_data is None:
            raise RuntimeError("Configuration not loaded. Call load() first.")

        return self._configuration_data.statistics

    def get_plots_config(self) -> PlotsConfiguration:
        """
        Get visualization and plotting configuration parameters.

        Returns:
            PlotsConfiguration: Typed plots configuration object

        Raises:
            RuntimeError: If configuration has not been loaded yet
        """
        if self._configuration_data is None:
            raise RuntimeError("Configuration not loaded. Call load() first.")

        return self._configuration_data.plots

    def get_validation_config(self) -> ValidationConfiguration:
        """
        Get validation configuration parameters.

        Returns:
            ValidationConfiguration: Typed validation configuration object

        Raises:
            RuntimeError: If configuration has not been loaded yet
        """
        if self._configuration_data is None:
            raise RuntimeError("Configuration not loaded. Call load() first.")

        return self._configuration_data.validation
