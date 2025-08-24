#!/usr/bin/env python3
"""
Statistical Analysis Script
Performs comprehensive statistical analysis on WebAssembly benchmark results
"""

import sys
import json
import pandas as pd
import numpy as np
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import argparse
from datetime import datetime

# Statistical libraries
from scipy import stats
from scipy.stats import shapiro, ttest_ind, mannwhitneyu
import statsmodels.api as sm
from statsmodels.stats.multitest import multipletests

def setup_logging():
    """Configure logging for the analysis process"""
    import logging
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler('analysis/analysis_log.txt', mode='a'),
            logging.StreamHandler()
        ]
    )
    return logging.getLogger(__name__)

logger = setup_logging()

class BenchmarkAnalyzer:
    """Main class for statistical analysis of benchmark results"""
    
    def __init__(self, results_dir: Path):
        self.results_dir = Path(results_dir)
        self.data = None
        self.analysis_results = {}
        
    def load_data(self) -> pd.DataFrame:
        """Load benchmark data from CSV file"""
        csv_file = self.results_dir / 'final_dataset.csv'
        
        if not csv_file.exists():
            # Try raw data if final dataset not available
            csv_file = self.results_dir / 'raw_data.csv'
            
        if not csv_file.exists():
            raise FileNotFoundError(f"No data file found in {self.results_dir}")
            
        logger.info(f"Loading data from: {csv_file}")
        
        # Read CSV with error handling for malformed lines
        try:
            self.data = pd.read_csv(csv_file, comment='#')
        except pd.errors.EmptyDataError:
            raise ValueError("Data file is empty or contains no valid data")
            
        # Basic data validation
        required_columns = ['task', 'language', 'scale', 'execution_time_ms']
        missing_columns = [col for col in required_columns if col not in self.data.columns]
        
        if missing_columns:
            raise ValueError(f"Missing required columns: {missing_columns}")
            
        logger.info(f"Loaded {len(self.data)} records")
        logger.info(f"Tasks: {self.data['task'].unique().tolist()}")
        logger.info(f"Languages: {self.data['language'].unique().tolist()}")
        logger.info(f"Scales: {self.data['scale'].unique().tolist()}")
        
        return self.data
    
    def compute_descriptive_statistics(self) -> Dict:
        """Compute descriptive statistics for each task-language-scale combination"""
        logger.info("Computing descriptive statistics...")
        
        results = {}
        
        for task in self.data['task'].unique():
            results[task] = {}
            
            for scale in self.data['scale'].unique():
                results[task][scale] = {}
                
                for language in self.data['language'].unique():
                    # Filter data for this combination
                    mask = (
                        (self.data['task'] == task) & 
                        (self.data['scale'] == scale) & 
                        (self.data['language'] == language)
                    )
                    subset = self.data[mask]['execution_time_ms']
                    
                    if len(subset) == 0:
                        continue
                        
                    # Compute statistics
                    stats_dict = {
                        'count': len(subset),
                        'mean': subset.mean(),
                        'std': subset.std(),
                        'var': subset.var(),
                        'min': subset.min(),
                        'max': subset.max(),
                        'median': subset.median(),
                        'q25': subset.quantile(0.25),
                        'q75': subset.quantile(0.75),
                        'ci_95_lower': subset.mean() - 1.96 * (subset.std() / np.sqrt(len(subset))),
                        'ci_95_upper': subset.mean() + 1.96 * (subset.std() / np.sqrt(len(subset))),
                        'cv': subset.std() / subset.mean() if subset.mean() != 0 else float('inf')
                    }
                    
                    results[task][scale][language] = stats_dict
        
        self.analysis_results['descriptive'] = results
        logger.info("Descriptive statistics completed")
        return results
    
    def test_normality(self) -> Dict:
        """Test normality using Shapiro-Wilk test"""
        logger.info("Testing normality (Shapiro-Wilk)...")
        
        results = {}
        
        for task in self.data['task'].unique():
            results[task] = {}
            
            for scale in self.data['scale'].unique():
                results[task][scale] = {}
                
                for language in self.data['language'].unique():
                    mask = (
                        (self.data['task'] == task) & 
                        (self.data['scale'] == scale) & 
                        (self.data['language'] == language)
                    )
                    subset = self.data[mask]['execution_time_ms']
                    
                    if len(subset) < 3:  # Shapiro-Wilk requires at least 3 samples
                        continue
                        
                    try:
                        statistic, p_value = shapiro(subset)
                        is_normal = p_value >= 0.05
                        
                        results[task][scale][language] = {
                            'statistic': statistic,
                            'p_value': p_value,
                            'is_normal': is_normal,
                            'sample_size': len(subset)
                        }
                    except Exception as e:
                        logger.warning(f"Normality test failed for {task}-{scale}-{language}: {e}")
        
        self.analysis_results['normality'] = results
        logger.info("Normality testing completed")
        return results
    
    def perform_significance_tests(self) -> Dict:
        """Perform statistical significance tests between languages"""
        logger.info("Performing significance tests...")
        
        results = {}
        p_values_for_correction = []
        test_info = []
        
        for task in self.data['task'].unique():
            results[task] = {}
            
            for scale in self.data['scale'].unique():
                # Get data for both languages
                rust_mask = (
                    (self.data['task'] == task) & 
                    (self.data['scale'] == scale) & 
                    (self.data['language'] == 'rust')
                )
                tinygo_mask = (
                    (self.data['task'] == task) & 
                    (self.data['scale'] == scale) & 
                    (self.data['language'] == 'tinygo')
                )
                
                rust_data = self.data[rust_mask]['execution_time_ms']
                tinygo_data = self.data[tinygo_mask]['execution_time_ms']
                
                if len(rust_data) == 0 or len(tinygo_data) == 0:
                    continue
                
                # Check normality for both groups
                rust_normal = (
                    self.analysis_results.get('normality', {})
                    .get(task, {})
                    .get(scale, {})
                    .get('rust', {})
                    .get('is_normal', False)
                )
                tinygo_normal = (
                    self.analysis_results.get('normality', {})
                    .get(task, {})
                    .get(scale, {})
                    .get('tinygo', {})
                    .get('is_normal', False)
                )
                
                # Choose appropriate test
                if rust_normal and tinygo_normal:
                    # Use t-test
                    statistic, p_value = ttest_ind(rust_data, tinygo_data)
                    test_type = 'ttest'
                else:
                    # Use Mann-Whitney U test
                    statistic, p_value = mannwhitneyu(rust_data, tinygo_data, alternative='two-sided')
                    test_type = 'mannwhitneyu'
                
                # Compute effect size (Cohen's d)
                pooled_std = np.sqrt(((len(rust_data) - 1) * rust_data.var() + 
                                     (len(tinygo_data) - 1) * tinygo_data.var()) / 
                                    (len(rust_data) + len(tinygo_data) - 2))
                
                cohens_d = (rust_data.mean() - tinygo_data.mean()) / pooled_std if pooled_std != 0 else 0
                
                # Interpret effect size
                if abs(cohens_d) < 0.2:
                    effect_size = 'negligible'
                elif abs(cohens_d) < 0.5:
                    effect_size = 'small'
                elif abs(cohens_d) < 0.8:
                    effect_size = 'medium'
                else:
                    effect_size = 'large'
                
                test_result = {
                    'test_type': test_type,
                    'statistic': statistic,
                    'p_value': p_value,
                    'cohens_d': cohens_d,
                    'effect_size': effect_size,
                    'rust_mean': rust_data.mean(),
                    'tinygo_mean': tinygo_data.mean(),
                    'rust_n': len(rust_data),
                    'tinygo_n': len(tinygo_data)
                }
                
                results[task][scale] = test_result
                p_values_for_correction.append(p_value)
                test_info.append((task, scale))
        
        # Apply multiple comparison correction (Benjamini-Hochberg FDR)
        if p_values_for_correction:
            logger.info(f"Applying Benjamini-Hochberg FDR correction to {len(p_values_for_correction)} tests")
            rejected, corrected_p, alpha_sidak, alpha_bonf = multipletests(
                p_values_for_correction, 
                alpha=0.05, 
                method='fdr_bh'
            )
            
            # Update results with corrected p-values
            for i, (task, scale) in enumerate(test_info):
                results[task][scale]['corrected_p_value'] = corrected_p[i]
                results[task][scale]['significant_corrected'] = rejected[i]
                results[task][scale]['significant_uncorrected'] = p_values_for_correction[i] < 0.05
        
        self.analysis_results['significance'] = results
        logger.info("Significance testing completed")
        return results
    
    def generate_summary_table(self) -> pd.DataFrame:
        """Generate a summary table of all results"""
        logger.info("Generating summary table...")
        
        summary_data = []
        
        for task in self.analysis_results.get('descriptive', {}):
            for scale in self.analysis_results['descriptive'][task]:
                row = {'task': task, 'scale': scale}
                
                # Add descriptive statistics for both languages
                for language in ['rust', 'tinygo']:
                    if language in self.analysis_results['descriptive'][task][scale]:
                        stats = self.analysis_results['descriptive'][task][scale][language]
                        row.update({
                            f'{language}_mean': stats['mean'],
                            f'{language}_std': stats['std'],
                            f'{language}_cv': stats['cv'],
                            f'{language}_n': stats['count']
                        })
                
                # Add significance test results
                if (task in self.analysis_results.get('significance', {}) and 
                    scale in self.analysis_results['significance'][task]):
                    sig = self.analysis_results['significance'][task][scale]
                    row.update({
                        'p_value': sig['p_value'],
                        'corrected_p_value': sig.get('corrected_p_value', None),
                        'cohens_d': sig['cohens_d'],
                        'effect_size': sig['effect_size'],
                        'test_type': sig['test_type'],
                        'significant': sig.get('significant_corrected', sig['p_value'] < 0.05)
                    })
                
                summary_data.append(row)
        
        summary_df = pd.DataFrame(summary_data)
        
        # Save summary table
        summary_file = self.results_dir / 'analysis_summary.csv'
        summary_df.to_csv(summary_file, index=False)
        logger.info(f"Summary table saved to: {summary_file}")
        
        return summary_df
    
    def save_analysis_results(self):
        """Save all analysis results to JSON file"""
        output_file = self.results_dir / 'statistical_analysis.json'
        
        # Convert numpy types to native Python types for JSON serialization
        def convert_numpy_types(obj):
            if isinstance(obj, np.integer):
                return int(obj)
            elif isinstance(obj, np.floating):
                return float(obj)
            elif isinstance(obj, np.ndarray):
                return obj.tolist()
            elif isinstance(obj, dict):
                return {key: convert_numpy_types(value) for key, value in obj.items()}
            elif isinstance(obj, list):
                return [convert_numpy_types(item) for item in obj]
            else:
                return obj
        
        analysis_output = {
            'metadata': {
                'timestamp': datetime.now().isoformat(),
                'script': 'statistics.py',
                'results_directory': str(self.results_dir)
            },
            'analysis_results': convert_numpy_types(self.analysis_results)
        }
        
        with open(output_file, 'w') as f:
            json.dump(analysis_output, f, indent=2)
            
        logger.info(f"Analysis results saved to: {output_file}")
    
    def run_analysis(self):
        """Run the complete statistical analysis pipeline"""
        logger.info("Starting statistical analysis...")
        
        try:
            # Load data
            self.load_data()
            
            # Perform analyses
            self.compute_descriptive_statistics()
            self.test_normality()
            self.perform_significance_tests()
            
            # Generate outputs
            self.generate_summary_table()
            self.save_analysis_results()
            
            logger.info("Statistical analysis completed successfully")
            
        except Exception as e:
            logger.error(f"Analysis failed: {e}")
            raise

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description='Statistical analysis of WebAssembly benchmark results')
    parser.add_argument('results_dir', help='Directory containing benchmark results')
    parser.add_argument('--verbose', '-v', action='store_true', help='Enable verbose output')
    
    args = parser.parse_args()
    
    if args.verbose:
        logger.setLevel('DEBUG')
    
    # Validate results directory
    results_dir = Path(args.results_dir)
    if not results_dir.exists():
        logger.error(f"Results directory does not exist: {results_dir}")
        sys.exit(1)
        
    # Run analysis
    analyzer = BenchmarkAnalyzer(results_dir)
    analyzer.run_analysis()
    
    print(f"\nAnalysis completed successfully!")
    print(f"Results saved in: {results_dir}")

if __name__ == '__main__':
    main()