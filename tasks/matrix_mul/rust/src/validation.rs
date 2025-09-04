// Parameter validation for matrix multiplication

use crate::types::{MatrixMulParams, MAX_MATRIX_DIMENSION};

/// Validates MatrixMulParams to prevent resource exhaustion and invalid computations
pub fn validate_parameters(params: &MatrixMulParams) -> bool {
    // Check for reasonable matrix dimensions
    if params.dimension == 0 {
        return false; // Zero dimension is invalid
    }
    
    if params.dimension > MAX_MATRIX_DIMENSION {
        return false; // Too large, would cause memory exhaustion
    }
    
    // Check for potential overflow in memory calculations
    // Each matrix needs dimension² × 4 bytes (f32), need 3 matrices total
    if let Some(elements) = params.dimension.checked_mul(params.dimension) {
        if let Some(bytes_per_matrix) = elements.checked_mul(4) {
            if let Some(total_bytes) = bytes_per_matrix.checked_mul(3) {
                // Reasonable memory limit: 256MB total for all matrices
                if total_bytes > 256 * 1024 * 1024 {
                    return false;
                }
            } else {
                return false; // Overflow in total calculation
            }
        } else {
            return false; // Overflow in bytes calculation
        }
    } else {
        return false; // Overflow in elements calculation
    }
    
    // Seed can be any u32 value (including 0)
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_parameters() {
        // Test valid small matrix
        let params = MatrixMulParams {
            dimension: 10,
            seed: 12345,
        };
        assert!(validate_parameters(&params), "Valid small parameters should pass");
        
        // Test valid medium matrix
        let params = MatrixMulParams {
            dimension: 100,
            seed: 0, // Seed 0 should be valid
        };
        assert!(validate_parameters(&params), "Valid medium parameters should pass");
        
        // Test valid large matrix (but within limits)
        let params = MatrixMulParams {
            dimension: 1000,
            seed: u32::MAX, // Max seed should be valid
        };
        assert!(validate_parameters(&params), "Valid large parameters should pass");
    }

    #[test]
    fn test_invalid_dimensions() {
        // Test zero dimension
        let params = MatrixMulParams {
            dimension: 0,
            seed: 12345,
        };
        assert!(!validate_parameters(&params), "Zero dimension should be invalid");
        
        // Test dimension too large
        let params = MatrixMulParams {
            dimension: MAX_MATRIX_DIMENSION + 1,
            seed: 12345,
        };
        assert!(!validate_parameters(&params), "Too large dimension should be invalid");
        
        // Test dimension that would cause memory overflow
        let params = MatrixMulParams {
            dimension: u32::MAX, // Would overflow in calculations
            seed: 12345,
        };
        assert!(!validate_parameters(&params), "Overflow-causing dimension should be invalid");
    }

    #[test]
    fn test_memory_limits() {
        // Test dimension that would exceed memory limit
        // 2000x2000 matrices use ~48MB total, should be OK
        let params = MatrixMulParams {
            dimension: 2000,
            seed: 12345,
        };
        assert!(validate_parameters(&params), "2000x2000 should be within limits");
        
        // Larger dimensions should be rejected
        let params = MatrixMulParams {
            dimension: 3000, // 3000x3000 would use ~108MB per matrix, 324MB total
            seed: 12345,
        };
        assert!(!validate_parameters(&params), "3000x3000 should exceed memory limits");
    }

    #[test]
    fn test_edge_case_dimensions() {
        // Test dimension 1 (should be valid)
        let params = MatrixMulParams {
            dimension: 1,
            seed: 12345,
        };
        assert!(validate_parameters(&params), "1x1 matrix should be valid");
        
        // Test exactly at limit
        let params = MatrixMulParams {
            dimension: MAX_MATRIX_DIMENSION,
            seed: 12345,
        };
        assert!(validate_parameters(&params), "Exactly at max dimension should be valid");
    }
}