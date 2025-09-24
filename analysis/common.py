"""
Common utilities for analysis modules.

Provides shared infrastructure for quality control, validation, and other analysis modules
to eliminate code duplication and ensure consistent behavior across the analysis pipeline.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .config_parser import ConfigParser


def setup_analysis_cli(description: str) -> argparse.Namespace:
    """
    Set up standardized command-line interface for analysis modules.

    Args:
        description: Description of the analysis module for help text

    Returns:
        argparse.Namespace: Parsed command-line arguments
    """
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument(
        "--quick",
        action="store_true",
        default=False,
        help="Use quick configuration and quick results data",
    )
    return parser.parse_args()


def load_configuration(quick_mode: bool) -> ConfigParser:
    """
    Load configuration based on analysis mode.

    Args:
        quick_mode: If True, load bench-quick.yaml; if False, load bench.yaml

    Returns:
        ConfigParser: Loaded configuration parser instance

    Raises:
        FileNotFoundError: If configuration file doesn't exist
        Exception: If configuration loading fails
    """
    try:
        config_file = "configs/bench-quick.yaml" if quick_mode else "configs/bench.yaml"
        config_parser = ConfigParser(config_path=config_file).load()
        print(f"✅ Loaded configuration from {config_file}")
        return config_parser
    except FileNotFoundError:
        print("❌ Configuration file not found")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error loading configuration: {e}")
        sys.exit(1)


def load_latest_results(quick_mode: bool) -> tuple[Path, dict[str, Any]]:
    """
    Load the most recent results file based on analysis mode.

    Args:
        quick_mode: If True, load latest *quick.json; if False, load latest non-quick .json

    Returns:
        Tuple[Path, Dict[str, Any]]: (results_file_path, raw_data)

    Raises:
        FileNotFoundError: If no suitable results files found
        json.JSONDecodeError: If JSON file is malformed
        IOError: If file reading fails
    """
    try:
        input_dir = Path("results")
        json_files = list(input_dir.glob("*.json"))

        if not json_files:
            print(f"❌ Error: No benchmark data files found in {input_dir}")
            print("💡 Run benchmark tests first to generate data")
            sys.exit(1)

        # Filter out meta files
        non_meta_files = [f for f in json_files if "meta" not in f.name]
        if not non_meta_files:
            print(f"❌ Error: No non-meta JSON files found in {input_dir}")
            sys.exit(1)

        # Filter files based on quick mode
        if quick_mode:
            filtered_files = [f for f in non_meta_files if "quick" in f.name]
            mode_description = "quick"
        else:
            filtered_files = [f for f in non_meta_files if "quick" not in f.name]
            mode_description = "non-quick"

        if not filtered_files:
            print(f"❌ Error: No {mode_description} JSON files found in {input_dir}")
            if quick_mode:
                print("💡 Run benchmark tests with quick configuration first")
            else:
                print("💡 Run standard benchmark tests first")
            sys.exit(1)

        latest_file = max(filtered_files, key=lambda x: x.stat().st_mtime)

        with open(latest_file) as f:
            raw_data = json.load(f)

        print(f"✅ Loaded raw benchmark data from {latest_file}")
        return latest_file, raw_data

    except FileNotFoundError:
        print(f"❌ Benchmark data directory not found: {input_dir}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON format in {latest_file}: {e}")
        sys.exit(1)
    except OSError as e:
        print(f"❌ Error reading {latest_file}: {e}")
        sys.exit(1)


def setup_output_directory(subdir: str) -> Path:
    """
    Create and return standardized output directory for analysis results.

    Args:
        subdir: Subdirectory name under reports/ (e.g., 'qc', 'validation')

    Returns:
        Path: Created output directory path
    """
    output_dir = Path(f"reports/{subdir}")
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


def print_analysis_header(analysis_name: str, quick_mode: bool) -> None:
    """
    Print standardized analysis header with mode information.

    Args:
        analysis_name: Name of the analysis being performed
        quick_mode: Whether running in quick mode
    """
    mode_str = "Quick" if quick_mode else "Standard"
    print(f"🔍 {analysis_name} ({mode_str} Mode)")
    print("=" * 60)


class AnalysisError(Exception):
    """Custom exception for analysis pipeline errors."""

    pass


def handle_critical_error(error_message: str, exit_code: int = 1) -> None:
    """
    Handle critical errors with consistent formatting and exit.

    Args:
        error_message: Error message to display
        exit_code: Exit code for sys.exit()
    """
    print(f"❌ Critical error: {error_message}")
    sys.exit(exit_code)
