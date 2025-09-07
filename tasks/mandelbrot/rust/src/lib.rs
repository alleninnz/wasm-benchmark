use std::alloc::{alloc as sys_alloc, Layout};
use std::os::raw::c_void;

pub mod hash;
pub mod mandelbrot;
pub mod reference;
pub mod types;
pub mod validation;

use hash::fnv1a_hash_u32;
use mandelbrot::mandelbrot_pixel;
use types::{MandelbrotParams, MAX_ALLOCATION_SIZE, MAX_TOTAL_PIXELS};
use validation::validate_parameters;

// WebAssembly C-style interface exports

#[no_mangle]
pub extern "C" fn init(seed: u32) {
    // Initialize WebAssembly module - no-op for this implementation
    let _ = seed;
}

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

#[no_mangle]
pub extern "C" fn run_task(params_ptr: *mut c_void) -> u32 {
    if params_ptr.is_null() {
        return 0;
    }

    let params = unsafe { &*(params_ptr as *const MandelbrotParams) };

    if !validate_parameters(params) {
        return 0;
    }

    let total_pixels = match params.width.checked_mul(params.height) {
        Some(count) if count <= MAX_TOTAL_PIXELS => count,
        _ => return 0,
    };

    let mut iteration_counts = Vec::with_capacity(total_pixels as usize);

    for y in 0..params.height {
        for x in 0..params.width {
            // Map pixel to complex plane
            let x_norm = (x as f64) / (params.width as f64) - 0.5;
            let y_norm = (y as f64) / (params.height as f64) - 0.5;

            let c_real = params.center_real + x_norm * params.scale_factor;
            let c_imag = params.center_imag + y_norm * params.scale_factor;

            let iterations = mandelbrot_pixel(c_real, c_imag, params.max_iter);
            iteration_counts.push(iterations);
        }
    }

    fnv1a_hash_u32(&iteration_counts)
}

#[cfg(test)]
mod tests {
    use super::*;
    use types::MandelbrotParams;

    #[test]
    #[ignore]
    fn generate_reference_hashes() {
        use crate::reference::*;

        println!("Generating reference test vectors...");
        let vectors = generate_all_vectors();

        // Export to JSON file
        export_vectors_to_json(&vectors, "reference_hashes.json")
            .expect("Failed to export reference hashes");

        println!("Reference hash generation complete!");

        // Verify we have vectors from all categories
        let systematic_count = vectors
            .iter()
            .filter(|v| v.category == "systematic")
            .count();
        let critical_count = vectors.iter().filter(|v| v.category == "critical").count();
        let precision_count = vectors.iter().filter(|v| v.category == "precision").count();
        let edge_count = vectors.iter().filter(|v| v.category == "edge_case").count();

        println!("Generated vectors by category:");
        println!("  Systematic: {}", systematic_count);
        println!("  Critical: {}", critical_count);
        println!("  Precision: {}", precision_count);
        println!("  Edge cases: {}", edge_count);

        assert!(systematic_count > 0, "Should have systematic test vectors");
        assert!(critical_count > 0, "Should have critical test vectors");
        assert!(precision_count > 0, "Should have precision test vectors");
        assert!(edge_count > 0, "Should have edge case test vectors");
    }

    #[test]
    fn test_reference_generation_consistency() {
        // Test that reference generation is deterministic
        let params = MandelbrotParams {
            width: 10,
            height: 10,
            max_iter: 100,
            center_real: 0.0,
            center_imag: 0.0,
            scale_factor: 4.0,
        };

        // Create layout and allocate memory
        let layout = std::alloc::Layout::from_size_align(
            std::mem::size_of::<MandelbrotParams>(),
            std::mem::align_of::<MandelbrotParams>(),
        )
        .expect("Invalid layout");

        let params_ptr1 = unsafe { std::alloc::alloc(layout) as *mut MandelbrotParams };
        let params_ptr2 = unsafe { std::alloc::alloc(layout) as *mut MandelbrotParams };

        assert!(!params_ptr1.is_null(), "Memory allocation failed");
        assert!(!params_ptr2.is_null(), "Memory allocation failed");

        unsafe {
            // Write parameters and compute hashes
            std::ptr::write(params_ptr1, params);
            std::ptr::write(params_ptr2, params);

            let hash1 = run_task(params_ptr1 as *mut std::os::raw::c_void);
            let hash2 = run_task(params_ptr2 as *mut std::os::raw::c_void);

            // Clean up
            std::alloc::dealloc(params_ptr1 as *mut u8, layout);
            std::alloc::dealloc(params_ptr2 as *mut u8, layout);

            assert_eq!(
                hash1, hash2,
                "Reference hash generation should be deterministic"
            );
        }
    }

    #[test]
    fn test_memory_allocation() {
        let ptr = alloc(100);
        assert!(!ptr.is_null(), "Allocation should succeed");

        let null_ptr = alloc(0);
        assert!(
            null_ptr.is_null(),
            "Zero-byte allocation should return null"
        );
    }
}
