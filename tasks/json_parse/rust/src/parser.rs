// JSON parsing implementation with comprehensive error handling

use crate::types::{JsonRecord, ParseError};

/// Parse JSON string to JsonRecord objects with optimized byte-based parsing
pub fn parse_json_string(json: &str) -> Result<Vec<JsonRecord>, ParseError> {
    let bytes = json.as_bytes();
    let mut pos = 0;

    skip_whitespace(bytes, &mut pos);

    if pos >= bytes.len() || bytes[pos] != b'[' {
        return Err(ParseError::InvalidArrayFormat);
    }

    parse_json_array(bytes, &mut pos)
}

fn skip_whitespace(bytes: &[u8], pos: &mut usize) {
    while *pos < bytes.len() {
        match bytes[*pos] {
            b' ' | b'\t' | b'\n' | b'\r' => *pos += 1,
            _ => break,
        }
    }
}

fn parse_json_array(bytes: &[u8], pos: &mut usize) -> Result<Vec<JsonRecord>, ParseError> {
    *pos += 1; // Skip opening '['
    skip_whitespace(bytes, pos);

    // Pre-allocate vector based on estimated capacity
    let estimated_capacity = bytes.len() / 50; // Estimate ~50 bytes per record
    let mut records = Vec::with_capacity(estimated_capacity);

    // Handle empty array
    if *pos < bytes.len() && bytes[*pos] == b']' {
        *pos += 1;
        return Ok(records);
    }

    // Parse comma-separated objects
    loop {
        skip_whitespace(bytes, pos);

        let record = parse_json_object(bytes, pos)?;
        records.push(record);

        skip_whitespace(bytes, pos);

        if *pos >= bytes.len() {
            return Err(ParseError::UnexpectedEndOfInput);
        }

        match bytes[*pos] {
            b',' => {
                *pos += 1;
                skip_whitespace(bytes, pos);

                // Handle trailing comma
                if *pos < bytes.len() && bytes[*pos] == b']' {
                    *pos += 1;
                    break;
                }
            }
            b']' => {
                *pos += 1;
                break;
            }
            _ => return Err(ParseError::InvalidArrayFormat),
        }
    }

    Ok(records)
}

fn parse_json_object(bytes: &[u8], pos: &mut usize) -> Result<JsonRecord, ParseError> {
    skip_whitespace(bytes, pos);

    if *pos >= bytes.len() || bytes[*pos] != b'{' {
        return Err(ParseError::InvalidObjectFormat);
    }

    *pos += 1; // Skip opening '{'

    let mut id = None;
    let mut value = None;
    let mut flag = None;
    let mut name = None;

    skip_whitespace(bytes, pos);

    // Handle empty object
    if *pos < bytes.len() && bytes[*pos] == b'}' {
        *pos += 1;
        return Err(ParseError::InvalidObjectFormat);
    }

    // Parse key-value pairs
    loop {
        skip_whitespace(bytes, pos);

        let key = parse_json_string_value(bytes, pos)?;

        skip_whitespace(bytes, pos);

        if *pos >= bytes.len() || bytes[*pos] != b':' {
            return Err(ParseError::InvalidObjectFormat);
        }
        *pos += 1;

        skip_whitespace(bytes, pos);

        // Parse value based on field name
        match key.as_str() {
            "id" => {
                let parsed_id = parse_json_number(bytes, pos)? as u32;
                id = Some(parsed_id);
            }
            "value" => {
                let parsed_value = parse_json_number(bytes, pos)?;
                value = Some(parsed_value);
            }
            "flag" => {
                let parsed_flag = parse_json_boolean(bytes, pos)?;
                flag = Some(parsed_flag);
            }
            "name" => {
                let parsed_name = parse_json_string_value(bytes, pos)?;
                name = Some(parsed_name);
            }
            _ => return Err(ParseError::UnknownField { field: key }),
        }

        skip_whitespace(bytes, pos);

        if *pos >= bytes.len() {
            return Err(ParseError::UnexpectedEndOfInput);
        }

        match bytes[*pos] {
            b',' => {
                *pos += 1;
            }
            b'}' => {
                *pos += 1;
                break;
            }
            _ => return Err(ParseError::InvalidObjectFormat),
        }
    }

    // Validate all required fields are present
    let id = id.ok_or(ParseError::MissingField { field: "id" })?;
    let value = value.ok_or(ParseError::MissingField { field: "value" })?;
    let flag = flag.ok_or(ParseError::MissingField { field: "flag" })?;
    let name = name.ok_or(ParseError::MissingField { field: "name" })?;

    Ok(JsonRecord {
        id,
        value,
        flag,
        name,
    })
}

