// Statistical power analysis for WebAssembly performance experiments
// Ensures scientific rigor in experimental design and sample size determination

export class PowerAnalysis {
    constructor() {
    // Z-score lookup table for common alpha values
        this.zScores = {
            0.001: 3.291,  // 99.9% confidence
            0.01: 2.576,   // 99% confidence
            0.05: 1.960,   // 95% confidence (most common)
            0.10: 1.645    // 90% confidence
        };
    }

    getZScore(p) {
    // Find closest p-value in lookup table
        const closestP = Object.keys(this.zScores)
            .map(Number)
            .reduce((prev, curr) =>
                (Math.abs(curr - p) < Math.abs(prev - p) ? curr : prev)
            );
        return this.zScores[closestP];
    }

    // Standard normal CDF approximation
    normalCDF(z) {
    // Approximation of the cumulative distribution function for standard normal
    // Using the widely used rational approximation
        const a1 =  0.254829592;
        const a2 = -0.284496736;
        const a3 =  1.421413741;
        const a4 = -1.453152027;
        const a5 =  1.061405429;
        const p  =  0.3275911;

        const sign = z < 0 ? -1 : 1;
        z = Math.abs(z) / Math.sqrt(2);

        const t = 1.0 / (1.0 + p * z);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

        return 0.5 * (1 + sign * y);
    }

    // Calculate required sample size for detecting effect
    calculateRequiredSampleSize(expectedEffectSize, alpha = 0.05, power = 0.8) {
        const za = this.getZScore(alpha / 2);  // Two-tailed test
        const zb = this.getZScore(1 - power);

        // Formula for two-sample t-test: n ≈ 2 * ((za + zb) / d)^2
        // Corrected formula - for d=0.5 (medium effect), should return ~64 per group
        const n = 2 * Math.pow((za + zb) / expectedEffectSize, 2);
        return Math.ceil(n / 2); // Return per group, not total sample size
    }

    // Calculate Cohen's d effect size from sample data
    calculateEffectSize(group1, group2) {
        const mean1 = this.calculateMean(group1);
        const mean2 = this.calculateMean(group2);
        const pooledStd = this.calculatePooledStandardDeviation(group1, group2);

        return Math.abs(mean1 - mean2) / pooledStd;
    }

    calculateMean(data) {
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('Cannot calculate mean of empty or invalid array');
        }
        return data.reduce((sum, value) => sum + value, 0) / data.length;
    }

    calculateStandardDeviation(data) {
        const mean = this.calculateMean(data);
        const variance = data.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (data.length - 1);
        return Math.sqrt(variance);
    }

    calculatePooledStandardDeviation(group1, group2) {
        const n1 = group1.length;
        const n2 = group2.length;
        const s1 = this.calculateStandardDeviation(group1);
        const s2 = this.calculateStandardDeviation(group2);

        const pooledVariance = ((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / (n1 + n2 - 2);
        return Math.sqrt(pooledVariance);
    }

    // Calculate statistical power for given parameters
    calculatePower(sampleSize, effectSize, alpha = 0.05) {
        const za = this.getZScore(alpha / 2);
        const delta = effectSize * Math.sqrt(sampleSize / 2);

        // Approximate power calculation
        const power = 1 - this.normalCDF(za - delta);
        return Math.min(Math.max(power, 0), 1); // Clamp between 0 and 1
    }

    // Validate current experimental design
    validateCurrentDesign(pilotData, targetEffectSize = 0.5) {
        if (!pilotData || !pilotData.rust || !pilotData.tinygo) {
            return {
                status: 'insufficient_data',
                message: 'Pilot data must include both rust and tinygo performance samples'
            };
        }

        const observedEffect = this.calculateEffectSize(pilotData.rust, pilotData.tinygo);
        const currentSampleSize = Math.min(pilotData.rust.length, pilotData.tinygo.length);
        const currentPower = this.calculatePower(currentSampleSize, observedEffect, 0.05);

        const recommendedSampleSize = this.calculateRequiredSampleSize(
            Math.max(observedEffect, targetEffectSize)
        );

        return {
            observedEffectSize: observedEffect,
            currentSampleSize,
            currentPower,
            targetPower: 0.8,
            recommendation: currentPower >= 0.8 ? 'sufficient' : 'increase_sample_size',
            suggestedSampleSize: currentPower < 0.8 ? recommendedSampleSize : null,
            interpretation: this.interpretEffectSize(observedEffect),
            statisticalSignificance: this.calculateSignificance(pilotData.rust, pilotData.tinygo)
        };
    }

    interpretEffectSize(effectSize) {
        if (effectSize < 0.2) return 'negligible';
        if (effectSize < 0.5) return 'small';
        if (effectSize < 0.8) return 'medium';
        return 'large';
    }

    // Welch's t-test for unequal variances
    calculateSignificance(group1, group2, alpha = 0.05) {
        const n1 = group1.length;
        const n2 = group2.length;
        const mean1 = this.calculateMean(group1);
        const mean2 = this.calculateMean(group2);
        const s1 = this.calculateStandardDeviation(group1);
        const s2 = this.calculateStandardDeviation(group2);

        // Welch's t-statistic
        const t = (mean1 - mean2) / Math.sqrt((s1 * s1) / n1 + (s2 * s2) / n2);

        // Degrees of freedom (Welch-Satterthwaite equation)
        const df = Math.pow((s1 * s1) / n1 + (s2 * s2) / n2, 2) /
               (Math.pow(s1 * s1 / n1, 2) / (n1 - 1) + Math.pow(s2 * s2 / n2, 2) / (n2 - 1));

        const _criticalT = this.getZScore(alpha / 2); // Approximate for large df
        const pValue = 2 * (1 - this.normalCDF(Math.abs(t))); // Two-tailed p-value

        return {
            tStatistic: t,
            degreesOfFreedom: df,
            pValue,
            isSignificant: pValue < alpha,
            meanDifference: mean2 - mean1,  // Fixed: group2 - group1 for correct sign
            meanDifferencePercent: ((mean2 - mean1) / mean1) * 100
        };
    }

    // Generate recommendations for experimental design
    generateExperimentRecommendations(targetEffectSize = 0.3, alpha = 0.05, power = 0.8) {
        const minSampleSize = this.calculateRequiredSampleSize(targetEffectSize, alpha, power);

        return {
            sampleSize: {
                minimum: minSampleSize,
                recommended: Math.ceil(minSampleSize * 1.2), // 20% buffer
                perCondition: Math.ceil(minSampleSize * 1.2)
            },
            designParameters: {
                alpha,
                power,
                targetEffectSize,
                testType: 'two-tailed',
                assumptions: [
                    'Normal distribution of performance measurements',
                    'Independent samples between languages',
                    'Homogeneity of variance (or Welch correction applied)'
                ]
            },
            qualityControls: {
                warmupRuns: Math.max(3, Math.ceil(minSampleSize * 0.1)),
                measurementRuns: minSampleSize,
                outlierDetection: 'IQR method (1.5 * IQR)',
                environmentControls: [
                    'CPU usage < 20% during measurement',
                    'Memory usage < 80%',
                    'No thermal throttling',
                    'Consistent power state'
                ]
            }
        };
    }
}

export default PowerAnalysis;
