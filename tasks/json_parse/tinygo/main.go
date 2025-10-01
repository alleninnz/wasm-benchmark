package main

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"unsafe"
)

// Constants for improved maintainability and performance
const (
	// FNV-1a hash algorithm constants
	fnvOffsetBasis uint32 = 2166136261
	fnvPrime       uint32 = 16777619

	// Field bitmasks for JSON object validation
	fieldMaskID    uint8 = 1 << 0 // 0001
	fieldMaskValue uint8 = 1 << 1 // 0010
	fieldMaskFlag  uint8 = 1 << 2 // 0100
	fieldMaskName  uint8 = 1 << 3 // 1000
	fieldMaskAll   uint8 = 15     // 1111 (all 4 fields)

	// Linear Congruential Generator constants
	lcgMultiplier uint32 = 1664525
	lcgIncrement  uint32 = 1013904223

	// JSON parsing constants
	namePrefix = "a" // Prefix for generated names
)

// Global seed for reproducible random number generation
var globalSeed uint32

// WebAssembly C-style interface exports

//go:export init
func init_wasm(seed uint32) {
	// Initialize random number generator with provided seed
	// This ensures reproducible test data generation across runs
	globalSeed = seed
}

//go:export alloc
func alloc(nBytes uint32) uintptr {
	// Allocate memory buffer of specified size for parameter passing
	// Returns pointer to allocated memory block
	buf := make([]byte, nBytes)
	return uintptr(unsafe.Pointer(&buf[0]))
}

//go:export run_task
func runTask(paramsPtr uintptr) uint32 {
	// Main entry point for JSON parsing benchmark
	// Returns FNV-1a hash of parsed data for verification

	// Parse input parameters from memory pointer
	params := parseParams(paramsPtr)
	if params == nil {
		return 0 // Error: invalid parameters
	}

	// Generate reproducible test data using provided seed
	records := generateJsonRecords(int(params.RecordCount), params.Seed)
	// Note: Empty arrays are valid (when RecordCount is 0)

	// Serialize records to compact JSON format
	jsonStr := serializeToJson(records)
	// Note: Empty arrays serialize to "[]" which is valid

	// Parse JSON string back to verify round-trip correctness
	parsedRecords, err := parseJsonString(jsonStr)
	if err != nil || len(parsedRecords) != len(records) {
		return 0 // Error: parsing failed or count mismatch
	}

	// Compute FNV-1a hash of parsed results for verification
	hash := fnv1aHashRecords(parsedRecords)
	return hash
}

// Data structures for JSON records
type JsonRecord struct {
	ID    uint32 `json:"id"`    // Sequential identifier starting from 1
	Value int32  `json:"value"` // Pseudo-random integer value
	Flag  bool   `json:"flag"`  // Boolean derived from value (even = true)
	Name  string `json:"name"`  // String pattern "a{id}"
}

// Parameters structure for parsing from memory
type JsonParseParams struct {
	RecordCount uint32 // Number of JSON objects to generate and parse
	Seed        uint32 // Seed for reproducible random data generation
}

// Parse parameters from WebAssembly memory pointer
func parseParams(ptr uintptr) *JsonParseParams {
	if ptr == 0 {
		return nil
	}
	return (*JsonParseParams)(unsafe.Pointer(ptr))
}

// Generate array of JSON record objects with deterministic pseudo-random values
func generateJsonRecords(count int, seed uint32) []JsonRecord {
	if count <= 0 {
		return []JsonRecord{} // Return empty slice, not nil
	}

	records := make([]JsonRecord, count)
	rng := seed

	for i := 0; i < count; i++ {
		// Generate next pseudo-random value using LCG
		rng = linearCongruentialGenerator(&rng)

		records[i] = JsonRecord{
			ID:    uint32(i + 1),          // Sequential ID starting from 1
			Value: int32(rng),             // Pseudo-random signed integer
			Flag:  (rng & 1) == 0,         // Boolean: true if even, false if odd
			Name:  buildNameString(i + 1), // Optimized string pattern: "a1", "a2", etc.
		}
	}

	return records
}