pub fn parse_json_string_value(bytes: &[u8], pos: &mut usize) -> Result<String, ParseError> {
    skip_whitespace(bytes, pos);

    if *pos >= bytes.len() || bytes[*pos] != b'"' {
        return Err(ParseError::InvalidString {
            message: "Expected string starting with '\"'",
        });
    }

    *pos += 1; // Skip opening quote
    let start = *pos;
    let mut has_escapes = false;

    // Fast scan to find closing quote and detect escapes
    while *pos < bytes.len() {
        match bytes[*pos] {
            b'"' => {
                // Found closing quote
                if !has_escapes {
                    // Zero-copy path: no escapes, use slice directly
                    let result = std::str::from_utf8(&bytes[start..*pos])
                        .map_err(|_| ParseError::InvalidString {
                            message: "Invalid UTF-8 in string",
                        })?
                        .to_string();
                    *pos += 1;
                    return Ok(result);
                } else {
                    // Has escapes, need to process
                    *pos += 1;
                    break;
                }
            }
            b'\\' => {
                has_escapes = true;
                *pos += 1;
                if *pos >= bytes.len() {
                    return Err(ParseError::InvalidString {
                        message: "Incomplete escape sequence",
                    });
                }
                *pos += 1;
            }
            _ => {
                *pos += 1;
            }
        }
    }

    if !has_escapes {
        return Err(ParseError::InvalidString {
            message: "Unterminated string",
        });
    }

    // Process string with escapes
    let mut result = String::new();
    let mut i = start;

    while i < *pos - 1 {
        match bytes[i] {
            b'\\' => {
                i += 1;
                if i >= *pos - 1 {
                    break;
                }
                match bytes[i] {
                    b'"' => result.push('"'),
                    b'\\' => result.push('\\'),
                    b'n' => result.push('\n'),
                    b'r' => result.push('\r'),
                    b't' => result.push('\t'),
                    _ => {
                        return Err(ParseError::InvalidString {
                            message: "Unsupported escape sequence",
                        })
                    }
                }
                i += 1;
            }
            c => {
                result.push(c as char);
                i += 1;
            }
        }
    }

    Ok(result)
}

pub fn parse_json_number(bytes: &[u8], pos: &mut usize) -> Result<i32, ParseError> {
    skip_whitespace(bytes, pos);

    if *pos >= bytes.len() {
        return Err(ParseError::UnexpectedEndOfInput);
    }

    let mut result: i64 = 0;
    let mut negative = false;

    if bytes[*pos] == b'-' {
        negative = true;
        *pos += 1;
    }

    if *pos >= bytes.len() || !bytes[*pos].is_ascii_digit() {
        return Err(ParseError::InvalidNumber {
            message: "Expected digit",
        });
    }

    while *pos < bytes.len() && bytes[*pos].is_ascii_digit() {
        let digit = (bytes[*pos] - b'0') as i64;

        if result > (i64::MAX - digit) / 10 {
            return Err(ParseError::InvalidNumber {
                message: "Number overflow",
            });
        }

        result = result * 10 + digit;
        *pos += 1;
    }

    let final_result = if negative { -result } else { result };

    if final_result < i32::MIN as i64 || final_result > i32::MAX as i64 {
        return Err(ParseError::InvalidNumber {
            message: "Number out of range",
        });
    }

    Ok(final_result as i32)
}

pub fn parse_json_boolean(bytes: &[u8], pos: &mut usize) -> Result<bool, ParseError> {
    skip_whitespace(bytes, pos);

    if *pos >= bytes.len() {
        return Err(ParseError::UnexpectedEndOfInput);
    }

    // Check for "true"
    if *pos + 4 <= bytes.len()
        && bytes[*pos] == b't'
        && bytes[*pos + 1] == b'r'
        && bytes[*pos + 2] == b'u'
        && bytes[*pos + 3] == b'e'
    {
        *pos += 4;
        return Ok(true);
    }

    // Check for "false"
    if *pos + 5 <= bytes.len()
        && bytes[*pos] == b'f'
        && bytes[*pos + 1] == b'a'
        && bytes[*pos + 2] == b'l'
        && bytes[*pos + 3] == b's'
        && bytes[*pos + 4] == b'e'
    {
        *pos += 5;
        return Ok(false);
    }

    Err(ParseError::InvalidBoolean)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_json_parsing() {
        let json = r#"[{"id":1,"value":123,"flag":false,"name":"a1"}]"#;
        let records = parse_json_string(json).expect("Failed to parse valid JSON");

        assert_eq!(records.len(), 1);
        assert_eq!(records[0].id, 1);
        assert_eq!(records[0].value, 123);
        assert!(!records[0].flag);
        assert_eq!(records[0].name, "a1");

        // Test empty array
        let empty_json = "[]";
        let empty_records = parse_json_string(empty_json).expect("Failed to parse empty array");
        assert_eq!(empty_records.len(), 0);

        // Test error cases
        assert!(parse_json_string("invalid").is_err());
        assert!(parse_json_string(r#"[{"id":1}]"#).is_err()); // Missing fields
    }
}
