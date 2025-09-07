// Data structures and types for JSON parsing benchmark

use std::fmt;

/// JSON record structure for benchmark testing
#[derive(Debug, Clone, PartialEq)]
pub struct JsonRecord {
    pub id: u32,
    pub value: i32,
    pub flag: bool,
    pub name: String,
}

/// Parsing error types with descriptive context
#[derive(Debug, Clone, PartialEq)]
pub enum ParseError {
    UnexpectedEndOfInput,
    InvalidNumber { message: &'static str },
    InvalidString { message: &'static str },
    InvalidBoolean,
    MissingField { field: &'static str },
    UnknownField { field: String },
    InvalidArrayFormat,
    InvalidObjectFormat,
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ParseError::UnexpectedEndOfInput => write!(f, "Unexpected end of input"),
            ParseError::InvalidNumber { message } => write!(f, "Invalid number: {}", message),
            ParseError::InvalidString { message } => write!(f, "Invalid string: {}", message),
            ParseError::InvalidBoolean => write!(f, "Invalid boolean value"),
            ParseError::MissingField { field } => write!(f, "Missing required field: {}", field),
            ParseError::UnknownField { field } => write!(f, "Unknown field: {}", field),
            ParseError::InvalidArrayFormat => write!(f, "Invalid array format"),
            ParseError::InvalidObjectFormat => write!(f, "Invalid object format"),
        }
    }
}

/// Constants for improved maintainability and performance
pub const JSON_FIELD_ESTIMATE: usize = 45; // Estimated chars per JSON record
pub const FNV_OFFSET_BASIS: u32 = 2166136261;
pub const FNV_PRIME: u32 = 16777619;
pub const LCG_MULTIPLIER: u32 = 1664525;
pub const LCG_INCREMENT: u32 = 1013904223;