// Convert record array to compact JSON string format with optimized string building
func serializeToJson(records []JsonRecord) string {
	if len(records) == 0 {
		return "[]"
	}

	var builder strings.Builder
	// Pre-allocate approximate capacity to reduce reallocations
	builder.Grow(len(records) * 50) // Estimate ~50 chars per record

	builder.WriteByte('[')

	for i, record := range records {
		if i > 0 {
			builder.WriteByte(',')
		}

		// Build compact JSON object with direct string operations (faster than fmt.Sprintf)
		builder.WriteString(`{"id":`)
		writeUint32(&builder, record.ID)
		builder.WriteString(`,"value":`)
		writeInt32(&builder, record.Value)
		builder.WriteString(`,"flag":`)
		writeBool(&builder, record.Flag)
		builder.WriteString(`,"name":"`)
		builder.WriteString(record.Name)
		builder.WriteString(`"}`)
	}

	builder.WriteByte(']')
	return builder.String()
}

// Parse JSON string to JsonRecord objects with optimized byte-based parsing
func parseJsonString(jsonStr string) ([]JsonRecord, error) {
	if jsonStr == "" {
		return nil, errors.New("empty JSON string")
	}

	bytes := []byte(jsonStr)
	pos := 0

	// Skip leading whitespace
	skipWhitespace(bytes, &pos)

	if pos >= len(bytes) || bytes[pos] != '[' {
		return nil, errors.New("expected '[' at start of JSON array")
	}

	return parseJsonArray(bytes, &pos)
}

// Skip whitespace characters in JSON parsing
func skipWhitespace(bytes []byte, pos *int) {
	for *pos < len(bytes) {
		ch := bytes[*pos]
		if ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r' {
			*pos++
		} else {
			break
		}
	}
}

// Parse JSON array starting with '[' character with pre-allocation
func parseJsonArray(bytes []byte, pos *int) ([]JsonRecord, error) {
	// Consume opening '['
	*pos++
	skipWhitespace(bytes, pos)

	// Pre-allocate slice based on estimated capacity
	estimatedCapacity := len(bytes) / 50 // Estimate ~50 bytes per record
	records := make([]JsonRecord, 0, estimatedCapacity)

	// Handle empty array
	if *pos < len(bytes) && bytes[*pos] == ']' {
		*pos++
		return records, nil
	}

	// Parse array elements
	for {
		record, err := parseJsonObject(bytes, pos)
		if err != nil {
			return nil, fmt.Errorf("failed to parse object: %v", err)
		}

		records = append(records, record)

		skipWhitespace(bytes, pos)
		if *pos >= len(bytes) {
			return nil, errors.New("unexpected end of JSON array")
		}

		ch := bytes[*pos]
		if ch == ']' {
			*pos++ // Consume closing ']'
			break
		} else if ch == ',' {
			*pos++ // Consume comma separator
			skipWhitespace(bytes, pos)
		} else {
			return nil, fmt.Errorf("expected ',' or ']', got '%c'", ch)
		}
	}

	return records, nil
}

