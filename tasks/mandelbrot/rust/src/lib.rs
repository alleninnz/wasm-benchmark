use std::os::raw::c_void;
use std::alloc::{alloc as sys_alloc, Layout};

pub mod reference;

// Parameters structure for parsing from memory pointer
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

// WebAssembly C-style interface exports
#[no_mangle]
pub extern "C" fn init(seed: u32) {
    // Initialize random number generator with seed
    // Currently unused but available for future extensions
    let _ = seed;
}

#[no_mangle]
pub extern "C" fn alloc(n_bytes: u32) -> *mut c_void {
    if n_bytes == 0 {
        return std::ptr::null_mut();
    }
    
    let layout = Layout::from_size_align(n_bytes as usize, std::mem::align_of::<u64>())
        .expect("Invalid layout for memory allocation");
    
    let ptr = unsafe { sys_alloc(layout) };
    
    if ptr.is_null() {
        panic!("Failed to allocate {} bytes", n_bytes);
    }
    
    ptr as *mut c_void
}

#[no_mangle]
pub extern "C" fn run_task(params_ptr: *mut c_void) -> u32 {
    if params_ptr.is_null() {
        return 0;
    }
    
    let params = unsafe { &*(params_ptr as *const MandelbrotParams) };
    
    // Calculate Mandelbrot set for each pixel
    let mut iteration_counts = Vec::with_capacity((params.width * params.height) as usize);
    
    for y in 0..params.height {
        for x in 0..params.width {
            // Map pixel to complex plane
            let x_norm = (x as f64) / (params.width as f64) - 0.5;
            let y_norm = (y as f64) / (params.height as f64) - 0.5;
            
            let c_real = params.center_real + x_norm * params.scale_factor;
            let c_imag = params.center_imag + y_norm * params.scale_factor;
            
            // Calculate iterations for this pixel
            let iterations = mandelbrot_pixel(c_real, c_imag, params.max_iter);
            iteration_counts.push(iterations);
        }
    }
    
    // Compute FNV-1a hash of results for verification
    fnv1a_hash_u32(&iteration_counts)
}

// Private helper functions

fn mandelbrot_pixel(c_real: f64, c_imag: f64, max_iter: u32) -> u32 {
    let mut z_real = 0.0;
    let mut z_imag = 0.0;
    let mut iterations = 0;
    
    while iterations < max_iter {
        // Check if |z|² > 4 (equivalent to |z| > 2)
        if complex_magnitude_squared(z_real, z_imag) > 4.0 {
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

fn complex_magnitude_squared(real: f64, imag: f64) -> f64 {
    real * real + imag * imag
}

fn fnv1a_hash_u32(data: &[u32]) -> u32 {
    const FNV_OFFSET_BASIS: u32 = 2166136261;
    const FNV_PRIME: u32 = 16777619;
    
    let mut hash = FNV_OFFSET_BASIS;
    
    for &value in data {
        // Convert u32 to bytes (little-endian)
        let bytes = value.to_le_bytes();
        
        for byte in &bytes {
            hash ^= *byte as u32;
            hash = hash.wrapping_mul(FNV_PRIME);
        }
    }
    
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

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
        let systematic_count = vectors.iter().filter(|v| v.category == "systematic").count();
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
        use crate::reference::*;
        
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
            std::mem::align_of::<MandelbrotParams>()
        ).expect("Invalid layout");
        
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
            
            assert_eq!(hash1, hash2, "Reference hash generation should be deterministic");
        }
    }
    use super::*;

    #[test]
    fn test_mandelbrot_known_points() {
        // Point (0,0) should be in the Mandelbrot set (high iteration count)
        let iterations_origin = mandelbrot_pixel(0.0, 0.0, 1000);
        assert_eq!(iterations_origin, 1000, "Origin should reach max iterations");
        
        // Point (2,2) should diverge quickly (low iteration count)
        let iterations_outside = mandelbrot_pixel(2.0, 2.0, 1000);
        assert!(iterations_outside < 10, "Point (2,2) should diverge quickly, got {} iterations", iterations_outside);
        
        // Point (-0.75, 0) should be in the set (on the main bulb boundary)
        let iterations_boundary = mandelbrot_pixel(-0.75, 0.0, 1000);
        assert!(iterations_boundary > 100, "Point (-0.75, 0) should have high iteration count");
    }

    #[test]
    fn test_hash_consistency() {
        let data1 = vec![1, 2, 3, 4, 5];
        let data2 = vec![1, 2, 3, 4, 5];
        let data3 = vec![1, 2, 3, 4, 6];
        
        let hash1 = fnv1a_hash_u32(&data1);
        let hash2 = fnv1a_hash_u32(&data2);
        let hash3 = fnv1a_hash_u32(&data3);
        
        assert_eq!(hash1, hash2, "Same input should produce same hash");
        assert_ne!(hash1, hash3, "Different input should produce different hash");
    }

    #[test]
    fn test_complex_magnitude() {
        assert_eq!(complex_magnitude_squared(3.0, 4.0), 25.0);
        assert_eq!(complex_magnitude_squared(0.0, 0.0), 0.0);
        assert_eq!(complex_magnitude_squared(1.0, 1.0), 2.0);
    }

    #[test]
    fn test_memory_allocation() {
        let ptr = alloc(100);
        assert!(!ptr.is_null(), "Allocation should succeed");
        
        let null_ptr = alloc(0);
        assert!(null_ptr.is_null(), "Zero-byte allocation should return null");
    }

    #[test] 
    fn test_fnv1a_hash_known_values() {
        // Test with known values to verify FNV-1a implementation
        let empty: Vec<u32> = vec![];
        let hash_empty = fnv1a_hash_u32(&empty);
        assert_eq!(hash_empty, 2166136261, "Empty hash should equal offset basis");
        
        let single = vec![0];
        let hash_single = fnv1a_hash_u32(&single);
        // Expected: 2166136261 ^ 0 * 16777619 ^ 0 * 16777619 ^ 0 * 16777619 ^ 0 * 16777619
        // = 2166136261 * 16777619^4 = 50331653 (mod 2^32)
        assert_ne!(hash_single, hash_empty, "Single zero should produce different hash");
    }
}