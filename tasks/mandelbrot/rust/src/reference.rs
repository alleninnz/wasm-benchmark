use crate::{run_task, MandelbrotParams};
use serde::{Deserialize, Serialize};
use std::alloc::{alloc as sys_alloc, Layout};
use std::os::raw::c_void;

/// Test vector for cross-implementation validation
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TestVector {
    pub name: String,
    pub description: String,
    pub params: SerializableParams,
    pub expected_hash: u32,
    pub category: String,
}

/// Serializable version of MandelbrotParams for JSON export
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SerializableParams {
    pub width: u32,
    pub height: u32,
    pub max_iter: u32,
    pub center_real: f64,
    pub center_imag: f64,
    pub scale_factor: f64,
}

impl From<MandelbrotParams> for SerializableParams {
    fn from(params: MandelbrotParams) -> Self {
        SerializableParams {
            width: params.width,
            height: params.height,
            max_iter: params.max_iter,
            center_real: params.center_real,
            center_imag: params.center_imag,
            scale_factor: params.scale_factor,
        }
    }
}

impl From<SerializableParams> for MandelbrotParams {
    fn from(params: SerializableParams) -> Self {
        MandelbrotParams {
            width: params.width,
            height: params.height,
            max_iter: params.max_iter,
            center_real: params.center_real,
            center_imag: params.center_imag,
            scale_factor: params.scale_factor,
        }
    }
}

/// Generate systematic test vectors across parameter space
pub fn generate_systematic_vectors() -> Vec<TestVector> {
    let mut vectors = Vec::new();

    // Systematic parameter combinations
    let sizes = [(2, 2), (4, 4), (10, 10), (50, 50), (100, 100)];
    let iterations = [10, 100, 1000];
    let centers = [(0.0, 0.0), (-0.5, 0.0), (-0.75, 0.1), (0.25, 0.5)];
    let scales = [4.0, 2.0, 1.0, 0.5, 0.01];

    for (i, &(width, height)) in sizes.iter().enumerate() {
        for (j, &max_iter) in iterations.iter().enumerate() {
            for (k, &(center_real, center_imag)) in centers.iter().enumerate() {
                for (l, &scale_factor) in scales.iter().enumerate() {
                    let params = MandelbrotParams {
                        width,
                        height,
                        max_iter,
                        center_real,
                        center_imag,
                        scale_factor,
                    };

                    let hash = compute_reference_hash(&params);

                    vectors.push(TestVector {
                        name: format!("systematic_{}_{}_{}_{}", i, j, k, l),
                        description: format!(
                            "{}x{}, iter={}, center=({:.3},{:.3}), scale={:.3}",
                            width, height, max_iter, center_real, center_imag, scale_factor
                        ),
                        params: params.into(),
                        expected_hash: hash,
                        category: "systematic".to_string(),
                    });
                }
            }
        }
    }

    vectors
}

