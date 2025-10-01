use std::alloc::{alloc as sys_alloc, Layout};
use std::os::raw::c_void;

pub mod generator;
pub mod hash;
pub mod parser;
pub mod reference;
pub mod serializer;
pub mod types;

use generator::generate_json_records;
use hash::fnv1a_hash_records;
use parser::parse_json_string;
use serializer::serialize_to_json;

#[cfg(test)]
use generator::linear_congruential_generator;
#[cfg(test)]
use parser::{parse_json_boolean, parse_json_number, parse_json_string_value};
#[cfg(test)]
use types::JsonRecord;

// WebAssembly C-style interface exports

#[no_mangle]
pub extern "C" fn init(_seed: u32) {
    // Initialize WebAssembly module - no-op for this implementation
}

#[no_mangle]
pub extern "C" fn alloc(n_bytes: u32) -> *mut c_void {
    if n_bytes == 0 {
        return std::ptr::null_mut();
    }

    let layout = match Layout::from_size_align(n_bytes as usize, 8) {
        Ok(layout) => layout,
        Err(_) => return std::ptr::null_mut(),
    };

    unsafe {
        let ptr = sys_alloc(layout);
        if ptr.is_null() {
            return std::ptr::null_mut();
        }

        std::ptr::write_bytes(ptr, 0, n_bytes as usize);
        ptr as *mut c_void
    }
}

