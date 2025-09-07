use crate::{alloc, init, run_task};

use serde::{Deserialize, Serialize};

/// Test vector for cross-implementation validation
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TestVector {
    pub name: String,
    pub description: String,
    pub params: SerializableParams,
    pub expected_hash: u32,
    pub category: String,
}

/// Serializable version of JSON parse parameters for JSON export
#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
pub struct SerializableParams {
    pub record_count: u32,
    pub seed: u32,
}

/// Generate systematic test vectors across parameter space
pub fn generate_systematic_vectors() -> Vec<TestVector> {
    let mut vectors = Vec::new();

    // Systematic parameter combinations
    let record_counts = [0, 1, 5, 10, 50, 100, 1000];
    let seeds = [0, 1, 42, 12345, 54321, 999999, u32::MAX];

    for (i, &record_count) in record_counts.iter().enumerate() {
        for (j, &seed) in seeds.iter().enumerate() {
            let params = SerializableParams { record_count, seed };

            let hash = compute_reference_hash(&params);

            vectors.push(TestVector {
                name: format!("systematic_{}_{}", i, j),
                description: format!("records={}, seed={}", record_count, seed),
                params,
                expected_hash: hash,
                category: "systematic".to_string(),
            });
        }
    }

    vectors
}

/// Generate manual critical test cases
pub fn generate_manual_critical_vectors() -> Vec<TestVector> {
    let critical_cases = [
        (
            "empty_array",
            "Empty JSON array - edge case for parsing",
            SerializableParams {
                record_count: 0,
                seed: 42,
            },
        ),
        (
            "single_record",
            "Single record - minimal JSON structure",
            SerializableParams {
                record_count: 1,
                seed: 12345,
            },
        ),
        (
            "large_dataset",
            "Large dataset - performance and memory test",
            SerializableParams {
                record_count: 10000,
                seed: 999,
            },
        ),
        (
            "zero_seed",
            "Zero seed - deterministic generation edge case",
            SerializableParams {
                record_count: 100,
                seed: 0,
            },
        ),
        (
            "max_seed",
            "Maximum seed value - LCG boundary test",
            SerializableParams {
                record_count: 50,
                seed: u32::MAX,
            },
        ),
        (
            "power_of_two_records",
            "Power of 2 record count - memory alignment test",
            SerializableParams {
                record_count: 1024,
                seed: 2048,
            },
        ),
        (
            "prime_number_records",
            "Prime number record count - hash distribution test",
            SerializableParams {
                record_count: 997, // Large prime
                seed: 1009,        // Another prime
            },
        ),
        (
            "alternating_pattern_seed",
            "Alternating bit pattern seed - LCG stress test",
            SerializableParams {
                record_count: 200,
                seed: 0xAAAAAAAA,
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
                params: *params,
                expected_hash: hash,
                category: "critical".to_string(),
            }
        })
        .collect()
}

/// Generate random number generation validation vectors
pub fn generate_rng_vectors() -> Vec<TestVector> {
    let mut vectors = Vec::new();

    // Test cases designed to validate LCG implementation consistency
    let rng_cases = [
        (
            "sequential_seeds",
            "Sequential seed values - pattern detection",
            vec![
                (10, 1),
                (10, 2),
                (10, 3),
                (10, 4),
                (10, 5),
                (10, 6),
                (10, 7),
                (10, 8),
                (10, 9),
                (10, 10),
            ],
        ),
        (
            "fixed_record_varying_seed",
            "Fixed record count, varying seeds - seed sensitivity",
            vec![
                (100, 1),
                (100, 100),
                (100, 1000),
                (100, 10000),
                (100, 100000),
                (100, 1000000),
            ],
        ),
        (
            "varying_record_fixed_seed",
            "Varying record count, fixed seed - scalability test",
            vec![
                (1, 42),
                (10, 42),
                (100, 42),
                (500, 42),
                (1000, 42),
                (5000, 42),
            ],
        ),
        (
            "lcg_cycle_detection",
            "LCG cycle boundary values - mathematical validation",
            vec![
                (50, 1664525),     // LCG multiplier
                (50, 1013904223),  // LCG increment
                (50, 1664525 * 2), // Multiple of multiplier
                (50, 2166136261),  // FNV offset basis
                (50, 16777619),    // FNV prime
            ],
        ),
    ];

    for (category_name, category_desc, cases) in rng_cases.iter() {
        for (i, &(record_count, seed)) in cases.iter().enumerate() {
            let params = SerializableParams { record_count, seed };
            let hash = compute_reference_hash(&params);

            vectors.push(TestVector {
                name: format!("{}_case_{}", category_name, i),
                description: format!(
                    "{} - records={}, seed={}",
                    category_desc, record_count, seed
                ),
                params,
                expected_hash: hash,
                category: "rng_validation".to_string(),
            });
        }
    }

    vectors
}

