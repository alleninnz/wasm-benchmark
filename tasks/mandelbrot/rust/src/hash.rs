// FNV-1a hashing implementation for cross-implementation verification

use crate::types::{FNV_OFFSET_BASIS, FNV_PRIME};

/// Computes FNV-1a hash of u32 array for cross-implementation verification
pub fn fnv1a_hash_u32(data: &[u32]) -> u32 {
    let mut hash = FNV_OFFSET_BASIS;

    for &value in data {
        // Convert u32 to bytes (little-endian for cross-platform consistency)
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
    fn test_hash_consistency() {
        let data1 = vec![1, 2, 3, 4, 5];
        let data2 = vec![1, 2, 3, 4, 5];
        let data3 = vec![1, 2, 3, 4, 6];

        let hash1 = fnv1a_hash_u32(&data1);
        let hash2 = fnv1a_hash_u32(&data2);
        let hash3 = fnv1a_hash_u32(&data3);

        assert_eq!(hash1, hash2, "Same input should produce same hash");
        assert_ne!(
            hash1, hash3,
            "Different input should produce different hash"
        );
    }

    #[test]
    fn test_fnv1a_hash_known_values() {
        // Test with known values to verify FNV-1a implementation
        let empty: Vec<u32> = vec![];
        let hash_empty = fnv1a_hash_u32(&empty);
        assert_eq!(
            hash_empty, FNV_OFFSET_BASIS,
            "Empty hash should equal offset basis"
        );

        let single = vec![0];
        let hash_single = fnv1a_hash_u32(&single);
        assert_ne!(
            hash_single, hash_empty,
            "Single zero should produce different hash"
        );
    }
}
