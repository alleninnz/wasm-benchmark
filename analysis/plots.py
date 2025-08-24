#!/usr/bin/env python3
"""
Visualization Script
Generates comprehensive plots and figures for WebAssembly benchmark analysis
"""

import sys
import json
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
import argparse
from datetime import datetime
import warnings

# Suppress specific warnings
warnings.filterwarnings('ignore', category=UserWarning)

def setup_plotting():
    """Configure matplotlib and seaborn for publication-quality plots"""
    plt.style.use('seaborn-v0_8')
    sns.set_palette("husl")
    
    # Set default figure parameters
    plt.rcParams.update({
        'figure.figsize': (10, 6),
        'figure.dpi': 300,
        'savefig.dpi': 300,
        'savefig.bbox': 'tight',
        'font.size': 12,
        'axes.labelsize': 12,
        'axes.titlesize': 14,
        'xtick.labelsize': 10,
        'ytick.labelsize': 10,
        'legend.fontsize': 10,
        'figure.titlesize': 16
    })

class BenchmarkPlotter:
    """Main class for generating benchmark visualizations"""
    
    def __init__(self, results_dir: Path):
        self.results_dir = Path(results_dir)
        self.figures_dir = self.results_dir / 'analysis' / 'figures'
        self.figures_dir.mkdir(parents=True, exist_ok=True)
        self.data = None
        
    def load_data(self) -> pd.DataFrame:
        """Load benchmark data"""
        # Try different data files in order of preference
        data_files = ['final_dataset.csv', 'raw_data.csv']
        
        for filename in data_files:
            csv_file = self.results_dir / filename
            if csv_file.exists():
                print(f"Loading data from: {csv_file}")
                try:
                    self.data = pd.read_csv(csv_file, comment='#')
                    if not self.data.empty:
                        break
                except Exception as e:
                    print(f"Failed to load {filename}: {e}")
                    continue
        
        if self.data is None or self.data.empty:
            raise FileNotFoundError("No valid data file found")
        
        # Data preprocessing
        self.data = self.data[self.data['execution_time_ms'].notna()]
        
        print(f"Loaded {len(self.data)} records")
        print(f"Tasks: {sorted(self.data['task'].unique())}")
        print(f"Languages: {sorted(self.data['language'].unique())}")
        print(f"Scales: {sorted(self.data['scale'].unique())}")
        
        return self.data
    
    def plot_execution_time_comparison(self):
        """Create bar charts comparing execution times"""
        print("Creating execution time comparison plots...")
        
        # Calculate means and standard errors for each group
        grouped = self.data.groupby(['task', 'language', 'scale'])['execution_time_ms'].agg(['mean', 'std', 'count']).reset_index()
        grouped['se'] = grouped['std'] / np.sqrt(grouped['count'])
        
        # Create subplots for each scale
        scales = sorted(self.data['scale'].unique())
        fig, axes = plt.subplots(1, len(scales), figsize=(5*len(scales), 6))
        if len(scales) == 1:
            axes = [axes]
        
        colors = {'rust': '#CE6A3D', 'tinygo': '#00ADB5'}
        
        for i, scale in enumerate(scales):
            ax = axes[i]
            scale_data = grouped[grouped['scale'] == scale]
            
            # Create bar plot
            tasks = sorted(scale_data['task'].unique())
            x_pos = np.arange(len(tasks))
            width = 0.35
            
            for j, language in enumerate(['rust', 'tinygo']):
                lang_data = scale_data[scale_data['language'] == language]
                
                means = [lang_data[lang_data['task'] == task]['mean'].iloc[0] if not lang_data[lang_data['task'] == task].empty else 0 for task in tasks]
                errors = [lang_data[lang_data['task'] == task]['se'].iloc[0] if not lang_data[lang_data['task'] == task].empty else 0 for task in tasks]
                
                ax.bar(x_pos + j*width - width/2, means, width, 
                      yerr=errors, capsize=5, 
                      label=language.title(), color=colors[language], alpha=0.8)
            
            ax.set_title(f'Execution Time - {scale.title()} Scale')
            ax.set_xlabel('Task')
            ax.set_ylabel('Execution Time (ms)')
            ax.set_xticks(x_pos)
            ax.set_xticklabels([task.replace('_', ' ').title() for task in tasks], rotation=45)
            ax.legend()
            ax.grid(True, alpha=0.3)
        
        plt.tight_layout()
        
        # Save in both formats
        for ext in ['png', 'svg']:
            filename = self.figures_dir / f'execution_time_comparison.{ext}'
            plt.savefig(filename, dpi=300, bbox_inches='tight')
        
        plt.close()
        print(f"Saved execution time comparison plots to {self.figures_dir}")
    
    def plot_boxplots(self):
        """Create box plots showing distribution of execution times"""
        print("Creating box plots...")
        
        # Create subplot for each task
        tasks = sorted(self.data['task'].unique())
        n_tasks = len(tasks)
        
        fig, axes = plt.subplots(2, 3, figsize=(18, 12))
        axes = axes.flatten()
        
        for i, task in enumerate(tasks):
            if i >= len(axes):
                break
                
            ax = axes[i]
            task_data = self.data[self.data['task'] == task]
            
            # Create box plot with different colors for languages
            sns.boxplot(data=task_data, x='scale', y='execution_time_ms', 
                       hue='language', ax=ax, palette=['#CE6A3D', '#00ADB5'])
            
            ax.set_title(f'{task.replace("_", " ").title()} - Execution Time Distribution')
            ax.set_xlabel('Scale')
            ax.set_ylabel('Execution Time (ms)')
            ax.grid(True, alpha=0.3)
        
        # Hide unused subplots
        for i in range(n_tasks, len(axes)):
            axes[i].set_visible(False)
        
        plt.tight_layout()
        
        # Save in both formats
        for ext in ['png', 'svg']:
            filename = self.figures_dir / f'execution_time_boxplots.{ext}'
            plt.savefig(filename, dpi=300, bbox_inches='tight')
        
        plt.close()
        print(f"Saved box plots to {self.figures_dir}")
    
    def plot_performance_matrix(self):
        """Create a performance comparison matrix/heatmap"""
        print("Creating performance matrix...")
        
        # Calculate relative performance (Rust as baseline)
        performance_data = []
        
        for task in self.data['task'].unique():
            for scale in self.data['scale'].unique():
                rust_mean = self.data[
                    (self.data['task'] == task) & 
                    (self.data['scale'] == scale) & 
                    (self.data['language'] == 'rust')
                ]['execution_time_ms'].mean()
                
                tinygo_mean = self.data[
                    (self.data['task'] == task) & 
                    (self.data['scale'] == scale) & 
                    (self.data['language'] == 'tinygo')
                ]['execution_time_ms'].mean()
                
                if not pd.isna(rust_mean) and not pd.isna(tinygo_mean) and rust_mean > 0:
                    relative_perf = tinygo_mean / rust_mean
                    performance_data.append({
                        'task': task,
                        'scale': scale,
                        'relative_performance': relative_perf
                    })
        
        if not performance_data:
            print("No performance data available for matrix")
            return
        
        # Create pivot table for heatmap
        perf_df = pd.DataFrame(performance_data)
        pivot_df = perf_df.pivot(index='task', columns='scale', values='relative_performance')
        
        # Create heatmap
        plt.figure(figsize=(8, 6))
        
        # Custom colormap: green for TinyGo advantage, red for Rust advantage
        cmap = sns.diverging_palette(10, 150, as_cmap=True)
        
        sns.heatmap(pivot_df, annot=True, fmt='.2f', cmap=cmap, center=1.0,
                   cbar_kws={'label': 'TinyGo/Rust Execution Time Ratio'},
                   square=True, linewidths=0.5)
        
        plt.title('Performance Comparison Matrix\n(Values > 1.0 favor Rust, < 1.0 favor TinyGo)')
        plt.xlabel('Scale')
        plt.ylabel('Task')
        plt.xticks(rotation=0)
        plt.yticks(rotation=0)
        
        # Add text annotation explaining the colors
        plt.figtext(0.02, 0.02, 'Green: TinyGo faster | Red: Rust faster', 
                   fontsize=8, style='italic')
        
        plt.tight_layout()
        
        # Save in both formats
        for ext in ['png', 'svg']:
            filename = self.figures_dir / f'performance_matrix.{ext}'
            plt.savefig(filename, dpi=300, bbox_inches='tight')
        
        plt.close()
        print(f"Saved performance matrix to {self.figures_dir}")
    
    def plot_memory_usage(self):
        """Create memory usage comparison plots if data is available"""
        if 'memory_usage_mb' not in self.data.columns:
            print("Memory usage data not available, skipping memory plots")
            return
            
        print("Creating memory usage plots...")
        
        # Filter out invalid memory data
        memory_data = self.data[self.data['memory_usage_mb'].notna() & (self.data['memory_usage_mb'] >= 0)]
        
        if memory_data.empty:
            print("No valid memory usage data found")
            return
        
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 6))
        
        # Plot 1: Memory usage by task
        sns.boxplot(data=memory_data, x='task', y='memory_usage_mb', 
                   hue='language', ax=ax1, palette=['#CE6A3D', '#00ADB5'])
        ax1.set_title('Memory Usage by Task')
        ax1.set_xlabel('Task')
        ax1.set_ylabel('Memory Usage (MB)')
        ax1.tick_params(axis='x', rotation=45)
        ax1.grid(True, alpha=0.3)
        
        # Plot 2: Memory usage by scale
        sns.boxplot(data=memory_data, x='scale', y='memory_usage_mb', 
                   hue='language', ax=ax2, palette=['#CE6A3D', '#00ADB5'])
        ax2.set_title('Memory Usage by Scale')
        ax2.set_xlabel('Scale')
        ax2.set_ylabel('Memory Usage (MB)')
        ax2.grid(True, alpha=0.3)
        
        plt.tight_layout()
        
        # Save in both formats
        for ext in ['png', 'svg']:
            filename = self.figures_dir / f'memory_usage_comparison.{ext}'
            plt.savefig(filename, dpi=300, bbox_inches='tight')
        
        plt.close()
        print(f"Saved memory usage plots to {self.figures_dir}")
    
    def plot_statistical_summary(self):
        """Create a statistical summary visualization"""
        print("Creating statistical summary plot...")
        
        # Load statistical analysis results if available
        stats_file = self.results_dir / 'statistical_analysis.json'
        if not stats_file.exists():
            print("Statistical analysis results not found, creating basic summary")
            return
        
        with open(stats_file, 'r') as f:
            stats_data = json.load(f)
        
        # Extract significance test results
        significance_data = []
        
        if 'analysis_results' in stats_data and 'significance' in stats_data['analysis_results']:
            sig_results = stats_data['analysis_results']['significance']
            
            for task in sig_results:
                for scale in sig_results[task]:
                    result = sig_results[task][scale]
                    significance_data.append({
                        'task': task,
                        'scale': scale,
                        'p_value': result.get('p_value', 1.0),
                        'cohens_d': result.get('cohens_d', 0.0),
                        'effect_size': result.get('effect_size', 'negligible'),
                        'significant': result.get('significant_corrected', False)
                    })
        
        if not significance_data:
            print("No significance test data available")
            return
        
        sig_df = pd.DataFrame(significance_data)
        
        # Create subplots
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(15, 6))
        
        # Plot 1: P-values heatmap
        p_value_pivot = sig_df.pivot(index='task', columns='scale', values='p_value')
        
        sns.heatmap(p_value_pivot, annot=True, fmt='.3f', cmap='RdYlGn', 
                   ax=ax1, vmin=0, vmax=0.1, cbar_kws={'label': 'P-value'})
        ax1.set_title('Statistical Significance (P-values)\nGreen: Significant, Red: Not Significant')
        ax1.set_xlabel('Scale')
        ax1.set_ylabel('Task')
        
        # Plot 2: Effect sizes
        cohens_d_pivot = sig_df.pivot(index='task', columns='scale', values='cohens_d')
        
        sns.heatmap(cohens_d_pivot, annot=True, fmt='.2f', cmap='RdBu_r', center=0,
                   ax=ax2, cbar_kws={'label': "Cohen's d"})
        ax2.set_title("Effect Sizes (Cohen's d)\nBlue: Rust faster, Red: TinyGo faster")
        ax2.set_xlabel('Scale')
        ax2.set_ylabel('Task')
        
        plt.tight_layout()
        
        # Save in both formats
        for ext in ['png', 'svg']:
            filename = self.figures_dir / f'statistical_summary.{ext}'
            plt.savefig(filename, dpi=300, bbox_inches='tight')
        
        plt.close()
        print(f"Saved statistical summary to {self.figures_dir}")
    
    def create_all_plots(self):
        """Generate all visualization plots"""
        print("Starting visualization generation...")
        
        try:
            self.load_data()
            
            self.plot_execution_time_comparison()
            self.plot_boxplots()
            self.plot_performance_matrix()
            self.plot_memory_usage()
            self.plot_statistical_summary()
            
            print(f"\nAll plots generated successfully!")
            print(f"Plots saved in: {self.figures_dir}")
            
            # List generated files
            plot_files = list(self.figures_dir.glob('*.png'))
            print(f"Generated {len(plot_files)} PNG files")
            print(f"Generated {len(list(self.figures_dir.glob('*.svg')))} SVG files")
            
        except Exception as e:
            print(f"Plotting failed: {e}")
            raise

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description='Generate visualization plots for WebAssembly benchmark results')
    parser.add_argument('results_dir', help='Directory containing benchmark results')
    parser.add_argument('--format', choices=['png', 'svg', 'both'], default='both', 
                       help='Output format for plots')
    
    args = parser.parse_args()
    
    # Set up plotting environment
    setup_plotting()
    
    # Validate results directory
    results_dir = Path(args.results_dir)
    if not results_dir.exists():
        print(f"Results directory does not exist: {results_dir}")
        sys.exit(1)
    
    # Create plotter and generate plots
    plotter = BenchmarkPlotter(results_dir)
    plotter.create_all_plots()
    
    print(f"\nVisualization completed successfully!")

if __name__ == '__main__':
    main()