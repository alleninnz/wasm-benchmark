// Reference hash generation for cross-implementation validation

use crate::types::MatrixMulParams;
use crate::{
    fnv1a_hash_matrix, generate_random_matrix, naive_triple_loop_multiply, validate_parameters,
};
use serde::Serialize;

#[derive(Serialize, Debug)]
pub struct TestVector {
    pub name: String,
    pub description: String,
    pub params: SerializableParams,
    pub expected_hash: u32,
    pub category: String,
}

#[derive(Serialize, Debug)]
pub struct SerializableParams {
    pub dimension: u32,
    pub seed: u32,
}

impl From<MatrixMulParams> for SerializableParams {
    fn from(params: MatrixMulParams) -> Self {
        SerializableParams {
            dimension: params.dimension,
            seed: params.seed,
        }
    }
}

/// Generate comprehensive test vectors for cross-implementation validation
pub fn generate_test_vectors() -> Vec<TestVector> {
    let mut vectors = Vec::new();

    // Small matrices for detailed verification
    vectors.extend(generate_small_matrix_tests());

    // Medium matrices for performance validation
    vectors.extend(generate_medium_matrix_tests());

    // Edge cases and boundary conditions
    vectors.extend(generate_edge_case_tests());

    // Random seed variation tests
    vectors.extend(generate_seed_variation_tests());

    vectors
}

fn generate_small_matrix_tests() -> Vec<TestVector> {
    let test_cases = vec![
        (2, 12345, "small_2x2", "Basic 2x2 matrix multiplication"),
        (3, 54321, "small_3x3", "Basic 3x3 matrix multiplication"),
        (4, 98765, "small_4x4", "Basic 4x4 matrix multiplication"),
        (
            8,
            11111,
            "small_8x8",
            "Small 8x8 matrix for algorithm verification",
        ),
    ];

    test_cases
        .into_iter()
        .map(|(dim, seed, name, desc)| {
            let params = MatrixMulParams {
                dimension: dim,
                seed,
            };
            let hash = compute_reference_hash(params);

            TestVector {
                name: name.to_string(),
                description: desc.to_string(),
                params: params.into(),
                expected_hash: hash,
                category: "small_matrices".to_string(),
            }
        })
        .collect()
}

fn generate_medium_matrix_tests() -> Vec<TestVector> {
    let test_cases = vec![
        (
            16,
            12345,
            "medium_16x16",
            "Medium 16x16 matrix for performance baseline",
        ),
        (
            32,
            67890,
            "medium_32x32",
            "Medium 32x32 matrix multiplication",
        ),
        (
            64,
            24680,
            "medium_64x64",
            "Medium 64x64 matrix for computational load",
        ),
        (
            128,
            13579,
            "medium_128x128",
            "Large computation 128x128 matrix",
        ),
    ];

    test_cases
        .into_iter()
        .map(|(dim, seed, name, desc)| {
            let params = MatrixMulParams {
                dimension: dim,
                seed,
            };
            let hash = compute_reference_hash(params);

            TestVector {
                name: name.to_string(),
                description: desc.to_string(),
                params: params.into(),
                expected_hash: hash,
                category: "medium_matrices".to_string(),
            }
        })
        .collect()
}

fn generate_edge_case_tests() -> Vec<TestVector> {
    let test_cases = vec![
        (1, 0, "edge_1x1_seed_0", "Minimal 1x1 matrix with zero seed"),
        (1, 12345, "edge_1x1", "Minimal 1x1 matrix multiplication"),
        (2, 0, "edge_2x2_seed_0", "Small matrix with zero seed"),
        (
            16,
            u32::MAX,
            "edge_max_seed",
            "Matrix with maximum seed value",
        ),
    ];

    test_cases
        .into_iter()
        .map(|(dim, seed, name, desc)| {
            let params = MatrixMulParams {
                dimension: dim,
                seed,
            };
            let hash = compute_reference_hash(params);

            TestVector {
                name: name.to_string(),
                description: desc.to_string(),
                params: params.into(),
                expected_hash: hash,
                category: "edge_cases".to_string(),
            }
        })
        .collect()
}

fn generate_seed_variation_tests() -> Vec<TestVector> {
    let seeds = vec![1, 42, 1337, 999999, 2147483647];
    let dimension = 16; // Fixed dimension, varying seeds

    seeds
        .into_iter()
        .enumerate()
        .map(|(i, seed)| {
            let params = MatrixMulParams { dimension, seed };
            let hash = compute_reference_hash(params);

            TestVector {
                name: format!("seed_var_{}", i + 1),
                description: format!("16x16 matrix with seed {}", seed),
                params: params.into(),
                expected_hash: hash,
                category: "seed_variations".to_string(),
            }
        })
        .collect()
}

fn compute_reference_hash(params: MatrixMulParams) -> u32 {
    if !validate_parameters(&params) {
        return 0; // Invalid parameters
    }

    // Generate two random matrices A and B
    let mut seed = params.seed;
    let matrix_a = generate_random_matrix(params.dimension as usize, &mut seed);
    let matrix_b = generate_random_matrix(params.dimension as usize, &mut seed);

    // Initialize result matrix C with zeros
    let n = params.dimension as usize;
    let mut matrix_c = vec![vec![0.0f32; n]; n];

    // Perform matrix multiplication: C = A * B
    naive_triple_loop_multiply(&matrix_a, &matrix_b, &mut matrix_c);

    // Compute and return FNV-1a hash of result matrix
    fnv1a_hash_matrix(&matrix_c)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_test_vectors() {
        let vectors = generate_test_vectors();

        // Should have reasonable number of test vectors
        assert!(
            vectors.len() >= 10,
            "Should generate at least 10 test vectors"
        );

        // All vectors should have valid hashes
        for vector in &vectors {
            assert_ne!(
                vector.expected_hash, 0,
                "Hash should not be zero for valid params: {}",
                vector.name
            );
        }

        // Should have different categories
        let categories: std::collections::HashSet<_> =
            vectors.iter().map(|v| &v.category).collect();
        assert!(
            categories.len() >= 3,
            "Should have multiple test categories"
        );
    }

    #[test]
    fn test_compute_reference_hash_deterministic() {
        let params = MatrixMulParams {
            dimension: 4,
            seed: 12345,
        };

        let hash1 = compute_reference_hash(params);
        let hash2 = compute_reference_hash(params);

        assert_eq!(hash1, hash2, "Reference hash should be deterministic");
        assert_ne!(hash1, 0, "Reference hash should not be zero");
    }

    #[test]
    fn test_invalid_params_zero_hash() {
        let invalid_params = MatrixMulParams {
            dimension: 0,
            seed: 12345,
        };
        let hash = compute_reference_hash(invalid_params);

        assert_eq!(hash, 0, "Invalid parameters should produce zero hash");
    }

    #[test]
    fn test_serializable_params_conversion() {
        let params = MatrixMulParams {
            dimension: 16,
            seed: 42,
        };
        let serializable: SerializableParams = params.into();

        assert_eq!(serializable.dimension, 16);
        assert_eq!(serializable.seed, 42);
    }
}
