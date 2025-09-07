// Data structures and constants for matrix multiplication benchmark

/// Parameters structure for matrix multiplication computation
#[repr(C)]
#[derive(Copy, Clone, Debug)]
pub struct MatrixMulParams {
    pub dimension: u32, // Size of square matrices (N x N)
    pub seed: u32,      // Seed for reproducible random matrix generation
}

/// Constants for FNV-1a hash algorithm
pub const FNV_OFFSET_BASIS: u32 = 2166136261;
pub const FNV_PRIME: u32 = 16777619;

/// Linear Congruential Generator constants (Numerical Recipes parameters)
pub const LCG_MULTIPLIER: u32 = 1664525;
pub const LCG_INCREMENT: u32 = 1013904223;

/// Matrix computation constants
pub const FLOAT_RANGE_MIN: f32 = -1.0;
pub const FLOAT_RANGE_MAX: f32 = 1.0;
pub const PRECISION_DIGITS: u32 = 6;
pub const PRECISION_MULTIPLIER: f32 = 1e6;

/// Validation limits to prevent resource exhaustion
pub const MAX_MATRIX_DIMENSION: u32 = 2000; // Max 2000x2000 (16MB per matrix)
pub const MAX_ALLOCATION_SIZE: u32 = 1_073_741_824; // 1GB
