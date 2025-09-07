// Core matrix multiplication algorithms and operations

/// Create matrix filled with zeros
pub fn create_zero_matrix(dimension: usize) -> Vec<Vec<f32>> {
    vec![vec![0.0; dimension]; dimension]
}

/// Perform matrix multiplication C = A × B using naive triple-loop algorithm
pub fn matrix_multiply(a: &[Vec<f32>], b: &[Vec<f32>]) -> Vec<Vec<f32>> {
    let n = a.len();
    if n == 0 || b.len() != n || b[0].len() != n {
        panic!("Invalid matrix dimensions for multiplication");
    }

    let mut c = create_zero_matrix(n);
    naive_triple_loop_multiply(a, b, &mut c);
    c
}

/// Triple-loop matrix multiplication implementation with specific i,j,k order
/// This order is chosen for consistency across language implementations
pub fn naive_triple_loop_multiply(a: &[Vec<f32>], b: &[Vec<f32>], c: &mut [Vec<f32>]) {
    let n = a.len();

    // Use i,j,k order for consistent cross-language behavior
    for (i, c_row) in c.iter_mut().enumerate().take(n) {
        for (j, c_elem) in c_row.iter_mut().enumerate().take(n) {
            for (k, b_row) in b.iter().enumerate().take(n) {
                *c_elem += a[i][k] * b_row[j];
            }
        }
    }
}

/// Create identity matrix for testing
pub fn create_identity_matrix(dimension: usize) -> Vec<Vec<f32>> {
    let mut matrix = create_zero_matrix(dimension);
    for (i, row) in matrix.iter_mut().enumerate() {
        row[i] = 1.0;
    }
    matrix
}

/// Check if two matrices are approximately equal (for testing)
pub fn matrices_approximately_equal(a: &[Vec<f32>], b: &[Vec<f32>], tolerance: f32) -> bool {
    if a.len() != b.len() {
        return false;
    }

    for i in 0..a.len() {
        if a[i].len() != b[i].len() {
            return false;
        }
        for j in 0..a[i].len() {
            if (a[i][j] - b[i][j]).abs() > tolerance {
                return false;
            }
        }
    }

    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_zero_matrix() {
        let matrix = create_zero_matrix(3);

        assert_eq!(matrix.len(), 3);
        for row in &matrix {
            assert_eq!(row.len(), 3);
            for &element in row {
                assert_eq!(element, 0.0);
            }
        }
    }

    #[test]
    fn test_create_identity_matrix() {
        let identity = create_identity_matrix(3);

        for (i, row) in identity.iter().enumerate() {
            for (j, &element) in row.iter().enumerate() {
                if i == j {
                    assert_eq!(element, 1.0, "Diagonal elements should be 1.0");
                } else {
                    assert_eq!(element, 0.0, "Off-diagonal elements should be 0.0");
                }
            }
        }
    }

    #[test]
    fn test_matrix_multiply_identity() {
        // Test A × I = A
        let a = vec![vec![1.0, 2.0], vec![3.0, 4.0]];
        let identity = create_identity_matrix(2);

        let result = matrix_multiply(&a, &identity);

        assert!(
            matrices_approximately_equal(&a, &result, 1e-6),
            "A × I should equal A"
        );
    }

    #[test]
    fn test_matrix_multiply_zero() {
        // Test A × 0 = 0
        let a = vec![vec![1.0, 2.0], vec![3.0, 4.0]];
        let zero = create_zero_matrix(2);

        let result = matrix_multiply(&a, &zero);

        assert!(
            matrices_approximately_equal(&zero, &result, 1e-6),
            "A × 0 should equal 0"
        );
    }

    #[test]
    fn test_matrix_multiply_known_values() {
        // Test with known multiplication result
        let a = vec![vec![1.0, 2.0], vec![3.0, 4.0]];
        let b = vec![vec![2.0, 0.0], vec![1.0, 2.0]];

        let expected = vec![
            vec![4.0, 4.0],  // [1*2 + 2*1, 1*0 + 2*2]
            vec![10.0, 8.0], // [3*2 + 4*1, 3*0 + 4*2]
        ];

        let result = matrix_multiply(&a, &b);

        assert!(
            matrices_approximately_equal(&expected, &result, 1e-6),
            "Matrix multiplication should produce correct result"
        );
    }

    #[test]
    fn test_matrices_approximately_equal() {
        let a = vec![vec![1.0, 2.0], vec![3.0, 4.0]];
        let b = vec![vec![1.0000001, 2.0000001], vec![3.0000001, 4.0000001]];

        assert!(
            matrices_approximately_equal(&a, &b, 1e-5),
            "Matrices with small differences should be approximately equal"
        );

        assert!(
            !matrices_approximately_equal(&a, &b, 1e-8),
            "Matrices should not be equal with very small tolerance"
        );
    }
}
