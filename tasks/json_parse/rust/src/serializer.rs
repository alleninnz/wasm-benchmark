// JSON serialization with optimized string operations

use crate::types::{JsonRecord, JSON_FIELD_ESTIMATE};

/// Convert JsonRecord array to compact JSON string with optimized string building
pub fn serialize_to_json(records: &[JsonRecord]) -> String {
    if records.is_empty() {
        return "[]".to_string();
    }

    // Pre-allocate with better capacity estimation
    let estimated_capacity = records.len() * JSON_FIELD_ESTIMATE + 2; // +2 for brackets
    let mut json = String::with_capacity(estimated_capacity);
    json.push('[');

    // Use direct indexing for consistency with TinyGo implementation
    for i in 0..records.len() {
        if i > 0 {
            json.push(',');
        }

        let record = &records[i];

        // Build JSON object with optimized string operations
        json.push_str("{\"id\":");
        write_u32_optimized(&mut json, record.id);
        json.push_str(",\"value\":");
        write_i32_optimized(&mut json, record.value);
        json.push_str(",\"flag\":");
        json.push_str(if record.flag { "true" } else { "false" });
        json.push_str(",\"name\":\"");
        json.push_str(&record.name);
        json.push_str("\"}");
    }

    json.push(']');
    json
}

/// Write u32 directly to string with buffer reuse
fn write_u32_optimized(s: &mut String, value: u32) {
    if value == 0 {
        s.push('0');
        return;
    }

    let mut buffer = [0u8; 10]; // u32::MAX has 10 digits
    let mut pos = buffer.len();
    let mut n = value;

    while n > 0 {
        pos -= 1;
        buffer[pos] = (n % 10) as u8 + b'0';
        n /= 10;
    }

    s.push_str(unsafe { std::str::from_utf8_unchecked(&buffer[pos..]) });
}

/// Write i32 directly to string with buffer reuse
fn write_i32_optimized(s: &mut String, value: i32) {
    if value == 0 {
        s.push('0');
        return;
    }

    let mut buffer = [0u8; 11]; // i32::MIN has 11 chars including '-'
    let mut pos = buffer.len();
    let mut n = value.unsigned_abs();

    while n > 0 {
        pos -= 1;
        buffer[pos] = (n % 10) as u8 + b'0';
        n /= 10;
    }

    if value < 0 {
        pos -= 1;
        buffer[pos] = b'-';
    }

    s.push_str(unsafe { std::str::from_utf8_unchecked(&buffer[pos..]) });
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
