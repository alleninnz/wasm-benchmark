use std::alloc::{alloc as sys_alloc, Layout};
use std::os::raw::c_void;

pub mod generation;
pub mod hash;
pub mod matrix;
pub mod reference;
pub mod types;
pub mod validation;

use generation::generate_random_matrix;
use hash::fnv1a_hash_matrix;
use matrix::naive_triple_loop_multiply;
use types::{MatrixMulParams, MAX_ALLOCATION_SIZE};
use validation::validate_parameters;

// WebAssembly exports for benchmark harness integration

#[no_mangle]
pub extern "C" fn init(seed: u32) {
    // Initialize WebAssembly module - no-op for this implementation
    let _ = seed;
}

/// Allocate memory for WebAssembly linear memory management
#[no_mangle]
pub extern "C" fn alloc(n_bytes: u32) -> *mut c_void {
    if n_bytes == 0 {
        return std::ptr::null_mut();
    }

    if n_bytes > MAX_ALLOCATION_SIZE {
        return std::ptr::null_mut();
    }

    let layout = match Layout::from_size_align(n_bytes as usize, std::mem::align_of::<u64>()) {
        Ok(layout) => layout,
        Err(_) => return std::ptr::null_mut(),
    };

    let ptr = unsafe { sys_alloc(layout) };

    if ptr.is_null() {
        std::ptr::null_mut()
    } else {
        ptr as *mut c_void
    }
}

/// Execute matrix multiplication benchmark task
#[no_mangle]
pub extern "C" fn run_task(params_ptr: *mut c_void) -> u32 {
    if params_ptr.is_null() {
        return 0;
    }

    let params = unsafe { &*(params_ptr as *const MatrixMulParams) };

    if !validate_parameters(params) {
        return 0;
    }

    // Generate matrices A and B using reproducible random generation
    let mut seed = params.seed;
    let matrix_a = generate_random_matrix(params.dimension as usize, &mut seed);
    let matrix_b = generate_random_matrix(params.dimension as usize, &mut seed);

    // Initialize result matrix C
    let n = params.dimension as usize;
    let mut matrix_c = vec![vec![0.0f32; n]; n];

    // Execute matrix multiplication: C = A × B
    naive_triple_loop_multiply(&matrix_a, &matrix_b, &mut matrix_c);

    // Return FNV-1a hash of result matrix for verification
    fnv1a_hash_matrix(&matrix_c)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_small_matrix_multiplication() {
        // Test 2x2 matrix multiplication with known values
        let a = vec![vec![1.0, 2.0], vec![3.0, 4.0]];
        let b = vec![vec![5.0, 6.0], vec![7.0, 8.0]];
        let mut c = vec![vec![0.0; 2]; 2];

        naive_triple_loop_multiply(&a, &b, &mut c);

        // Expected result: [[19, 22], [43, 50]]
        assert_eq!(c[0][0], 19.0);
        assert_eq!(c[0][1], 22.0);
        assert_eq!(c[1][0], 43.0);
        assert_eq!(c[1][1], 50.0);
    }

    #[test]
    fn test_identity_matrix() {
        // Test multiplication with 3x3 identity matrix
        let a = vec![
            vec![2.0, 3.0, 4.0],
            vec![5.0, 6.0, 7.0],
            vec![8.0, 9.0, 1.0],
        ];
        let identity = vec![
            vec![1.0, 0.0, 0.0],
            vec![0.0, 1.0, 0.0],
            vec![0.0, 0.0, 1.0],
        ];
        let mut c = vec![vec![0.0; 3]; 3];

        naive_triple_loop_multiply(&a, &identity, &mut c);

        // Result should equal matrix A
        for i in 0..3 {
            for j in 0..3 {
                assert_eq!(c[i][j], a[i][j]);
            }
        }
    }

    #[test]
    fn test_zero_matrix() {
        // Test multiplication with zero matrix
        let a = vec![vec![1.0, 2.0], vec![3.0, 4.0]];
        let zero = vec![vec![0.0, 0.0], vec![0.0, 0.0]];
        let mut c = vec![vec![0.0; 2]; 2];

        naive_triple_loop_multiply(&a, &zero, &mut c);

        // Result should be zero matrix
        for row in c.iter().take(2) {
            for &element in row.iter().take(2) {
                assert_eq!(element, 0.0);
            }
        }
    }

    #[test]
    fn test_hash_consistency() {
        // Verify hash calculation produces consistent results
        let matrix = vec![vec![1.5, 2.75], vec![3.125, 4.0625]];

        let hash1 = fnv1a_hash_matrix(&matrix);
        let hash2 = fnv1a_hash_matrix(&matrix);

        assert_eq!(hash1, hash2);
        assert_ne!(hash1, 0); // Should not be zero for non-zero matrix
    }

    #[test]
    fn test_parameter_validation() {
        let valid_params = MatrixMulParams {
            dimension: 16,
            seed: 12345,
        };
        let invalid_zero = MatrixMulParams {
            dimension: 0,
            seed: 12345,
        };
        let invalid_large = MatrixMulParams {
            dimension: 2001,
            seed: 12345,
        };

        assert!(validate_parameters(&valid_params));
        assert!(!validate_parameters(&invalid_zero));
        assert!(!validate_parameters(&invalid_large));
    }

    #[test]
    fn test_deterministic_generation() {
        // Same seed should produce same matrices
        let n = 4;
        let seed = 42;

        let mut seed1 = seed;
        let mut seed2 = seed;
        let matrix1 = generate_random_matrix(n, &mut seed1);
        let matrix2 = generate_random_matrix(n, &mut seed2);

        for i in 0..n {
            for j in 0..n {
                assert_eq!(matrix1[i][j], matrix2[i][j]);
            }
        }
    }

    #[test]
    fn test_webassembly_interface() {
        // Test WebAssembly interface compatibility
        let params = MatrixMulParams {
            dimension: 4,
            seed: 12345,
        };
        let params_ptr = &params as *const MatrixMulParams as *mut c_void;

        let hash_result = run_task(params_ptr);

        assert_ne!(hash_result, 0); // Should return valid hash

        // Same parameters should produce same hash
        let hash_result2 = run_task(params_ptr);
        assert_eq!(hash_result, hash_result2);
    }

    #[test]
    fn generate_reference_vectors_output() {
        use reference::generate_test_vectors;
        let vectors = generate_test_vectors();

        #[cfg(test)]
        {
            let json = serde_json::to_string_pretty(&vectors).unwrap();
            println!(
                "
=== REFERENCE HASH VECTORS ==="
            );
            println!("{}", json);
            println!(
                "=== END REFERENCE VECTORS ===
"
            );
        }

        // Basic validation
        assert!(vectors.len() >= 10);
        assert!(vectors.iter().all(|v| v.expected_hash != 0));
    }
}
