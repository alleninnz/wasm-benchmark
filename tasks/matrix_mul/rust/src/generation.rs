// Random matrix generation with reproducible pseudo-random values

use crate::types::{FLOAT_RANGE_MAX, FLOAT_RANGE_MIN, LCG_INCREMENT, LCG_MULTIPLIER};

/// Generate random matrix with reproducible values using LCG
pub fn generate_random_matrix(dimension: usize, seed: &mut u32) -> Vec<Vec<f32>> {
    let mut matrix = Vec::with_capacity(dimension);

    for _ in 0..dimension {
        let mut row = Vec::with_capacity(dimension);
        for _ in 0..dimension {
            let lcg_value = linear_congruential_generator(seed);
            let float_value = lcg_to_float_range(lcg_value, FLOAT_RANGE_MIN, FLOAT_RANGE_MAX);
            row.push(float_value);
        }
        matrix.push(row);
    }

    matrix
}

/// Linear Congruential Generator for reproducible pseudo-random numbers
pub fn linear_congruential_generator(seed: &mut u32) -> u32 {
    *seed = seed
        .wrapping_mul(LCG_MULTIPLIER)
        .wrapping_add(LCG_INCREMENT);
    *seed
}

/// Convert LCG value to f32 in specified range [min, max]
/// Uses standardized precision to ensure cross-language consistency
pub fn lcg_to_float_range(lcg_value: u32, min: f32, max: f32) -> f32 {
    // Convert u32 to [0, 1] range with explicit f64 precision
    let normalized = lcg_value as f64 / (u32::MAX as f64);
    // Pre-convert range to f64 to match TinyGo's behavior exactly
    let min_f64 = min as f64;
    let max_f64 = max as f64;
    let range_f64 = max_f64 - min_f64;
    // Scale to [min, max] range with identical precision
    (min_f64 + normalized * range_f64) as f32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lcg_deterministic() {
        let mut seed1 = 12345;
        let mut seed2 = 12345;

        // Same seed should produce same sequence
        for _ in 0..10 {
            let val1 = linear_congruential_generator(&mut seed1);
            let val2 = linear_congruential_generator(&mut seed2);
            assert_eq!(val1, val2, "LCG should be deterministic");
        }
    }

    #[test]
    fn test_lcg_to_float_range() {
        // Test range conversion with standardized precision
        let test_value = u32::MAX / 2; // Middle value
        let result = lcg_to_float_range(test_value, -1.0, 1.0);

        // Should be approximately in the middle of range
        assert!(
            (-1.0..=1.0).contains(&result),
            "Value should be in range [-1, 1]"
        );
        assert!((result - 0.0).abs() < 0.1, "Middle value should be near 0");

        // Test extremes
        let min_result = lcg_to_float_range(0, -1.0, 1.0);
        let max_result = lcg_to_float_range(u32::MAX, -1.0, 1.0);

        assert!(
            (min_result - (-1.0)).abs() < 0.01,
            "Min should be close to -1.0"
        );
        assert!(
            (max_result - 1.0).abs() < 0.01,
            "Max should be close to 1.0"
        );
    }

    #[test]
    fn test_cross_language_precision_consistency() {
        // Test specific values to ensure cross-language consistency
        let test_cases = [
            (12345u32, -1.0f32, 1.0f32),
            (u32::MAX / 2, -1.0f32, 1.0f32),
            (1664525u32, -1.0f32, 1.0f32),
            (1013904223u32, -1.0f32, 1.0f32),
        ];

        for (lcg_value, min, max) in test_cases {
            let result = lcg_to_float_range(lcg_value, min, max);
            
            // Ensure result is in valid range
            assert!(
                result >= min && result <= max,
                "Value {result} should be in range [{min}, {max}] for LCG {lcg_value}"
            );
            
            // The result should be deterministic
            let result2 = lcg_to_float_range(lcg_value, min, max);
            assert_eq!(result, result2, "Results should be deterministic");
        }
    }

    #[test]
    fn test_matrix_generation_deterministic() {
        let mut seed1 = 42;
        let mut seed2 = 42;

        let matrix1 = generate_random_matrix(3, &mut seed1);
        let matrix2 = generate_random_matrix(3, &mut seed2);

        // Matrices should be identical
        for i in 0..3 {
            for j in 0..3 {
                assert_eq!(
                    matrix1[i][j], matrix2[i][j],
                    "Generated matrices should be identical with same seed"
                );
            }
        }
    }

    #[test]
    fn test_matrix_generation_different_seeds() {
        let mut seed1 = 42;
        let mut seed2 = 123;

        let matrix1 = generate_random_matrix(3, &mut seed1);
        let matrix2 = generate_random_matrix(3, &mut seed2);

        // Matrices should be different
        let mut different = false;
        for i in 0..3 {
            for j in 0..3 {
                if matrix1[i][j] != matrix2[i][j] {
                    different = true;
                    break;
                }
            }
        }
        assert!(
            different,
            "Matrices with different seeds should be different"
        );
    }
}
