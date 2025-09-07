// JSON record generation with deterministic pseudo-random values

use crate::types::{JsonRecord, LCG_INCREMENT, LCG_MULTIPLIER};

/// Generate array of JSON records with deterministic pseudo-random values
pub fn generate_json_records(count: usize, seed: u32) -> Vec<JsonRecord> {
    let mut records = Vec::with_capacity(count);
    let mut rng_state = seed;

    for i in 0..count {
        let random_value = linear_congruential_generator(&mut rng_state) as i32;

        records.push(JsonRecord {
            id: (i + 1) as u32,
            value: random_value,
            flag: (random_value & 1) == 0, // Even = true, odd = false
            name: format!("a{}", i + 1),
        });
    }

    records
}

/// Linear Congruential Generator for reproducible pseudo-random numbers
pub fn linear_congruential_generator(seed: &mut u32) -> u32 {
    *seed = seed
        .wrapping_mul(LCG_MULTIPLIER)
        .wrapping_add(LCG_INCREMENT);
    *seed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_json_generation() {
        let records = generate_json_records(3, 12345);

        assert_eq!(records.len(), 3);
        assert_eq!(records[0].id, 1);
        assert_eq!(records[1].id, 2);
        assert_eq!(records[2].id, 3);
        assert_eq!(records[0].name, "a1");
        assert_eq!(records[1].name, "a2");
        assert_eq!(records[2].name, "a3");

        // Verify reproducibility
        let records2 = generate_json_records(3, 12345);
        for (r1, r2) in records.iter().zip(records2.iter()) {
            assert_eq!(r1.id, r2.id);
            assert_eq!(r1.value, r2.value);
            assert_eq!(r1.flag, r2.flag);
            assert_eq!(r1.name, r2.name);
        }
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
}