// Parse single JSON object starting with '{' character
func parseJsonObject(bytes []byte, pos *int) (JsonRecord, error) {
	skipWhitespace(bytes, pos)

	if *pos >= len(bytes) || bytes[*pos] != '{' {
		return JsonRecord{}, errors.New("expected '{' at start of JSON object")
	}

	*pos++ // Consume opening '{'
	skipWhitespace(bytes, pos)

	var record JsonRecord
	var fieldsFound uint8 = 0 // Track which fields we've parsed using bitmask

	// Parse object fields
	for {
		// Parse field name
		fieldName, err := parseJsonStringValue(bytes, pos)
		if err != nil {
			return JsonRecord{}, fmt.Errorf("failed to parse field name: %v", err)
		}

		skipWhitespace(bytes, pos)
		if *pos >= len(bytes) || bytes[*pos] != ':' {
			return JsonRecord{}, errors.New("expected ':' after field name")
		}
		*pos++ // Consume ':'
		skipWhitespace(bytes, pos)

		// Parse field value based on field name
		switch fieldName {
		case "id":
			if fieldsFound&fieldMaskID != 0 {
				return JsonRecord{}, errors.New("duplicate id field")
			}
			value, err := parseJsonNumber(bytes, pos)
			if err != nil {
				return JsonRecord{}, fmt.Errorf("failed to parse id field: %v", err)
			}
			record.ID = uint32(value)
			fieldsFound |= fieldMaskID

		case "value":
			if fieldsFound&fieldMaskValue != 0 {
				return JsonRecord{}, errors.New("duplicate value field")
			}
			value, err := parseJsonNumber(bytes, pos)
			if err != nil {
				return JsonRecord{}, fmt.Errorf("failed to parse value field: %v", err)
			}
			record.Value = value
			fieldsFound |= fieldMaskValue

		case "flag":
			if fieldsFound&fieldMaskFlag != 0 {
				return JsonRecord{}, errors.New("duplicate flag field")
			}
			flag, err := parseJsonBoolean(bytes, pos)
			if err != nil {
				return JsonRecord{}, fmt.Errorf("failed to parse flag field: %v", err)
			}
			record.Flag = flag
			fieldsFound |= fieldMaskFlag

		case "name":
			if fieldsFound&fieldMaskName != 0 {
				return JsonRecord{}, errors.New("duplicate name field")
			}
			name, err := parseJsonStringValue(bytes, pos)
			if err != nil {
				return JsonRecord{}, fmt.Errorf("failed to parse name field: %v", err)
			}
			record.Name = name
			fieldsFound |= fieldMaskName

		default:
			return JsonRecord{}, fmt.Errorf("unknown field: %s", fieldName)
		}

		skipWhitespace(bytes, pos)
		if *pos >= len(bytes) {
			return JsonRecord{}, errors.New("unexpected end of JSON object")
		}

		ch := bytes[*pos]
		if ch == '}' {
			*pos++ // Consume closing '}'
			break
		} else if ch == ',' {
			*pos++ // Consume comma separator
			skipWhitespace(bytes, pos)
		} else {
			return JsonRecord{}, fmt.Errorf("expected ',' or '}', got '%c'", ch)
		}
	}

	// Validate that all required fields were found
	if fieldsFound != fieldMaskAll {
		return JsonRecord{}, errors.New("missing required fields in JSON object")
	}

	return record, nil
}

// Parse JSON string value enclosed in quotes with zero-copy optimization
func parseJsonStringValue(bytes []byte, pos *int) (string, error) {
	if *pos >= len(bytes) || bytes[*pos] != '"' {
		return "", errors.New("expected '\"' at start of string")
	}

	*pos++ // Skip opening quote
	start := *pos
	hasEscapes := false

	// Fast scan to find closing quote and detect escapes
	for *pos < len(bytes) {
		ch := bytes[*pos]
		if ch == '"' {
			// Found closing quote
			if !hasEscapes {
				// Zero-copy path: no escapes, use slice directly
				result := string(bytes[start:*pos])
				*pos++
				return result, nil
			}
			*pos++
			break
		} else if ch == '\\' {
			hasEscapes = true
			*pos++
			if *pos >= len(bytes) {
				return "", errors.New("incomplete escape sequence")
			}
			*pos++
		} else {
			*pos++
		}
	}

	if !hasEscapes {
		return "", errors.New("unterminated string")
	}

	// Process string with escapes
	var builder strings.Builder
	i := start

	for i < *pos-1 {
		ch := bytes[i]
		if ch == '\\' {
			i++
			if i >= *pos-1 {
				break
			}
			escaped := bytes[i]
			switch escaped {
			case '"', '\\', '/':
				builder.WriteByte(escaped)
			case 'n':
				builder.WriteByte('\n')
			case 't':
				builder.WriteByte('\t')
			case 'r':
				builder.WriteByte('\r')
			default:
				return "", fmt.Errorf("invalid escape sequence: \\%c", escaped)
			}
		} else {
			builder.WriteByte(ch)
		}
		i++
	}

	return builder.String(), nil
}

// Parse JSON number value with manual digit parsing (no allocation)
func parseJsonNumber(bytes []byte, pos *int) (int32, error) {
	if *pos >= len(bytes) {
		return 0, errors.New("unexpected end of input")
	}

	var result int64 = 0
	negative := false

	// Handle optional negative sign
	if bytes[*pos] == '-' {
		negative = true
		*pos++
	}

	if *pos >= len(bytes) || bytes[*pos] < '0' || bytes[*pos] > '9' {
		return 0, errors.New("expected digit")
	}

	// Parse digits manually
	for *pos < len(bytes) && bytes[*pos] >= '0' && bytes[*pos] <= '9' {
		digit := int64(bytes[*pos] - '0')

		// Check for overflow
		if result > (9223372036854775807-digit)/10 {
			return 0, errors.New("number overflow")
		}

		result = result*10 + digit
		*pos++
	}

	if negative {
		result = -result
	}

	// Check if value fits in int32
	if result < -2147483648 || result > 2147483647 {
		return 0, errors.New("number out of range")
	}

	return int32(result), nil
}