/// Generate manual critical test cases
pub fn generate_manual_critical_vectors() -> Vec<TestVector> {
    let critical_cases = [
        (
            "origin_high_precision",
            "Point (0,0) with high iteration count - in Mandelbrot set",
            MandelbrotParams {
                width: 100,
                height: 100,
                max_iter: 10000,
                center_real: 0.0,
                center_imag: 0.0,
                scale_factor: 4.0,
            },
        ),
        (
            "main_cardioid_boundary",
            "Main cardioid boundary - critical for floating-point precision",
            MandelbrotParams {
                width: 200,
                height: 200,
                max_iter: 5000,
                center_real: -0.75,
                center_imag: 0.0,
                scale_factor: 0.1,
            },
        ),
        (
            "period_2_bulb",
            "Period-2 bulb region - mathematically interesting boundary",
            MandelbrotParams {
                width: 150,
                height: 150,
                max_iter: 2000,
                center_real: -1.25,
                center_imag: 0.0,
                scale_factor: 0.3,
            },
        ),
        (
            "seahorse_valley",
            "Seahorse Valley - complex boundary with high detail",
            MandelbrotParams {
                width: 300,
                height: 300,
                max_iter: 8000,
                center_real: -0.75,
                center_imag: 0.1,
                scale_factor: 0.005,
            },
        ),
        (
            "edge_of_set",
            "Edge of set with extreme zoom - floating-point precision critical",
            MandelbrotParams {
                width: 50,
                height: 50,
                max_iter: 1000,
                center_real: -0.7269,
                center_imag: 0.1889,
                scale_factor: 0.0001,
            },
        ),
        (
            "large_scale_overview",
            "Large scale overview - entire visible set",
            MandelbrotParams {
                width: 500,
                height: 500,
                max_iter: 1000,
                center_real: -0.5,
                center_imag: 0.0,
                scale_factor: 3.0,
            },
        ),
        (
            "minimal_image",
            "Minimal image size - edge case for algorithms",
            MandelbrotParams {
                width: 1,
                height: 1,
                max_iter: 100,
                center_real: 0.0,
                center_imag: 0.0,
                scale_factor: 4.0,
            },
        ),
        (
            "extreme_iterations",
            "Extreme iteration count - performance and precision test",
            MandelbrotParams {
                width: 20,
                height: 20,
                max_iter: 100000,
                center_real: 0.0,
                center_imag: 0.0,
                scale_factor: 4.0,
            },
        ),
    ];

    critical_cases
        .iter()
        .map(|(name, desc, params)| {
            let hash = compute_reference_hash(params);
            TestVector {
                name: name.to_string(),
                description: desc.to_string(),
                params: (*params).into(),
                expected_hash: hash,
                category: "critical".to_string(),
            }
        })
        .collect()
}

/// Generate floating-point precision validation vectors
pub fn generate_precision_vectors() -> Vec<TestVector> {
    let mut vectors = Vec::new();

    // Test cases designed to stress floating-point precision
    let precision_cases = [
        (
            "near_zero_scale",
            "Very small scale factor - precision at limits",
            MandelbrotParams {
                width: 10,
                height: 10,
                max_iter: 1000,
                center_real: -0.5,
                center_imag: 0.0,
                scale_factor: 1e-10,
            },
        ),
        (
            "large_scale_factor",
            "Very large scale factor - numerical overflow risk",
            MandelbrotParams {
                width: 10,
                height: 10,
                max_iter: 100,
                center_real: 0.0,
                center_imag: 0.0,
                scale_factor: 1e6,
            },
        ),
        (
            "high_precision_center",
            "High precision center coordinates",
            MandelbrotParams {
                width: 50,
                height: 50,
                max_iter: 1000,
                center_real: -0.7269095996951777,
                center_imag: 0.18891129787945794,
                scale_factor: 0.0001,
            },
        ),
        (
            "boundary_precision_test",
            "Point exactly on set boundary - most sensitive to precision",
            MandelbrotParams {
                width: 100,
                height: 100,
                max_iter: 10000,
                center_real: -0.754,
                center_imag: 0.0000000000000001,
                scale_factor: 0.001,
            },
        ),
        (
            "subnormal_coordinates",
            "Coordinates near subnormal floating-point range",
            MandelbrotParams {
                width: 20,
                height: 20,
                max_iter: 1000,
                center_real: 1e-308,
                center_imag: 1e-308,
                scale_factor: 1e-300,
            },
        ),
    ];

    for (name, desc, params) in precision_cases.iter() {
        let hash = compute_reference_hash(params);
        vectors.push(TestVector {
            name: name.to_string(),
            description: desc.to_string(),
            params: (*params).into(),
            expected_hash: hash,
            category: "precision".to_string(),
        });
    }

    vectors
}

