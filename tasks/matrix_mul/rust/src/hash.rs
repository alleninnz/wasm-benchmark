// FNV-1a hashing implementation for matrix verification

use crate::types::{FNV_OFFSET_BASIS, FNV_PRIME, PRECISION_DIGITS};

/// Compute FNV-1a hash of matrix elements for cross-implementation verification
pub fn fnv1a_hash_matrix(matrix: &Vec<Vec<f32>>) -> u32 {
    let mut hash = FNV_OFFSET_BASIS;

    // Process elements in row-major order for consistency
    for row in matrix {
        for &value in row {
            // Round f32 to specified precision and convert to i32
            let rounded_value = round_f32_to_precision(value, PRECISION_DIGITS);

            // Hash the i32 as little-endian bytes
            let bytes = rounded_value.to_le_bytes();
            for byte in &bytes {
                hash ^= *byte as u32;
                hash = hash.wrapping_mul(FNV_PRIME);
            }
        }
    }

    hash
}

/// Round f32 to specified decimal places and convert to i32
pub fn round_f32_to_precision(value: f32, precision_digits: u32) -> i32 {
    let multiplier = 10.0_f64.powi(precision_digits as i32);
    ((value as f64) * multiplier).round() as i32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_round_f32_to_precision() {
        // Test basic rounding
        assert_eq!(round_f32_to_precision(1.234567, 6), 1234567);
        assert_eq!(round_f32_to_precision(-1.234567, 6), -1234567);
        assert_eq!(round_f32_to_precision(0.0, 6), 0);

        // Test rounding with different precisions
        assert_eq!(round_f32_to_precision(1.234_567_9, 4), 12346); // Rounds up
        assert_eq!(round_f32_to_precision(1.234_543_2, 4), 12345); // Rounds down

        // Test edge cases
        assert_eq!(round_f32_to_precision(1.0000005, 6), 1000001); // Rounds up
        assert_eq!(round_f32_to_precision(1.0000004, 6), 1000000); // Rounds down
    }

    #[test]
    fn test_fnv1a_hash_matrix_consistency() {
        let matrix1 = vec![vec![1.0, 2.0], vec![3.0, 4.0]];

        let matrix2 = vec![vec![1.0, 2.0], vec![3.0, 4.0]];

        let hash1 = fnv1a_hash_matrix(&matrix1);
        let hash2 = fnv1a_hash_matrix(&matrix2);

        assert_eq!(hash1, hash2, "Same matrices should produce same hash");
    }

    #[test]
    fn test_fnv1a_hash_matrix_different() {
        let matrix1 = vec![vec![1.0, 2.0], vec![3.0, 4.0]];

        let matrix2 = vec![
            vec![1.0, 2.0],
            vec![3.0, 4.1], // Small difference
        ];

        let hash1 = fnv1a_hash_matrix(&matrix1);
        let hash2 = fnv1a_hash_matrix(&matrix2);

        assert_ne!(
            hash1, hash2,
            "Different matrices should produce different hashes"
        );
    }

    #[test]
    fn test_fnv1a_hash_empty_matrix() {
        let empty_matrix: Vec<Vec<f32>> = vec![];
        let hash = fnv1a_hash_matrix(&empty_matrix);

        // Empty matrix should produce the FNV offset basis
        assert_eq!(
            hash, FNV_OFFSET_BASIS,
            "Empty matrix should hash to offset basis"
        );
    }

    #[test]
    fn test_fnv1a_hash_precision_rounding() {
        // Test that values rounding to the same precision produce same hash
        let matrix1 = vec![vec![1.2345674]]; // Test rounding precision
        let rounded1 = round_f32_to_precision(1.2345674, PRECISION_DIGITS);
        let rounded2 = round_f32_to_precision(1.2345676, PRECISION_DIGITS);

        // If they round to the same value, hashes should be equal
        if rounded1 == rounded2 {
            let matrix2 = vec![vec![1.2345676]];
            let hash1 = fnv1a_hash_matrix(&matrix1);
            let hash2 = fnv1a_hash_matrix(&matrix2);
            assert_eq!(
                hash1, hash2,
                "Values that round to same precision should hash equally"
            );
        }

        // Test that clearly different values produce different hashes
        let matrix3 = vec![vec![1.0]];
        let matrix4 = vec![vec![2.0]];
        let hash3 = fnv1a_hash_matrix(&matrix3);
        let hash4 = fnv1a_hash_matrix(&matrix4);

        assert_ne!(
            hash3, hash4,
            "Clearly different values should hash differently"
        );
    }

    #[test]
    fn test_hash_order_sensitivity() {
        // Test that element order matters for hash
        let matrix1 = vec![vec![1.0, 2.0], vec![3.0, 4.0]];

        let matrix2 = vec![vec![1.0, 3.0], vec![2.0, 4.0]];

        let hash1 = fnv1a_hash_matrix(&matrix1);
        let hash2 = fnv1a_hash_matrix(&matrix2);

        assert_ne!(
            hash1, hash2,
            "Different element orders should produce different hashes"
        );
    }
}
