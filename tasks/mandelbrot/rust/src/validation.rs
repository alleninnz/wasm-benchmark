// Parameter validation for Mandelbrot computation

use crate::types::{MandelbrotParams, MAX_IMAGE_DIMENSION, MAX_TOTAL_PIXELS};

/// Validates MandelbrotParams to prevent resource exhaustion and invalid computations
pub fn validate_parameters(params: &MandelbrotParams) -> bool {
    // Check for reasonable image dimensions
    if params.width == 0
        || params.height == 0
        || params.width > MAX_IMAGE_DIMENSION
        || params.height > MAX_IMAGE_DIMENSION
    {
        return false;
    }

    // Check total pixel count
    if let Some(total_pixels) = params.width.checked_mul(params.height) {
        if total_pixels > MAX_TOTAL_PIXELS {
            return false;
        }
    } else {
        return false; // Overflow in pixel calculation
    }

    // Check for finite floating point values
    if !params.center_real.is_finite()
        || !params.center_imag.is_finite()
        || !params.scale_factor.is_finite()
    {
        return false;
    }

    // Check for positive scale factor
    if params.scale_factor <= 0.0 {
        return false;
    }

    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parameter_validation() {
        // Valid parameters
        let valid_params = MandelbrotParams {
            width: 100,
            height: 100,
            max_iter: 1000,
            center_real: 0.0,
            center_imag: 0.0,
            scale_factor: 4.0,
        };
        assert!(validate_parameters(&valid_params));

        // Invalid dimensions
        let invalid_width = MandelbrotParams {
            width: 0,
            ..valid_params
        };
        assert!(!validate_parameters(&invalid_width));

        let invalid_height = MandelbrotParams {
            height: 0,
            ..valid_params
        };
        assert!(!validate_parameters(&invalid_height));

        // Invalid scale factor
        let invalid_scale = MandelbrotParams {
            scale_factor: 0.0,
            ..valid_params
        };
        assert!(!validate_parameters(&invalid_scale));

        // Invalid floating point values
        let invalid_center = MandelbrotParams {
            center_real: f64::NAN,
            ..valid_params
        };
        assert!(!validate_parameters(&invalid_center));
    }
}
