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

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
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
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
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
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 1.5rem;
            margin: 1.5rem 0;
        }

        .chart-container {
            text-align: center;
            background: #f7fafc;
            padding: 1rem;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
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

        .technical-details {
            background: #f8f9fa;
            padding: 1rem;
            border-radius: 8px;
            border-left: 4px solid #6c757d;
            margin: 1rem 0;
        }

        .technical-details h4 {
            color: #495057;
            margin-bottom: 0.5rem;
        }

        .technical-details code {
            background: #e9ecef;
            padding: 0.2rem 0.4rem;
            border-radius: 4px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
        }

        .footer {
            text-align: center;
            padding: 2rem;
            color: #718096;
            font-size: 0.9rem;
        }

        @media (max-width: 768px) {
            .container {
                padding: 1rem;
            }

            .header h1 {
                font-size: 2rem;
            }

            .decision-matrix {
                grid-template-columns: 1fr;
            }

            .summary-grid {
                grid-template-columns: 1fr;
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
                <h3>📊 Statistical Significance</h3>
                <div class="metric">
                    <span class="label">Execution Time p-value:</span>
                    <span class="value">{{ execution_time_p_value }}</span>
                </div>
                <div class="metric">
                    <span class="label">Memory Usage p-value:</span>
                    <span class="value">{{ memory_usage_p_value }}</span>
                </div>
                <div class="metric">
                    <span class="label">Effect Size:</span>
                    <span class="value">{{ overall_effect_size }}</span>
                </div>
                <div class="metric">
                    <span class="label">Confidence Level:</span>
                    <span class="value">95%</span>
                </div>
            </div>
        </div>

        <!-- Performance Charts -->
        <div class="section">
            <div class="section-header">📈 Performance Comparison Charts</div>
            <div class="section-content">
                <div class="chart-grid">
                    <div class="chart-container">
                        <img src="{{ charts.execution_time }}" alt="Execution Time Comparison">
                        <h4>Execution Time Analysis</h4>
                        <p>Runtime performance across different workload scales</p>
                    </div>
                    <div class="chart-container">
                        <img src="{{ charts.memory_usage }}" alt="Memory Usage Comparison">
                        <h4>Memory Usage Analysis</h4>
                        <p>Memory consumption patterns and efficiency</p>
                    </div>
                    <div class="chart-container">
                        <img src="{{ charts.effect_size }}" alt="Effect Size Heatmap">
                        <h4>Statistical Effect Size</h4>
                        <p>Magnitude of performance differences across tasks</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Detailed Comparison Table -->
        <div class="section">
            <div class="section-header">📋 Detailed Performance Breakdown</div>
            <div class="section-content">
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
                <div class="technical-details">
                    <h4>📦 Build Configuration</h4>
                    <p>Rust: <code>wasm-pack build --target web --release</code></p>
                    <p>TinyGo: <code>tinygo build -o main.wasm -target wasm main.go</code></p>
                </div>

                <div class="technical-details">
                    <h4>🚀 Deployment Considerations</h4>
                    <p><strong>Rust:</strong> {{ rust_deployment_notes }}</p>
                    <p><strong>TinyGo:</strong> {{ tinygo_deployment_notes }}</p>
                </div>

                <div class="technical-details">
                    <h4>📈 Scalability Analysis</h4>
                    <p>Performance scaling characteristics across workload sizes:</p>
                    <p><strong>Rust:</strong> {{ rust_scalability_notes }}</p>
                    <p><strong>TinyGo:</strong> {{ tinygo_scalability_notes }}</p>
                </div>

                <div class="technical-details">
                    <h4>⚠️ Limitations & Trade-offs</h4>
                    <p><strong>Rust:</strong> {{ rust_limitations }}</p>
                    <p><strong>TinyGo:</strong> {{ tinygo_limitations }}</p>
                </div>
            </div>
        </div>

        <!-- Methodology -->
        <div class="section">
            <div class="section-header">🔬 Methodology & Validation</div>
            <div class="section-content">
                <p><strong>Benchmark Tasks:</strong> {{ benchmark_tasks_description }}</p>
                <p><strong>Test Environment:</strong> {{ test_environment }}</p>
                <p><strong>Sample Size:</strong> {{ total_samples }} measurements per configuration</p>
                <p><strong>Statistical Method:</strong> Mann-Whitney U test with Bonferroni correction</p>
                <p><strong>Quality Control:</strong> Outlier detection via IQR method, {{ quality_control_notes }}</p>
                <p><strong>Reproducibility:</strong> All results reproducible with seed {{ random_seed }}</p>
            </div>
        </div>
    </div>

    <div class="footer">
        <p>Generated by WebAssembly Benchmark Analysis System | Engineering Decision Support</p>
        <p>For questions or technical details, consult the full benchmark report and methodology documentation.</p>
    </div>
</body>
</html>