// Parse JSON boolean value (true or false) with byte-based comparison
func parseJsonBoolean(bytes []byte, pos *int) (bool, error) {
	// Check for "true" without creating temporary string
	if *pos+4 <= len(bytes) &&
		bytes[*pos] == 't' && bytes[*pos+1] == 'r' &&
		bytes[*pos+2] == 'u' && bytes[*pos+3] == 'e' {
		*pos += 4
		return true, nil
	}

	// Check for "false" without creating temporary string
	if *pos+5 <= len(bytes) &&
		bytes[*pos] == 'f' && bytes[*pos+1] == 'a' &&
		bytes[*pos+2] == 'l' && bytes[*pos+3] == 's' && bytes[*pos+4] == 'e' {
		*pos += 5
		return false, nil
	}

	return false, errors.New("invalid boolean value")
}

// Compute FNV-1a hash of all record fields for verification (optimized version)
func fnv1aHashRecords(records []JsonRecord) uint32 {
	hash := fnvOffsetBasis

	for _, record := range records {
		// Hash ID field (4 bytes, little-endian) - using optimized helper
		hashUint32(&hash, record.ID)

		// Hash Value field (4 bytes, little-endian, signed) - using optimized helper
		hashUint32(&hash, uint32(record.Value))

		// Hash Flag field (1 byte: 1 for true, 0 for false)
		flagByte := uint32(0)
		if record.Flag {
			flagByte = 1
		}
		hash ^= flagByte
		hash *= fnvPrime

		// Hash Name field (UTF-8 bytes) - using optimized helper
		nameBytes := []byte(record.Name)
		hashBytes(&hash, nameBytes)
	}

	return hash
}

// Linear Congruential Generator for reproducible pseudo-random numbers
func linearCongruentialGenerator(seed *uint32) uint32 {
	// Using predefined constants for consistency and maintainability
	*seed = (*seed * lcgMultiplier) + lcgIncrement
	return *seed
}

// Optimized helper functions for string building and parsing

// Build name string efficiently without fmt.Sprintf
func buildNameString(id int) string {
	if id < 10 {
		// Fast path for single digits (most common case)
		return namePrefix + string(rune('0'+id))
	}

	var builder strings.Builder
	builder.Grow(8) // Pre-allocate for small names
	builder.WriteString(namePrefix)
	writeInt(&builder, id)
	return builder.String()
}

// Write unsigned 32-bit integer directly to builder (faster than fmt.Sprintf)
func writeUint32(builder *strings.Builder, value uint32) {
	builder.WriteString(strconv.FormatUint(uint64(value), 10))
}

// Write signed 32-bit integer directly to builder
func writeInt32(builder *strings.Builder, value int32) {
	builder.WriteString(strconv.FormatInt(int64(value), 10))
}

// Write integer directly to builder
func writeInt(builder *strings.Builder, value int) {
	builder.WriteString(strconv.Itoa(value))
}

// Write boolean directly to builder
func writeBool(builder *strings.Builder, value bool) {
	if value {
		builder.WriteString("true")
	} else {
		builder.WriteString("false")
	}
}

// Hash a 32-bit value using FNV-1a algorithm (optimized helper)
func hashUint32(hash *uint32, value uint32) {
	*hash ^= uint32(value & 0xFF)
	*hash *= fnvPrime
	*hash ^= uint32((value >> 8) & 0xFF)
	*hash *= fnvPrime
	*hash ^= uint32((value >> 16) & 0xFF)
	*hash *= fnvPrime
	*hash ^= uint32((value >> 24) & 0xFF)
	*hash *= fnvPrime
}

// Hash bytes using FNV-1a algorithm (optimized helper)
func hashBytes(hash *uint32, bytes []byte) {
	for _, b := range bytes {
		*hash ^= uint32(b)
		*hash *= fnvPrime
	}
}

// Required for TinyGo WebAssembly compilation
func main() {
	// Empty main function required for compilation
}