#[no_mangle]
pub extern "C" fn run_task(params_ptr: *mut c_void) -> u32 {
    let params = unsafe { std::slice::from_raw_parts(params_ptr as *const u32, 2) };
    let record_count = params[0] as usize;
    let seed = params[1];

    let records = generate_json_records(record_count, seed);
    let json_string = serialize_to_json(&records);

    let parsed_records = match parse_json_string(&json_string) {
        Ok(records) => records,
        Err(_) => return 0,
    };

    fnv1a_hash_records(&parsed_records)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_json_generation() {
        let records = generate_json_records(3, 12345);

        // Verify record count
        assert_eq!(records.len(), 3);

        // Verify sequential IDs
        assert_eq!(records[0].id, 1);
        assert_eq!(records[1].id, 2);
        assert_eq!(records[2].id, 3);

        // Verify name pattern
        assert_eq!(records[0].name, "a1");
        assert_eq!(records[1].name, "a2");
        assert_eq!(records[2].name, "a3");

        // Verify flag is derived from value (even = true, odd = false)
        for record in &records {
            assert_eq!(record.flag, (record.value & 1) == 0);
        }

        // Test reproducibility with same seed
        let records2 = generate_json_records(3, 12345);
        for (r1, r2) in records.iter().zip(records2.iter()) {
            assert_eq!(r1.id, r2.id);
            assert_eq!(r1.value, r2.value);
            assert_eq!(r1.flag, r2.flag);
            assert_eq!(r1.name, r2.name);
        }
    }

    #[test]
    fn test_json_serialization() {
        let records = vec![
            JsonRecord {
                id: 1,
                value: 123,
                flag: false,
                name: "a1".to_string(),
            },
            JsonRecord {
                id: 2,
                value: -456,
                flag: true,
                name: "a2".to_string(),
            },
        ];

        let json = serialize_to_json(&records);
        let expected = r#"[{"id":1,"value":123,"flag":false,"name":"a1"},{"id":2,"value":-456,"flag":true,"name":"a2"}]"#;

        assert_eq!(json, expected);

        // Test empty array
        let empty_json = serialize_to_json(&[]);
        assert_eq!(empty_json, "[]");
    }

    #[test]
    fn test_json_parsing() {
        let json = r#"[{"id":1,"value":123,"flag":false,"name":"a1"}]"#;
        let records = parse_json_string(json).expect("Failed to parse valid JSON");

        assert_eq!(records.len(), 1);
        assert_eq!(records[0].id, 1);
        assert_eq!(records[0].value, 123);
        assert!(!records[0].flag);
        assert_eq!(records[0].name, "a1");

        // Test multiple records
        let json_multi = r#"[{"id":1,"value":123,"flag":false,"name":"a1"},{"id":2,"value":-456,"flag":true,"name":"a2"}]"#;
        let records_multi =
            parse_json_string(json_multi).expect("Failed to parse multi-record JSON");

        assert_eq!(records_multi.len(), 2);
        assert_eq!(records_multi[1].id, 2);
        assert_eq!(records_multi[1].value, -456);
        assert!(records_multi[1].flag);
        assert_eq!(records_multi[1].name, "a2");

        // Test empty array
        let empty_json = "[]";
        let empty_records = parse_json_string(empty_json).expect("Failed to parse empty array");
        assert_eq!(empty_records.len(), 0);

        // Test error cases
        assert!(parse_json_string("invalid").is_err());
        assert!(parse_json_string(r#"[{"id":1}]"#).is_err()); // Missing required fields
    }

    #[test]
    fn test_json_roundtrip() {
        let original_records = generate_json_records(5, 42);
        let json_string = serialize_to_json(&original_records);
        let parsed_records = parse_json_string(&json_string).expect("Roundtrip parse failed");

        assert_eq!(original_records.len(), parsed_records.len());

        for (orig, parsed) in original_records.iter().zip(parsed_records.iter()) {
            assert_eq!(orig.id, parsed.id);
            assert_eq!(orig.value, parsed.value);
            assert_eq!(orig.flag, parsed.flag);
            assert_eq!(orig.name, parsed.name);
        }
    }

    #[test]
    fn test_hash_consistency() {
        let records1 = vec![
            JsonRecord {
                id: 1,
                value: 123,
                flag: true,
                name: "test".to_string(),
            },
            JsonRecord {
                id: 2,
                value: -456,
                flag: false,
                name: "data".to_string(),
            },
        ];

        let records2 = vec![
            JsonRecord {
                id: 1,
                value: 123,
                flag: true,
                name: "test".to_string(),
            },
            JsonRecord {
                id: 2,
                value: -456,
                flag: false,
                name: "data".to_string(),
            },
        ];

        let hash1 = fnv1a_hash_records(&records1);
        let hash2 = fnv1a_hash_records(&records2);

        assert_eq!(hash1, hash2);

        // Test that different data produces different hashes
        let records3 = vec![
            JsonRecord {
                id: 1,
                value: 124,
                flag: true,
                name: "test".to_string(),
            }, // Different value
        ];

        let hash3 = fnv1a_hash_records(&records3);
        assert_ne!(hash1, hash3);

        // Test empty records
        let empty_hash = fnv1a_hash_records(&[]);
        assert_eq!(empty_hash, 2166136261); // FNV offset basis
    }

    #[test]
    fn test_linear_congruential_generator() {
        let mut seed1 = 12345;
        let mut seed2 = 12345;

        // Same seed should produce same sequence
        for _ in 0..10 {
            let val1 = linear_congruential_generator(&mut seed1);
            let val2 = linear_congruential_generator(&mut seed2);
            assert_eq!(val1, val2);
        }

        // Different seeds should produce different values
        let mut seed3 = 54321;
        let val_diff_seed = linear_congruential_generator(&mut seed3);
        let mut seed4 = 12345;
        let val_same_seed = linear_congruential_generator(&mut seed4);

        assert_ne!(val_diff_seed, val_same_seed);
    }

    #[test]
    fn test_parse_utilities() {
        // Test string parsing
        let json_bytes = br#""hello world""#;
        let mut pos = 0;
        let parsed_string =
            parse_json_string_value(json_bytes, &mut pos).expect("Failed to parse string");
        assert_eq!(parsed_string, "hello world");

        // Test number parsing
        let num_bytes = b"123";
        let mut pos = 0;
        let parsed_num = parse_json_number(num_bytes, &mut pos).expect("Failed to parse number");
        assert_eq!(parsed_num, 123);

        // Test negative number parsing
        let neg_bytes = b"-456";
        let mut pos = 0;
        let parsed_neg =
            parse_json_number(neg_bytes, &mut pos).expect("Failed to parse negative number");
        assert_eq!(parsed_neg, -456);

        // Test boolean parsing
        let true_bytes = b"true";
        let mut pos = 0;
        let parsed_true = parse_json_boolean(true_bytes, &mut pos).expect("Failed to parse true");
        assert!(parsed_true);

        let false_bytes = b"false";
        let mut pos = 0;
        let parsed_false =
            parse_json_boolean(false_bytes, &mut pos).expect("Failed to parse false");
        assert!(!parsed_false);
    }

    #[test]
    fn test_webassembly_interface() {
        // Test init function (should not panic or error)
        init(12345);
        init(0);
        init(u32::MAX);

        // Test alloc function with various sizes
        unsafe {
            // Test zero allocation
            let null_ptr = alloc(0);
            assert!(null_ptr.is_null());

            // Test small allocation
            let small_ptr = alloc(8);
            assert!(!small_ptr.is_null());

            // Verify memory is zero-initialized
            let data = std::slice::from_raw_parts(small_ptr as *const u8, 8);
            for &byte in data {
                assert_eq!(byte, 0);
            }

            // Test parameter-sized allocation (8 bytes for two u32s)
            let param_ptr = alloc(8);
            assert!(!param_ptr.is_null());

            // Write test parameters and verify they can be read back
            let params = std::slice::from_raw_parts_mut(param_ptr as *mut u32, 2);
            params[0] = 100; // record_count
            params[1] = 42; // seed

            // Read back and verify
            let read_params = std::slice::from_raw_parts(param_ptr as *const u32, 2);
            assert_eq!(read_params[0], 100);
            assert_eq!(read_params[1], 42);
        }
    }

    #[test]
    fn test_run_task_integration() {
        unsafe {
            // Allocate parameter memory
            let param_ptr = alloc(8);
            assert!(!param_ptr.is_null());

            // Set up test parameters
            let params = std::slice::from_raw_parts_mut(param_ptr as *mut u32, 2);
            params[0] = 5; // record_count: generate 5 JSON records
            params[1] = 123; // seed: deterministic value for reproducibility

            // Initialize (no-op but part of interface)
            init(123);

            // Run the benchmark task
            let hash_result = run_task(param_ptr);

            // Verify we got a non-zero hash (successful execution)
            assert_ne!(hash_result, 0);

            // Run again with same parameters - should get identical result
            let hash_result2 = run_task(param_ptr);
            assert_eq!(hash_result, hash_result2);

            // Change seed and verify different result
            params[1] = 456; // different seed
            let hash_result3 = run_task(param_ptr);
            assert_ne!(hash_result, hash_result3);
        }
    }

    #[test]
    #[ignore]
    fn generate_reference_hashes() {
        use crate::reference::{export_vectors_to_json, generate_all_vectors};

        println!("=== JSON PARSE REFERENCE HASH GENERATION ===");
        println!("Generating comprehensive test vector suite...");

        let vectors = generate_all_vectors();

        // Export to centralized JSON file for TinyGo validation
        if let Err(e) =
            export_vectors_to_json(&vectors, "../../../data/reference_hashes/json_parse.json")
        {
            panic!("Failed to export reference hashes: {}", e);
        }

        // Print summary statistics
        let mut categories = std::collections::HashMap::new();
        for vector in &vectors {
            let count = categories.entry(vector.category.clone()).or_insert(0);
            *count += 1;
        }

        println!(
            "
=== GENERATION SUMMARY ==="
        );
        println!("Total test vectors: {}", vectors.len());
        for (category, count) in categories {
            println!("  {}: {} vectors", category, count);
        }

        println!(
            "
✅ Reference hash generation completed successfully"
        );
        println!("📁 Output file: ../../../data/reference_hashes/json_parse.json");
        println!("🔗 Use this file for cross-implementation validation with TinyGo");
    }
}
