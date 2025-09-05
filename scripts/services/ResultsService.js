/**
 * Results Service
 * Handles all benchmark results processing, formatting, and output
 */

import fs from 'fs/promises';
import path from 'path';
import { IResultsService } from '../interfaces/IResultsService.js';

export class ResultsService extends IResultsService {
    constructor() {
        super();
        this.results = [];
        this.startTime = null;
        this.endTime = null;
        this.summary = null;
    }

    /**
     * Initialize results collection
     * @param {Object} metadata - Initial metadata for the results
     */
    initialize(metadata = {}) {
        this.startTime = Date.now();
        this.results = [];
        this.summary = {
            ...metadata,
            startTime: new Date(this.startTime).toISOString(),
            totalTasks: 0,
            successfulTasks: 0,
            failedTasks: 0,
            totalDuration: 0
        };
    }

    /**
     * Add benchmark result
     * @param {Object} result - Benchmark result data
     */
    addResult(result) {
        const processedResult = {
            ...result,
            timestamp: new Date().toISOString(),
            id: this.generateResultId()
        };

        this.results.push(processedResult);
        this.updateSummary(processedResult);
    }

    /**
     * Generate unique result ID
     * @returns {string} Unique identifier
     */
    generateResultId() {
        return `result_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    }

    /**
     * Update summary statistics
     * @param {Object} result - New result to incorporate
     */
    updateSummary(result) {
        this.summary.totalTasks++;
        
        if (result.success) {
            this.summary.successfulTasks++;
        } else {
            this.summary.failedTasks++;
        }

        if (result.duration) {
            this.summary.totalDuration += result.duration;
        }

        // Update success rate
        this.summary.successRate = this.summary.totalTasks > 0 
            ? (this.summary.successfulTasks / this.summary.totalTasks) 
            : 0;
    }

    /**
     * Finalize results collection
     * @param {Object} additionalMetadata - Additional metadata to include
     */
    finalize(additionalMetadata = {}) {
        this.endTime = Date.now();
        this.summary.endTime = new Date(this.endTime).toISOString();
        this.summary.totalExecutionTime = this.endTime - this.startTime;
        this.summary.averageTaskDuration = this.summary.totalTasks > 0 
            ? this.summary.totalDuration / this.summary.totalTasks 
            : 0;

        // Add any additional metadata
        Object.assign(this.summary, additionalMetadata);
    }

    /**
     * Get current results
     * @returns {Array} Array of results
     */
    getResults() {
        return [...this.results];
    }

    /**
     * Get results summary
     * @returns {Object} Summary statistics
     */
    getSummary() {
        return { ...this.summary };
    }

    /**
     * Get failed results only
     * @returns {Array} Array of failed results
     */
    getFailedResults() {
        return this.results.filter(result => !result.success);
    }

    /**
     * Get successful results only
     * @returns {Array} Array of successful results
     */
    getSuccessfulResults() {
        return this.results.filter(result => result.success);
    }

    /**
     * Filter results by criteria
     * @param {Function|Object} criteria - Filter function or criteria object
     * @returns {Array} Filtered results
     */
    filterResults(criteria) {
        if (typeof criteria === 'function') {
            return this.results.filter(criteria);
        }

        if (typeof criteria === 'object') {
            return this.results.filter(result => {
                return Object.entries(criteria).every(([key, value]) => {
                    return result[key] === value;
                });
            });
        }

        return [...this.results];
    }

    /**
     * Sort results by field
     * @param {string} field - Field to sort by
     * @param {string} order - 'asc' or 'desc'
     * @returns {Array} Sorted results
     */
    sortResults(field, order = 'asc') {
        const sorted = [...this.results].sort((a, b) => {
            const aVal = this.getNestedValue(a, field);
            const bVal = this.getNestedValue(b, field);

            if (aVal < bVal) return order === 'asc' ? -1 : 1;
            if (aVal > bVal) return order === 'asc' ? 1 : -1;
            return 0;
        });

        return sorted;
    }

    /**
     * Get nested object value by dot notation
     * @param {Object} obj - Object to get value from
     * @param {string} path - Dot notation path
     * @returns {any} Value at path
     */
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            return current && current[key] !== undefined ? current[key] : undefined;
        }, obj);
    }

    /**
     * Generate formatted report
     * @param {string} format - Report format ('json', 'text', 'csv')
     * @returns {string} Formatted report
     */
    generateReport(format = 'json') {
        const data = {
            summary: this.getSummary(),
            results: this.getResults()
        };

        switch (format.toLowerCase()) {
            case 'json':
                return JSON.stringify(data, null, 2);
            case 'text':
                return this.generateTextReport(data);
            case 'csv':
                return this.generateCSVReport(data);
            default:
                throw new Error(`Unsupported format: ${format}`);
        }
    }

    /**
     * Generate text report
     * @param {Object} data - Data to format
     * @returns {string} Text report
     */
    generateTextReport(data) {
        const { summary, results } = data;
        let report = [];

        // Summary section
        report.push('='.repeat(60));
        report.push('BENCHMARK RESULTS SUMMARY');
        report.push('='.repeat(60));
        report.push(`Start Time: ${summary.startTime}`);
        report.push(`End Time: ${summary.endTime}`);
        report.push(`Total Execution Time: ${summary.totalExecutionTime}ms`);
        report.push(`Total Tasks: ${summary.totalTasks}`);
        report.push(`Successful: ${summary.successfulTasks}`);
        report.push(`Failed: ${summary.failedTasks}`);
        report.push(`Success Rate: ${(summary.successRate * 100).toFixed(2)}%`);
        report.push(`Average Duration: ${summary.averageTaskDuration.toFixed(2)}ms`);
        report.push('');

        // Results section
        if (results.length > 0) {
            report.push('DETAILED RESULTS');
            report.push('-'.repeat(40));
            
            results.forEach((result, index) => {
                report.push(`${index + 1}. ${result.name || 'Unnamed Task'}`);
                report.push(`   Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
                if (result.duration) {
                    report.push(`   Duration: ${result.duration}ms`);
                }
                if (result.error) {
                    report.push(`   Error: ${result.error}`);
                }
                report.push('');
            });
        }

        return report.join('\n');
    }

    /**
     * Generate CSV report
     * @param {Object} data - Data to format
     * @returns {string} CSV report
     */
    generateCSVReport(data) {
        const { results } = data;
        
        if (results.length === 0) {
            return 'No results to export';
        }

        // Get all unique keys from results
        const headers = new Set();
        results.forEach(result => {
            Object.keys(result).forEach(key => headers.add(key));
        });

        const csvHeaders = Array.from(headers).join(',');
        const csvRows = results.map(result => {
            return Array.from(headers).map(header => {
                const value = result[header];
                // Escape quotes and wrap in quotes if contains comma
                if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value || '';
            }).join(',');
        });

        return [csvHeaders, ...csvRows].join('\n');
    }

    /**
     * Save results to file
     * @param {string} filepath - Path to save file
     * @param {string} format - File format
     * @param {Object} options - Save options
     * @returns {Promise<void>}
     */
    async saveToFile(filepath, format = 'json', options = {}) {
        try {
            // Ensure directory exists
            const dir = path.dirname(filepath);
            await fs.mkdir(dir, { recursive: true });

            // Generate report content
            const content = this.generateReport(format);

            // Write to file
            await fs.writeFile(filepath, content, 'utf8');

            // Save additional metadata if requested
            if (options.saveMetadata) {
                const metadataPath = filepath.replace(/\.[^.]+$/, '.metadata.json');
                const metadata = {
                    generatedAt: new Date().toISOString(),
                    format: format,
                    resultCount: this.results.length,
                    summary: this.getSummary()
                };
                await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
            }

        } catch (error) {
            throw new Error(`Failed to save results to ${filepath}: ${error.message}`);
        }
    }

    /**
     * Load results from file
     * @param {string} filepath - Path to load from
     * @returns {Promise<Object>} Loaded results data
     */
    async loadFromFile(filepath) {
        try {
            const content = await fs.readFile(filepath, 'utf8');
            const data = JSON.parse(content);
            
            if (data.results) {
                this.results = data.results;
            }
            if (data.summary) {
                this.summary = data.summary;
            }

            return data;
        } catch (error) {
            throw new Error(`Failed to load results from ${filepath}: ${error.message}`);
        }
    }

    /**
     * Clear all results
     */
    clear() {
        this.results = [];
        this.summary = null;
        this.startTime = null;
        this.endTime = null;
    }

    /**
     * Validate result data structure
     * @param {Object} result - Result to validate
     * @returns {boolean} True if valid
     */
    validateResult(result) {
        const required = ['name', 'success'];
        return required.every(field => result.hasOwnProperty(field));
    }

    /**
     * Get results statistics
     * @returns {Object} Statistics object
     */
    getStatistics() {
        if (this.results.length === 0) {
            return { count: 0 };
        }

        const durations = this.results
            .filter(r => r.duration)
            .map(r => r.duration);

        const stats = {
            count: this.results.length,
            successCount: this.getSuccessfulResults().length,
            failureCount: this.getFailedResults().length,
            successRate: this.summary?.successRate || 0
        };

        if (durations.length > 0) {
            stats.duration = {
                min: Math.min(...durations),
                max: Math.max(...durations),
                average: durations.reduce((a, b) => a + b, 0) / durations.length,
                median: this.calculateMedian(durations)
            };
        }

        return stats;
    }

    /**
     * Calculate median of array
     * @param {Array} arr - Numeric array
     * @returns {number} Median value
     */
    calculateMedian(arr) {
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 
            ? (sorted[mid - 1] + sorted[mid]) / 2 
            : sorted[mid];
    }
}