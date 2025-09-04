// Core Mandelbrot set computation algorithms

use crate::types::DIVERGENCE_THRESHOLD;

/// Computes the number of iterations for a single Mandelbrot set pixel
pub fn mandelbrot_pixel(c_real: f64, c_imag: f64, max_iter: u32) -> u32 {
    let mut z_real = 0.0;
    let mut z_imag = 0.0;
    let mut iterations = 0;
    
    while iterations < max_iter {
        if complex_magnitude_squared(z_real, z_imag) > DIVERGENCE_THRESHOLD {
            break;
        }
        
        // Calculate z² + c
        let z_real_new = z_real * z_real - z_imag * z_imag + c_real;
        let z_imag_new = 2.0 * z_real * z_imag + c_imag;
        
        z_real = z_real_new;
        z_imag = z_imag_new;
        iterations += 1;
    }
    
    iterations
}

/// Computes the squared magnitude of a complex number
pub fn complex_magnitude_squared(real: f64, imag: f64) -> f64 {
    real * real + imag * imag
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mandelbrot_known_points() {
        // Point (0,0) should be in the Mandelbrot set
        let iterations_origin = mandelbrot_pixel(0.0, 0.0, 1000);
        assert_eq!(iterations_origin, 1000, "Origin should reach max iterations");
        
        // Point (2,2) should diverge quickly
        let iterations_outside = mandelbrot_pixel(2.0, 2.0, 1000);
        assert!(iterations_outside < 10, "Point (2,2) should diverge quickly, got {} iterations", iterations_outside);
        
        // Point (-0.75, 0) should be in the set
        let iterations_boundary = mandelbrot_pixel(-0.75, 0.0, 1000);
        assert!(iterations_boundary > 100, "Point (-0.75, 0) should have high iteration count");
    }

    #[test]
    fn test_complex_magnitude() {
        assert_eq!(complex_magnitude_squared(3.0, 4.0), 25.0);
        assert_eq!(complex_magnitude_squared(0.0, 0.0), 0.0);
        assert_eq!(complex_magnitude_squared(1.0, 1.0), 2.0);
    }
}