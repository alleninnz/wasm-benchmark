// FNV-1a hash implementation for verification

use crate::types::{JsonRecord, FNV_OFFSET_BASIS, FNV_PRIME};

/// Compute FNV-1a hash of all JsonRecord field values for verification
pub fn fnv1a_hash_records(records: &[JsonRecord]) -> u32 {
    let mut hash = FNV_OFFSET_BASIS;

    // Use direct indexing for consistency with TinyGo implementation
    for i in 0..records.len() {
        let record = &records[i];

        // Hash id field (u32 as little-endian bytes)
        for byte in record.id.to_le_bytes() {
            hash ^= byte as u32;
            hash = hash.wrapping_mul(FNV_PRIME);
        }

        // Hash value field (i32 as little-endian bytes)
        for byte in record.value.to_le_bytes() {
            hash ^= byte as u32;
            hash = hash.wrapping_mul(FNV_PRIME);
        }

        // Hash flag field (bool as single byte)
        let flag_byte = if record.flag { 1u8 } else { 0u8 };
        hash ^= flag_byte as u32;
        hash = hash.wrapping_mul(FNV_PRIME);

        // Hash name field (UTF-8 bytes)
        for byte in record.name.as_bytes() {
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

        // Different data should produce different hashes
        let records3 = vec![JsonRecord {
            id: 1,
            value: 124,
            flag: true,
            name: "test".to_string(),
        }];

        let hash3 = fnv1a_hash_records(&records3);
        assert_ne!(hash1, hash3);

        // Empty records
        let empty_hash = fnv1a_hash_records(&[]);
        assert_eq!(empty_hash, FNV_OFFSET_BASIS);
    }
}
