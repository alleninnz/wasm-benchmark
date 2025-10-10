<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rust vs TinyGo WebAssembly: Engineering Decision Guide</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #2d3748;
            background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%);
            min-height: 100vh;
        }

        :root {
            --bg-gradient-start: #f7fafc;
            --bg-gradient-end: #edf2f7;
            --text-color: #2d3748;
            --muted-color: #718096;
            --card-bg: #ffffff;
            --accent: #4299e1;
            --rust-color: #e53e3e;
            --tinygo-color: #00a5d6;
            --success: #48bb78;
            --shadow: 0 4px 6px rgba(0,0,0,0.05);
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 1rem 1.5rem;
        }

        /* Responsive utility for wide tables */
        .table-wrapper {
            width: 100%;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            background: transparent;
            border-radius: 8px;
        }

        .header {
            text-align: center;
            background: white;
            padding: 2rem;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
            margin-bottom: 2rem;
            border-top: 4px solid #4299e1;
        }

        .header h1 {
            font-size: 2.5rem;
            font-weight: 700;
            color: #1a202c;
            margin-bottom: 0.5rem;
        }

        .header .subtitle {
            font-size: 1.1rem;
            color: #718096;
            margin-bottom: 1rem;
        }

        .timestamp {
            background: #edf2f7;
            padding: 0.5rem 1rem;
            border-radius: 6px;
            font-size: 0.9rem;
            color: #4a5568;
            display: inline-block;
        }

        .summary-grid {
            display: grid;
            /* Two items per row on wider screens; media query will collapse to 1 column on small screens */
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
            align-items: start;
        }

        .summary-card {
            background: white;
            padding: 1.5rem;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
            border-left: 4px solid #48bb78;
        }

        .summary-card.rust {
            border-left-color: #e53e3e;
        }

        .summary-card.tinygo {
            border-left-color: #00a5d6;
        }

        .summary-card h3 {
            font-size: 1.3rem;
            margin-bottom: 1rem;
            display: flex;
            align-items: center;
        }

        .summary-card .icon {
            width: 24px;
            height: 24px;
            margin-right: 0.5rem;
            border-radius: 4px;
        }

        .rust .icon {
            background: #e53e3e;
        }

        .tinygo .icon {
            background: #00a5d6;
        }

        .metric {
            display: flex;
            justify-content: space-between;
            margin: 0.5rem 0;
            padding: 0.5rem;
            background: #f7fafc;
            border-radius: 6px;
        }

        .metric .label {
            font-weight: 500;
            color: #4a5568;
        }

        .metric .value {
            font-weight: 600;
            color: #2d3748;
        }

        /* Enhanced styles for the Statistical Significance panel */
        .stats-panel {
            display: flex;
            flex-direction: column;
            gap: 1rem;
            margin-top: 0.5rem;
        }

        .stat-item {
            display: grid;
            grid-template-columns: 1fr auto;
            align-items: center;
            gap: 1.25rem;
            padding: 1rem 1.25rem;
            background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
            border-radius: 12px;
            border: 1px solid #e2e8f0;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        }

        .stat-item::before {
            content: '';
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 4px;
            background: linear-gradient(180deg, #4299e1 0%, #63b3ed 100%);
            border-radius: 0 4px 4px 0;
        }

        .stat-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
            border-color: #cbd5e0;
        }

        .stat-label {
            color: #4a5568;
            font-weight: 600;
            font-size: 0.95rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .stat-value {
            color: #1a202c;
            font-weight: 700;
            font-size: 1.05rem;
            text-align: right;
            white-space: normal;
            overflow-wrap: anywhere;
            word-break: break-word;
            max-width: 60ch;
            background: rgba(255, 255, 255, 0.6);
            padding: 0.5rem 0.75rem;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
            backdrop-filter: blur(10px);
        }

        .stat-value.multiline {
            white-space: normal;
            text-align: right;
            overflow-wrap: anywhere;
            line-height: 1.4;
        }

        /* Special styling for p-values */
        .stat-item:nth-child(1) .stat-value,
        .stat-item:nth-child(2) .stat-value {
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            font-size: 1rem;
            background: linear-gradient(135deg, #fef5e7 0%, #fdf2f8 100%);
            border-color: #fbbf24;
        }

        .stat-item:nth-child(1)::before,
        .stat-item:nth-child(2)::before {
            background: linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%);
        }

        /* Special styling for effect size */
        .stat-item:nth-child(3) .stat-value {
            background: linear-gradient(135deg, #f0fff4 0%, #e6fffa 100%);
            border-color: #48bb78;
            color: #22543d;
        }

        .stat-item:nth-child(3)::before {
            background: linear-gradient(180deg, #48bb78 0%, #38a169 100%);
        }

        /* Special styling for confidence level */
        .stat-item:nth-child(4) .stat-value {
            background: linear-gradient(135deg, #ebf8ff 0%, #e6fffa 100%);
            border-color: #4299e1;
            color: #2a4365;
        }

        .stat-item:nth-child(4)::before {
            background: linear-gradient(180deg, #4299e1 0%, #3182ce 100%);
        }

        .section {
            background: white;
            margin: 1.5rem 0;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
            overflow: hidden;
        }

        .section-header {
            background: #4299e1;
            color: white;
            padding: 1rem 1.5rem;
            font-size: 1.2rem;
            font-weight: 600;
        }

        .section-content {
            padding: 1.5rem;
        }

        .chart-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 1.5rem;
            margin: 1.5rem 0;
        }

        .chart-tabs {
            display: flex;
            gap: 0;
            margin-bottom: 1.5rem;
            border-bottom: 2px solid #e2e8f0;
        }

        .tab-button {
            padding: 0.75rem 1.5rem;
            background: none;
            border: none;
            border-bottom: 3px solid transparent;
            color: #718096;
            font-size: 0.95rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s ease;
            position: relative;
        }

        .tab-button:hover {
            color: #4299e1;
            background: #f7fafc;
        }

        .tab-button.active {
            color: #4299e1;
            border-bottom-color: #4299e1;
            background: white;
            font-weight: 600;
        }

        .chart-container {
            text-align: center;
            background: #f7fafc;
            padding: 1rem;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
            display: none;
        }

        .chart-container.active {
            display: block;
        }

        .chart-container img {
            max-width: 100%;
            height: auto;
            border-radius: 6px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .chart-container h4 {
            margin: 1rem 0 0.5rem;
            color: #2d3748;
        }

        .chart-container p {
            color: #718096;
            font-size: 0.9rem;
        }

        .comparison-table {
            width: 100%;
            border-collapse: collapse;
            margin: 1rem 0;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .comparison-table th,
        .comparison-table td {
            padding: 1rem;
            text-align: center;
            border-bottom: 1px solid #e2e8f0;
        }

        .comparison-table th {
            background: #f7fafc;
            font-weight: 600;
            color: #4a5568;
            text-align: center;
        }

        .comparison-table tr:hover {
            background: #f7fafc;
        }

        /* Zebra striping for readability */
        .comparison-table tbody tr:nth-child(odd) {
            background: #ffffff;
        }

        .comparison-table tbody tr:nth-child(even) {
            background: #fbfcfd;
        }

        .winner-rust {
            color: #e53e3e;
            font-weight: 600;
        }

        .winner-tinygo {
            color: #00a5d6;
            font-weight: 600;
        }

        .performance-badge {
            padding: 0.25rem 0.75rem;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 600;
            display: inline-block;
        }

        .badge-excellent {
            background: #9ae6b4;
            color: #276749;
        }

        .badge-good {
            background: #fbb6ce;
            color: #97266d;
        }

        .badge-moderate {
            background: #fbbf24;
            color: #92400e;
        }

        .badge-strong {
            background: #10b981;
            color: #064e3b;
        }

        .badge-noclearwinner {
            background: #6b7280;
            color: #1f2937;
        }

        .badge-weak {
            background: #f59e0b;
            color: #78350f;
        }

        .badge-neutral {
            background: #6b7280;
            color: #1f2937;
        }

        .decision-matrix {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 1rem;
            margin: 1.5rem 0;
        }

        .decision-card {
            padding: 1.5rem;
            border-radius: 8px;
            text-align: center;
            border: 2px solid #e2e8f0;
            transition: all 0.3s ease;
        }

        .decision-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
        }

        .decision-card.recommended {
            border-color: #48bb78;
            background: #f0fff4;
        }

        .decision-card.conditional {
            border-color: #ed8936;
            background: #fffaf0;
        }

        .decision-card.not-recommended {
            border-color: #e53e3e;
            background: #fed7d7;
        }

        .decision-card h4 {
            margin-bottom: 1rem;
            font-size: 1.1rem;
        }

        .decision-card ul {
            list-style: none;
            text-align: left;
        }

        .decision-card li {
            padding: 0.25rem 0;
            font-size: 0.9rem;
        }

        .decision-card li:before {
            content: "✓ ";
            color: #48bb78;
            font-weight: bold;
        }

        .recommendation {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 2rem;
            border-radius: 12px;
            margin: 2rem 0;
            text-align: center;
        }

        .recommendation h3 {
            font-size: 1.5rem;
            margin-bottom: 1rem;
        }

        .recommendation p {
            font-size: 1.1rem;
            opacity: 0.9;
        }

        .methodology-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 1.5rem;
            margin: 1.5rem 0;
        }

        .methodology-card {
            background: #f8f9fa;
            padding: 1.5rem;
            border-radius: 8px;
            border-left: 4px solid #4299e1;
            transition: transform 0.2s ease;
        }

        .methodology-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .methodology-card h4 {
            color: #2d3748;
            margin-bottom: 1rem;
            font-size: 1.1rem;
            display: flex;
            align-items: center;
        }

        .methodology-card ul {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        .methodology-card li {
            padding: 0.5rem 0;
            border-bottom: 1px solid #e2e8f0;
            font-size: 0.9rem;
            line-height: 1.4;
        }

        .methodology-card li:last-child {
            border-bottom: none;
        }

        .methodology-card li strong {
            color: #4a5568;
            font-weight: 600;
        }

        .technical-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 1.5rem;
            margin: 1.5rem 0;
        }

        .technical-details {
            background: linear-gradient(135deg, #f8f9fa 0%, #f1f5f9 100%);
            padding: 1.5rem;
            border-radius: 12px;
            border-left: 4px solid #4299e1;
            margin: 0;
            transition: transform 0.2s ease;
            position: relative;
            overflow: hidden;
        }

        .technical-details::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: linear-gradient(90deg, #4299e1, #63b3ed);
        }

        .technical-details:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
        }

        .technical-details h4 {
            color: #2d3748;
            margin-bottom: 1rem;
            font-size: 1.1rem;
            font-weight: 600;
            display: flex;
            align-items: center;
        }

        .technical-details p {
            margin: 0.5rem 0;
            color: #4a5568;
            line-height: 1.6;
        }

        .technical-details ul {
            margin: 1rem 0;
            padding-left: 1.5rem;
        }

        .technical-details li {
            margin: 0.5rem 0;
            color: #4a5568;
            line-height: 1.5;
        }

        .technical-details strong {
            color: #2d3748;
            font-weight: 600;
        }

        .footer {
            text-align: center;
            padding: 2rem 1rem;
            background: var(--bg-gradient-start);
            border-top: 1px solid #e2e8f0;
            margin-top: 2rem;
        }

        .footer p {
            margin: 0.5rem 0;
            color: var(--text-color);
        }

        .footer p:first-child {
            font-weight: 600;
        }

        @media (max-width: 768px) {
            .container {
                padding: 1rem;
            }

            .header h1 {
                font-size: 2rem;
            }

            .chart-tabs {
                flex-wrap: wrap;
            }

            .tab-button {
                flex: 1;
                min-width: 0;
                padding: 0.5rem 0.75rem;
                font-size: 0.85rem;
            }

            .decision-matrix {
                grid-template-columns: 1fr;
            }

            .summary-grid {
                grid-template-columns: 1fr;
            }

            .technical-grid {
                grid-template-columns: 1fr;
            }

            /* On small screens, stack label above value for better readability */
            .stat-item {
                grid-template-columns: 1fr;
                gap: 0.25rem;
            }

            .stat-value {
                text-align: left;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <div class="header">
            <h1>🦀 Rust vs 🐹 TinyGo WebAssembly</h1>
            <div class="subtitle">Engineering Decision Support System</div>
            <div class="timestamp">Analysis Generated: {{ timestamp }}</div>
        </div>

        <!-- Executive Summary -->
        <div class="summary-grid">
            <div class="summary-card rust">
                <h3><div class="icon"></div>Rust Performance</h3>
                <div class="metric">
                    <span class="label">Avg Execution Time:</span>
                    <span class="value">{{ rust_avg_execution_time }}ms</span>
                </div>
                <div class="metric">
                    <span class="label">Avg Memory Usage:</span>
                    <span class="value">{{ rust_avg_memory_usage }}MB</span>
                </div>
                <div class="metric">
                    <span class="label">Success Rate:</span>
                    <span class="value">{{ rust_success_rate }}%</span>
                </div>
            </div>

            <div class="summary-card tinygo">
                <h3><div class="icon"></div>TinyGo Performance</h3>
                <div class="metric">
                    <span class="label">Avg Execution Time:</span>
                    <span class="value">{{ tinygo_avg_execution_time }}ms</span>
                </div>
                <div class="metric">
                    <span class="label">Avg Memory Usage:</span>
                    <span class="value">{{ tinygo_avg_memory_usage }}MB</span>
                </div>
                <div class="metric">
                    <span class="label">Success Rate:</span>
                    <span class="value">{{ tinygo_success_rate }}%</span>
                </div>
            </div>

            <div class="summary-card">
                <h3>⚖️ Performance Stability</h3>
                <div class="metric">
                    <span class="label">Stability Score:</span>
                    <span class="value">{{ "%.1f%%" | format(stability_insights.stability_score * 100) if stability_insights else "N/A" }}</span>
                </div>
                <div class="metric">
                    <span class="label">Consistency Leader:</span>
                    <span class="value">{{ stability_insights.consistency_winner.title() if stability_insights and stability_insights.consistency_winner != 'tie' else 'Tied' if stability_insights else 'N/A' }}</span>
                </div>
                <div class="metric">
                    <span class="label">Risk Assessment:</span>
                    <span class="value">{{ stability_insights.risk_assessment.title() if stability_insights else 'N/A' }}</span>
                </div>
            </div>

            <div class="summary-card">
                <h3>📊 Statistical Significance</h3>
                    <div class="stats-panel">
                        <div class="stat-item">
                            <div class="stat-label">Execution Time p-value</div>
                            <div class="stat-value">{{ execution_time_p_value }}</div>
                        </div>

                        <div class="stat-item">
                            <div class="stat-label">Memory Usage p-value</div>
                            <div class="stat-value">{{ memory_usage_p_value }}</div>
                        </div>

                        <div class="stat-item">
                            <div class="stat-label">Effect Size</div>
                            <div class="stat-value multiline">{{ overall_effect_size }}</div>
                        </div>

                        <div class="stat-item">
                            <div class="stat-label">Confidence Level</div>
                            <div class="stat-value">95%</div>
                        </div>
                    </div>
            </div>
        </div>

        <!-- Performance Charts -->
        <div class="section">
            <div class="section-header">📈 Performance Comparison Charts</div>
            <div class="section-content">
                <div class="chart-tabs">
                    <button class="tab-button active" data-chart="distribution-analysis">Distribution Analysis</button>
                    <button class="tab-button" data-chart="execution-time">Execution Time</button>
                    <button class="tab-button" data-chart="memory-usage">Memory Usage</button>
                    <button class="tab-button" data-chart="effect-size">Effect Size</button>
                </div>
                <div class="chart-grid">
                    <div class="chart-container active" id="distribution-analysis-chart">
                        <h4>Distribution & Variance Analysis: Performance Consistency</h4>
                        <img src="{{ charts.distribution_variance_analysis }}" alt="Distribution and Variance Analysis">
                        <p>Box plots show data distribution, variance, and stability patterns for engineering decision-making.</p>
                    </div>
                    <div class="chart-container" id="execution-time-chart">
                        <h4>Execution Time Comparison: Rust vs TinyGo (Mean ± SE with Medians)</h4>
                        <img src="{{ charts.execution_time }}" alt="Execution Time Comparison">
                    </div>
                    <div class="chart-container" id="memory-usage-chart">
                        <h4>Memory Usage Comparison: Rust vs TinyGo (Mean ± SE with Medians)</h4>
                        <img src="{{ charts.memory_usage }}" alt="Memory Usage Comparison">
                    </div>
                    <div class="chart-container" id="effect-size-chart">
                        <h4>Cohen's d Effect Size Heatmap</h4>
                        <img src="{{ charts.effect_size }}" alt="Effect Size Heatmap">
                    </div>
                </div>
            </div>
        </div>

        <!-- Performance Stability Analysis -->
        {% if stability_insights %}
        <div class="section">
            <div class="section-header">📊 Performance Stability Analysis</div>
            <div class="section-content">
                <div class="technical-grid">
                    <div class="technical-details">
                        <h4>🎯 Overall Stability Assessment</h4>
                        <p><strong>Stability Score:</strong> {{ "%.1f%%" | format(stability_insights.stability_score * 100) }}</p>
                        <p><strong>High Variance Ratio:</strong> {{ "%.1f%%" | format(stability_insights.high_variance_ratio * 100) }}</p>
                        <p><strong>Risk Level:</strong> {{ stability_insights.risk_assessment.title() }}</p>
                        <p><strong>Consistency Leader:</strong> {{ stability_insights.consistency_winner.title() if stability_insights.consistency_winner != 'tie' else 'Neither (tied)' }}</p>
                    </div>

                    <div class="technical-details">
                        <h4>🦀 Rust Performance Consistency</h4>
                        <p><strong>Stability Score:</strong> {{ "%.1f%%" | format(stability_insights.detailed_metrics.rust.stability_score * 100) }}</p>
                        <p><strong>Avg Execution CV:</strong> {{ "%.3f" | format(stability_insights.detailed_metrics.rust.avg_exec_cv) }}</p>
                        <p><strong>Avg Memory CV:</strong> {{ "%.3f" | format(stability_insights.detailed_metrics.rust.avg_mem_cv) }}</p>
                        <p><strong>High Variance Count:</strong> {{ stability_insights.detailed_metrics.rust.high_variance_count }}</p>
                    </div>

                    <div class="technical-details">
                        <h4>🐹 TinyGo Performance Consistency</h4>
                        <p><strong>Stability Score:</strong> {{ "%.1f%%" | format(stability_insights.detailed_metrics.tinygo.stability_score * 100) }}</p>
                        <p><strong>Avg Execution CV:</strong> {{ "%.3f" | format(stability_insights.detailed_metrics.tinygo.avg_exec_cv) }}</p>
                        <p><strong>Avg Memory CV:</strong> {{ "%.3f" | format(stability_insights.detailed_metrics.tinygo.avg_mem_cv) }}</p>
                        <p><strong>High Variance Count:</strong> {{ stability_insights.detailed_metrics.tinygo.high_variance_count }}</p>
                    </div>

                    <div class="technical-details">
                        <h4>📋 Engineering Insights</h4>
                        <ul>
                            {% for insight in stability_insights.engineering_insights %}
                            <li>{{ insight }}</li>
                            {% endfor %}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
        {% endif %}

        <!-- Detailed Comparison Table -->
        <div class="section">
            <div class="section-header">📋 Detailed Performance Breakdown</div>
            <div class="section-content">
                <div class="table-wrapper">
                <table class="comparison-table">
                    <thead>
                        <tr>
                            <th>Task</th>
                            <th>Scale</th>
                            <th>Rust (ms)</th>
                            <th>TinyGo (ms)</th>
                            <th>Speed Advantage</th>
                            <th>Memory Advantage</th>
                            <th>Overall Recommendation</th>
                        </tr>
                    </thead>
                    <tbody>
                        {% for result in comparison_results %}
                        <tr>
                            <td><strong>{{ result.task }}</strong></td>
                            <td>{{ result.scale }}</td>
                            <td>{{ result.rust_time_ms }}</td>
                            <td>{{ result.tinygo_time_ms }}</td>
                            <td class="{{ 'winner-rust' if result.time_winner == 'rust' else 'winner-tinygo' }}">
                                {{ result.time_advantage }}
                            </td>
                            <td class="{{ 'winner-rust' if result.memory_winner == 'rust' else 'winner-tinygo' }}">
                                {{ result.memory_advantage }}
                            </td>
                            <td>
                                {% if result.recommendation_level == 'strong' %}
                                <span class="performance-badge badge-strong">
                                {% elif result.recommendation_level == 'moderate' %}
                                <span class="performance-badge badge-moderate">
                                {% elif result.recommendation_level == 'weak' %}
                                <span class="performance-badge badge-weak">
                                {% elif result.recommendation_level == 'neutral' %}
                                <span class="performance-badge badge-neutral">
                                {% else %}
                                <span class="performance-badge badge-tradeoff">
                                {% endif %}
                                    {{ result.overall_recommendation }}
                                </span>
                            </td>
                        </tr>
                        {% endfor %}
                    </tbody>
                </table>
                </div>
            </div>
        </div>

        <!-- Decision Matrix -->
        <div class="section">
            <div class="section-header">🎯 Engineering Decision Matrix</div>
            <div class="section-content">
                <div class="decision-matrix">
                    <div class="decision-card recommended">
                        <h4>🚀 Choose Rust When:</h4>
                        <ul>
                            <li>Maximum performance is critical</li>
                            <li>Memory efficiency is paramount</li>
                            <li>Team has Rust experience</li>
                            <li>Complex algorithms/computations</li>
                            <li>Long-term project maintenance</li>
                            <li>Zero-cost abstractions needed</li>
                        </ul>
                    </div>

                    <div class="decision-card conditional">
                        <h4>⚖️ Choose TinyGo When:</h4>
                        <ul>
                            <li>Faster development cycles preferred</li>
                            <li>Team familiar with Go ecosystem</li>
                            <li>Simpler deployment requirements</li>
                            <li>Rapid prototyping needed</li>
                            <li>Good-enough performance acceptable</li>
                            <li>Integration with Go services</li>
                        </ul>
                    </div>

                    <div class="decision-card not-recommended">
                        <h4>🚨 Avoid When:</h4>
                        <ul>
                            <li>Rust: Steep learning curve unacceptable</li>
                            <li>Rust: Compilation time is bottleneck</li>
                            <li>TinyGo: Performance is critical</li>
                            <li>TinyGo: Memory constraints strict</li>
                            <li>Either: No WebAssembly experience</li>
                            <li>Either: Legacy system constraints</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>

        <!-- Primary Recommendation -->
        <div class="recommendation">
            <h3>🎯 Primary Recommendation</h3>
            <p>{{ primary_recommendation }}</p>
        </div>

        <!-- Technical Implementation Details -->
        <div class="section">
            <div class="section-header">🔧 Technical Implementation Notes</div>
            <div class="section-content">
                <div class="technical-grid">
                    <div class="technical-details">
                        <h4>🖥️ Experimental Environment</h4>
                        <p><strong>Hardware:</strong> AWS EC2 c7g.2xlarge (4 CPU, 16GB RAM)</p>
                        <p><strong>Operating System:</strong> Ubuntu 22.04 (Linux/x86_64)</p>
                        <p><strong>Browser:</strong> Headless Chromium 140+ (Puppeteer 24+)</p>
                        <p><strong>Language Toolchains:</strong></p>
                        <ul>
                            <li>Rust 1.89+ (stable) targeting wasm32-unknown-unknown</li>
                            <li>TinyGo 0.39+ + Go 1.25+ targeting WebAssembly</li>
                            <li>Node.js 22 LTS, Python 3.13+</li>
                        </ul>
                    </div>

                    <div class="technical-details">
                        <h4>⚙️ Build Configuration</h4>
                        <p><strong>Rust (Bare Interface):</strong></p>
                        <ul>
                            <li>Optimization: opt-level=3, lto="fat", codegen-units=1</li>
                            <li>Panic: abort, Strip: debuginfo</li>
                            <li>Post-processing: wasm-strip + wasm-opt -O3</li>
                        </ul>
                        <p><strong>TinyGo:</strong></p>
                        <ul>
                            <li>Build flags: -opt=2, -panic=trap, -no-debug, -scheduler=none, -gc=conservative</li>
                            <li>Post-processing: wasm-strip + wasm-opt -Oz</li>
                        </ul>
                    </div>

                    <div class="technical-details">
                        <h4>🎯 Benchmark Tasks</h4>
                        <p><strong>Mandelbrot:</strong> CPU floating-point intensive (256×256 to 1024×1024)</p>
                        <p><strong>JSON Parsing:</strong> Structured data processing (5K to 30K records)</p>
                        <p><strong>Matrix Multiplication:</strong> Dense numerical computation (256×256 to 576×576)</p>
                        <p><strong>Verification:</strong> FNV-1a hash consistency across languages</p>
                    </div>

                    <div class="technical-details">
                        <h4>📈 Scalability Analysis</h4>
                        <p>Progressive GC pressure design across scales:</p>
                        <ul>
                            <li><strong>Small:</strong> No GC trigger (< 1MB usage)</li>
                            <li><strong>Medium:</strong> Light GC trigger (2-4MB usage)</li>
                            <li><strong>Large:</strong> Moderate GC trigger (6-10MB usage)</li>
                        </ul>
                    </div>

                    <div class="technical-details">
                        <h4>🚀 Deployment Considerations</h4>
                        <p><strong>Rust:</strong> Zero-cost abstractions, compile-time memory management, no GC overhead</p>
                        <p><strong>TinyGo:</strong> Garbage collector with GC pauses and allocation overhead</p>
                    </div>

                    <div class="technical-details">
                        <h4>⚠️ Limitations & Trade-offs</h4>
                        <p><strong>Rust:</strong> Steeper learning curve, longer compile times, complex dependency management</p>
                        <p><strong>TinyGo:</strong> GC pauses affect latency-critical applications, limited Go standard library</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Methodology -->
        <div class="section">
            <div class="section-header">🔬 Methodology & Validation</div>
            <div class="section-content">
                <div class="methodology-grid">
                    <div class="methodology-card">
                        <h4>📊 Benchmark Design</h4>
                        <ul>
                            <li><strong>Tasks:</strong> Mandelbrot, JSON parsing, matrix multiplication</li>
                            <li><strong>Scales:</strong> Small, medium, large across all tasks</li>
                            <li><strong>Environment:</strong> Headless Chromium with Puppeteer</li>
                            <li><strong>Verification:</strong> FNV-1a hash consistency</li>
                        </ul>
                    </div>

                    <div class="methodology-card">
                        <h4>🔄 Reproducibility & Environment</h4>
                        <ul>
                            <li><strong>Environment Fingerprinting:</strong> Toolchain version locking</li>
                            <li><strong>Deterministic Execution:</strong> Fixed random seeds</li>
                            <li><strong>Hardware Consistency:</strong> Controlled test environment</li>
                            <li><strong>Version Control:</strong> Git-based artifact tracking</li>
                        </ul>
                    </div>

                    <div class="methodology-card">
                        <h4>📈 Data Collection</h4>
                        <ul>
                            <li><strong>Warmup:</strong> 15 runs (discarded)</li>
                            <li><strong>Measurement:</strong> 50 runs per configuration</li>
                            <li><strong>Repetitions:</strong> 3 full cycles</li>
                            <li><strong>Timing:</strong> performance.now() API</li>
                        </ul>
                    </div>

                    <div class="methodology-card">
                        <h4>✅ Quality Control</h4>
                        <ul>
                            <li><strong>CV Threshold:</strong> < 15% variation</li>
                            <li><strong>Min Samples:</strong> 30 per dataset</li>
                            <li><strong>Hash Verification:</strong> Cross-language consistency</li>
                            <li><strong>Seed:</strong> Fixed random seed (42)</li>
                        </ul>
                    </div>

                    <div class="methodology-card">
                        <h4>🧮 Statistical Analysis</h4>
                        <ul>
                            <li><strong>Significance:</strong> Welch's t-test (p < 0.05)</li>
                            <li><strong>Effect Size:</strong> Cohen's d (0.3/0.6/1.0 thresholds)</li>
                            <li><strong>Confidence:</strong> 95% intervals</li>
                            <li><strong>Outliers:</strong> IQR method (1.5×IQR)</li>
                        </ul>
                    </div>

                    <div class="methodology-card">
                        <h4>🎯 Validation Mechanisms</h4>
                        <ul>
                            <li><strong>Cross-Language Verification:</strong> Identical hash outputs</li>
                            <li><strong>Memory Monitoring:</strong> Browser performance API</li>
                            <li><strong>Execution Stability:</strong> Coefficient of variation checks</li>
                            <li><strong>Result Integrity:</strong> SHA256 checksum validation</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="footer">
        <p>Generated by WebAssembly Benchmark Analysis System | Engineering Decision Support</p>
        <p>For questions or technical details, consult the full benchmark report and methodology documentation.</p>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const tabButtons = document.querySelectorAll('.tab-button');
            const chartContainers = document.querySelectorAll('.chart-container');

            function switchChart(chartType) {
                // Remove active class from all tabs and containers
                tabButtons.forEach(btn => btn.classList.remove('active'));
                chartContainers.forEach(container => container.classList.remove('active'));

                // Add active class to selected tab and container
                const selectedTab = document.querySelector(`[data-chart="${chartType}"]`);
                const selectedContainer = document.getElementById(`${chartType}-chart`);

                if (selectedTab && selectedContainer) {
                    selectedTab.classList.add('active');
                    selectedContainer.classList.add('active');
                }
            }

            // Add click event listeners to tab buttons
            tabButtons.forEach(button => {
                button.addEventListener('click', function() {
                    const chartType = this.getAttribute('data-chart');
                    switchChart(chartType);
                });
            });

            // Initialize with distribution analysis chart active
            switchChart('distribution-analysis');
        });
    </script>
</body>
</html>