/// Generate JSON parsing stress test vectors
pub fn generate_parsing_vectors() -> Vec<TestVector> {
    let parsing_cases = [
        (
            "boolean_distribution_test",
            "Test case with expected boolean distribution",
            SerializableParams {
                record_count: 1000,
                seed: 123456, // Chosen for good true/false distribution
            },
        ),
        (
            "negative_value_heavy",
            "Seed producing many negative values",
            SerializableParams {
                record_count: 500,
                seed: 0x80000000, // High bit set - more negatives
            },
        ),
        (
            "positive_value_heavy",
            "Seed producing mainly positive values",
            SerializableParams {
                record_count: 500,
                seed: 0x7FFFFFFF, // High bit clear - more positives
            },
        ),
        (
            "string_pattern_test",
            "Test string generation pattern consistency",
            SerializableParams {
                record_count: 100,
                seed: 987654,
            },
        ),
        (
            "json_structure_stress",
            "Large JSON structure parsing stress test",
            SerializableParams {
                record_count: 2000,
                seed: 555555,
            },
        ),
        (
            "hash_collision_resistance",
            "Test hash function collision resistance",
            SerializableParams {
                record_count: 1000,
                seed: 314159, // Pi digits
            },
        ),
        (
            "memory_efficiency_test",
            "Memory allocation pattern validation",
            SerializableParams {
                record_count: 10000,
                seed: 271828, // e digits
            },
        ),
    ];

    parsing_cases
        .iter()
        .map(|(name, desc, params)| {
            let hash = compute_reference_hash(params);
            TestVector {
                name: name.to_string(),
                description: desc.to_string(),
                params: *params,
                expected_hash: hash,
                category: "parsing_validation".to_string(),
            }
        })
        .collect()
}

/// Generate edge case test vectors
pub fn generate_edge_case_vectors() -> Vec<TestVector> {
    let edge_cases = [
        (
            "boundary_record_counts",
            "Boundary record count values",
            vec![
                (0, 42),               // Empty
                (1, 42),               // Minimum
                (2, 42),               // Pair
                (3, 42),               // Triplet
                (u16::MAX as u32, 42), // Large but reasonable
            ],
        ),
        (
            "boundary_seeds",
            "Boundary seed values",
            vec![
                (10, 0),               // Zero
                (10, 1),               // Minimum positive
                (10, u32::MAX),        // Maximum
                (10, u32::MAX - 1),    // Near maximum
                (10, i32::MAX as u32), // Signed maximum
            ],
        ),
        (
            "power_of_two_values",
            "Power of 2 test values",
            vec![
                (1, 1),       // 2^0, 2^0
                (2, 2),       // 2^1, 2^1
                (4, 4),       // 2^2, 2^2
                (8, 8),       // 2^3, 2^3
                (16, 16),     // 2^4, 2^4
                (32, 32),     // 2^5, 2^5
                (64, 64),     // 2^6, 2^6
                (128, 128),   // 2^7, 2^7
                (256, 256),   // 2^8, 2^8
                (512, 512),   // 2^9, 2^9
                (1024, 1024), // 2^10, 2^10
            ],
        ),
    ];

    let mut vectors = Vec::new();
    for (category_name, category_desc, cases) in edge_cases.iter() {
        for (i, &(record_count, seed)) in cases.iter().enumerate() {
            let params = SerializableParams { record_count, seed };
            let hash = compute_reference_hash(&params);

            vectors.push(TestVector {
                name: format!("{}_case_{}", category_name, i),
                description: format!(
                    "{} - records={}, seed={}",
                    category_desc, record_count, seed
                ),
                params,
                expected_hash: hash,
                category: "edge_case".to_string(),
            });
        }
    }

    vectors
}

/// Compute reference hash using the Rust implementation
fn compute_reference_hash(params: &SerializableParams) -> u32 {
    // Allocate memory for parameters (8 bytes for two u32s)
    let params_ptr = alloc(8);
    if params_ptr.is_null() {
        panic!("Failed to allocate memory for parameters");
    }

    unsafe {
        // Write parameters to allocated memory
        let param_slice = std::slice::from_raw_parts_mut(params_ptr as *mut u32, 2);
        param_slice[0] = params.record_count;
        param_slice[1] = params.seed;

        // Initialize (no-op but part of interface)
        init(params.seed);

        // Call the reference implementation
        run_task(params_ptr)
    }
}

/// Generate all test vectors
pub fn generate_all_vectors() -> Vec<TestVector> {
    let mut all_vectors = Vec::new();

    println!("Generating systematic test vectors...");
    all_vectors.extend(generate_systematic_vectors());

    println!("Generating manual critical test vectors...");
    all_vectors.extend(generate_manual_critical_vectors());

    println!("Generating RNG validation vectors...");
    all_vectors.extend(generate_rng_vectors());

    println!("Generating parsing validation vectors...");
    all_vectors.extend(generate_parsing_vectors());

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
