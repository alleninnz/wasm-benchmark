// Data structures and constants for Mandelbrot set computation

/// Parameters structure for Mandelbrot set computation
#[repr(C)]
#[derive(Copy, Clone, Debug)]
pub struct MandelbrotParams {
    pub width: u32,
    pub height: u32,
    pub max_iter: u32,
    pub center_real: f64,
    pub center_imag: f64,
    pub scale_factor: f64,
}

/// Constants for FNV-1a hash algorithm
pub const FNV_OFFSET_BASIS: u32 = 2166136261;
pub const FNV_PRIME: u32 = 16777619;

/// Validation limits to prevent resource exhaustion
pub const MAX_IMAGE_DIMENSION: u32 = 10_000;
pub const MAX_TOTAL_PIXELS: u32 = 100_000_000;
pub const MAX_ALLOCATION_SIZE: u32 = 1_073_741_824; // 1GB

/// Mathematical constants for Mandelbrot computation
pub const DIVERGENCE_THRESHOLD: f64 = 4.0;
