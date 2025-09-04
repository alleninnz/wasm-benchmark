// JSON parsing implementation with comprehensive error handling

use crate::types::{JsonRecord, ParseError};

/// Parse JSON string to JsonRecord objects
pub fn parse_json_string(json: &str) -> Result<Vec<JsonRecord>, ParseError> {
    let chars: Vec<char> = json.chars().collect();
    let mut pos = 0;
    
    skip_whitespace(&chars, &mut pos);
    
    if pos >= chars.len() || chars[pos] != '[' {
        return Err(ParseError::InvalidArrayFormat);
    }
    
    parse_json_array(&chars, &mut pos)
}

fn skip_whitespace(chars: &[char], pos: &mut usize) {
    while *pos < chars.len() {
        match chars[*pos] {
            ' ' | '\t' | '\n' | '\r' => *pos += 1,
            _ => break,
        }
    }
}

fn parse_json_array(chars: &[char], pos: &mut usize) -> Result<Vec<JsonRecord>, ParseError> {
    *pos += 1; // Skip opening '['
    skip_whitespace(chars, pos);
    
    let mut records = Vec::new();
    
    // Handle empty array
    if *pos < chars.len() && chars[*pos] == ']' {
        *pos += 1;
        return Ok(records);
    }
    
    // Parse comma-separated objects
    loop {
        skip_whitespace(chars, pos);
        
        let record = parse_json_object(chars, pos)?;
        records.push(record);
        
        skip_whitespace(chars, pos);
        
        if *pos >= chars.len() {
            return Err(ParseError::UnexpectedEndOfInput);
        }
        
        match chars[*pos] {
            ',' => {
                *pos += 1;
                skip_whitespace(chars, pos);
                
                // Handle trailing comma
                if *pos < chars.len() && chars[*pos] == ']' {
                    *pos += 1;
                    break;
                }
            }
            ']' => {
                *pos += 1;
                break;
            }
            _ => return Err(ParseError::InvalidArrayFormat),
        }
    }
    
    Ok(records)
}

fn parse_json_object(chars: &[char], pos: &mut usize) -> Result<JsonRecord, ParseError> {
    skip_whitespace(chars, pos);
    
    if *pos >= chars.len() || chars[*pos] != '{' {
        return Err(ParseError::InvalidObjectFormat);
    }
    
    *pos += 1; // Skip opening '{'
    
    let mut id = None;
    let mut value = None;
    let mut flag = None;
    let mut name = None;
    
    skip_whitespace(chars, pos);
    
    // Handle empty object
    if *pos < chars.len() && chars[*pos] == '}' {
        *pos += 1;
        return Err(ParseError::InvalidObjectFormat);
    }
    
    // Parse key-value pairs
    loop {
        skip_whitespace(chars, pos);
        
        let key = parse_json_string_value(chars, pos)?;
        
        skip_whitespace(chars, pos);
        
        if *pos >= chars.len() || chars[*pos] != ':' {
            return Err(ParseError::InvalidObjectFormat);
        }
        *pos += 1;
        
        skip_whitespace(chars, pos);
        
        // Parse value based on field name
        match key.as_str() {
            "id" => {
                let parsed_id = parse_json_number(chars, pos)? as u32;
                id = Some(parsed_id);
            }
            "value" => {
                let parsed_value = parse_json_number(chars, pos)?;
                value = Some(parsed_value);
            }
            "flag" => {
                let parsed_flag = parse_json_boolean(chars, pos)?;
                flag = Some(parsed_flag);
            }
            "name" => {
                let parsed_name = parse_json_string_value(chars, pos)?;
                name = Some(parsed_name);
            }
            _ => return Err(ParseError::UnknownField { field: key }),
        }
        
        skip_whitespace(chars, pos);
        
        if *pos >= chars.len() {
            return Err(ParseError::UnexpectedEndOfInput);
        }
        
        match chars[*pos] {
            ',' => {
                *pos += 1;
            }
            '}' => {
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
    
    Ok(JsonRecord { id, value, flag, name })
}

pub fn parse_json_string_value(chars: &[char], pos: &mut usize) -> Result<String, ParseError> {
    skip_whitespace(chars, pos);
    
    if *pos >= chars.len() || chars[*pos] != '"' {
        return Err(ParseError::InvalidString { message: "Expected string starting with '\"'" });
    }
    
    *pos += 1; // Skip opening quote
    let mut result = String::new();
    
    while *pos < chars.len() {
        match chars[*pos] {
            '"' => {
                *pos += 1;
                return Ok(result);
            }
            '\\' => {
                *pos += 1;
                if *pos >= chars.len() {
                    return Err(ParseError::InvalidString { message: "Incomplete escape sequence" });
                }
                
                match chars[*pos] {
                    '"' => result.push('"'),
                    '\\' => result.push('\\'),
                    'n' => result.push('\n'),
                    'r' => result.push('\r'),
                    't' => result.push('\t'),
                    _ => return Err(ParseError::InvalidString { message: "Unsupported escape sequence" }),
                }
                *pos += 1;
            }
            c => {
                result.push(c);
                *pos += 1;
            }
        }
    }
    
    Err(ParseError::InvalidString { message: "Unterminated string" })
}

pub fn parse_json_number(chars: &[char], pos: &mut usize) -> Result<i32, ParseError> {
    skip_whitespace(chars, pos);
    
    if *pos >= chars.len() {
        return Err(ParseError::UnexpectedEndOfInput);
    }
    
    let mut result: i64 = 0;
    let mut negative = false;
    
    if chars[*pos] == '-' {
        negative = true;
        *pos += 1;
    }
    
    if *pos >= chars.len() || !chars[*pos].is_ascii_digit() {
        return Err(ParseError::InvalidNumber { message: "Expected digit" });
    }
    
    while *pos < chars.len() && chars[*pos].is_ascii_digit() {
        let digit = chars[*pos] as i64 - '0' as i64;
        
        if result > (i64::MAX - digit) / 10 {
            return Err(ParseError::InvalidNumber { message: "Number overflow" });
        }
        
        result = result * 10 + digit;
        *pos += 1;
    }
    
    let final_result = if negative { -result } else { result };
    
    if final_result < i32::MIN as i64 || final_result > i32::MAX as i64 {
        return Err(ParseError::InvalidNumber { message: "Number out of range" });
    }
    
    Ok(final_result as i32)
}

pub fn parse_json_boolean(chars: &[char], pos: &mut usize) -> Result<bool, ParseError> {
    skip_whitespace(chars, pos);
    
    if *pos >= chars.len() {
        return Err(ParseError::UnexpectedEndOfInput);
    }
    
    // Check for "true"
    if *pos + 4 <= chars.len() && 
       chars[*pos] == 't' && 
       chars[*pos + 1] == 'r' && 
       chars[*pos + 2] == 'u' && 
       chars[*pos + 3] == 'e' {
        *pos += 4;
        return Ok(true);
    }
    
    // Check for "false"
    if *pos + 5 <= chars.len() && 
       chars[*pos] == 'f' && 
       chars[*pos + 1] == 'a' && 
       chars[*pos + 2] == 'l' && 
       chars[*pos + 3] == 's' && 
       chars[*pos + 4] == 'e' {
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
        assert_eq!(records[0].flag, false);
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