/// Generate edge case test vectors
pub fn generate_edge_case_vectors() -> Vec<TestVector> {
    let edge_cases = [
        (
            "zero_iterations",
            "Zero iterations - should return 0 for all pixels",
            MandelbrotParams {
                width: 10,
                height: 10,
                max_iter: 0,
                center_real: 0.0,
                center_imag: 0.0,
                scale_factor: 4.0,
            },
        ),
        (
            "single_iteration",
            "Single iteration - only points with |c| > 2 escape",
            MandelbrotParams {
                width: 10,
                height: 10,
                max_iter: 1,
                center_real: 0.0,
                center_imag: 0.0,
                scale_factor: 6.0,
            },
        ),
        (
            "max_uint32_iterations",
            "Maximum uint32 iterations - extreme case",
            MandelbrotParams {
                width: 2,
                height: 2,
                max_iter: u32::MAX,
                center_real: 0.0,
                center_imag: 0.0,
                scale_factor: 4.0,
            },
        ),
        (
            "rectangular_image",
            "Non-square image - aspect ratio handling",
            MandelbrotParams {
                width: 100,
                height: 50,
                max_iter: 1000,
                center_real: -0.5,
                center_imag: 0.0,
                scale_factor: 3.0,
            },
        ),
        (
            "tall_image",
            "Tall rectangular image",
            MandelbrotParams {
                width: 25,
                height: 100,
                max_iter: 1000,
                center_real: -0.5,
                center_imag: 0.0,
                scale_factor: 3.0,
            },
        ),
        (
            "negative_center",
            "Negative center coordinates",
            MandelbrotParams {
                width: 50,
                height: 50,
                max_iter: 1000,
                center_real: -2.0,
                center_imag: -1.0,
                scale_factor: 2.0,
            },
        ),
        (
            "positive_center",
            "Positive center coordinates (outside typical view)",
            MandelbrotParams {
                width: 50,
                height: 50,
                max_iter: 1000,
                center_real: 1.0,
                center_imag: 1.0,
                scale_factor: 2.0,
            },
        ),
    ];

    edge_cases
        .iter()
        .map(|(name, desc, params)| {
            let hash = compute_reference_hash(params);
            TestVector {
                name: name.to_string(),
                description: desc.to_string(),
                params: (*params).into(),
                expected_hash: hash,
                category: "edge_case".to_string(),
            }
        })
        .collect()
}

/// Compute reference hash using the Rust implementation
fn compute_reference_hash(params: &MandelbrotParams) -> u32 {
    // Allocate memory for parameters
    let layout = Layout::from_size_align(
        std::mem::size_of::<MandelbrotParams>(),
        std::mem::align_of::<MandelbrotParams>(),
    )
    .expect("Invalid layout");
    let params_ptr = unsafe { sys_alloc(layout) as *mut MandelbrotParams };

    if params_ptr.is_null() {
        panic!("Failed to allocate memory for parameters");
    }

    // Copy parameters to allocated memory
    unsafe {
        std::ptr::write(params_ptr, *params);

        // Call the reference implementation
        let hash = run_task(params_ptr as *mut c_void);

        // Clean up
        std::alloc::dealloc(params_ptr as *mut u8, layout);

        hash
    }
}

/// Generate all test vectors
pub fn generate_all_vectors() -> Vec<TestVector> {
    let mut all_vectors = Vec::new();

    println!("Generating systematic test vectors...");
    all_vectors.extend(generate_systematic_vectors());

    println!("Generating manual critical test vectors...");
    all_vectors.extend(generate_manual_critical_vectors());

    println!("Generating floating-point precision vectors...");
    all_vectors.extend(generate_precision_vectors());

    println!("Generating edge case vectors...");
    all_vectors.extend(generate_edge_case_vectors());

    println!("Generated {} total test vectors", all_vectors.len());

    all_vectors
}

/// Export test vectors to JSON file
pub fn export_vectors_to_json(vectors: &[TestVector], filename: &str) -> std::io::Result<()> {
    use std::fs::File;
    use std::io::Write;

    let json = serde_json::to_string_pretty(vectors)?;
    let mut file = File::create(filename)?;
    file.write_all(json.as_bytes())?;

    println!("Exported {} test vectors to {}", vectors.len(), filename);
    Ok(())
}
