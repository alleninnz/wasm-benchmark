package main

import (
	"testing"
	"unsafe"
)

// Test data generation with deterministic seed
func TestGenerateJsonRecords(t *testing.T) {
	tests := []struct {
		name     string
		count    int
		seed     uint32
		expected []JsonRecord
	}{
		{
			name:     "empty records",
			count:    0,
			seed:     12345,
			expected: []JsonRecord{},
		},
		{
			name:  "single record",
			count: 1,
			seed:  12345,
			expected: []JsonRecord{
				{ID: 1, Value: int32(linearCongruentialGeneratorTest(12345)), Flag: (linearCongruentialGeneratorTest(12345) & 1) == 0, Name: "a1"},
			},
		},
		{
			name:  "multiple records with seed 0",
			count: 3,
			seed:  0,
			expected: []JsonRecord{
				{ID: 1, Value: int32(linearCongruentialGeneratorTest(0)), Flag: (linearCongruentialGeneratorTest(0) & 1) == 0, Name: "a1"},
				{ID: 2, Value: int32(linearCongruentialGeneratorTest(1013904223)), Flag: (linearCongruentialGeneratorTest(1013904223) & 1) == 0, Name: "a2"},
				{ID: 3, Value: int32(linearCongruentialGeneratorTest(3204258894)), Flag: (linearCongruentialGeneratorTest(3204258894) & 1) == 0, Name: "a3"},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := generateJsonRecords(tt.count, tt.seed)

			if len(tt.expected) == 0 {
				if len(result) != 0 {
					t.Errorf("Expected empty slice, got %v", result)
				}
				return
			}

			if len(result) != len(tt.expected) {
				t.Errorf("Expected %d records, got %d", len(tt.expected), len(result))
				return
			}

			for i, expected := range tt.expected {
				if result[i].ID != expected.ID {
					t.Errorf("Record %d: expected ID %d, got %d", i, expected.ID, result[i].ID)
				}
				if result[i].Name != expected.Name {
					t.Errorf("Record %d: expected Name %s, got %s", i, expected.Name, result[i].Name)
				}
			}
		})
	}
}

// Helper function for testing LCG
func linearCongruentialGeneratorTest(seed uint32) uint32 {
	const multiplier uint32 = 1664525
	const increment uint32 = 1013904223
	return (seed * multiplier) + increment
}

// Test JSON serialization with various input sizes
func TestSerializeToJson(t *testing.T) {
	tests := []struct {
		name     string
		records  []JsonRecord
		expected string
	}{
		{
			name:     "empty array",
			records:  []JsonRecord{},
			expected: "[]",
		},
		{
			name: "single record",
			records: []JsonRecord{
				{ID: 1, Value: 12345, Flag: true, Name: "a1"},
			},
			expected: `[{"id":1,"value":12345,"flag":true,"name":"a1"}]`,
		},
		{
			name: "multiple records",
			records: []JsonRecord{
				{ID: 1, Value: 123, Flag: false, Name: "a1"},
				{ID: 2, Value: -456, Flag: true, Name: "a2"},
			},
			expected: `[{"id":1,"value":123,"flag":false,"name":"a1"},{"id":2,"value":-456,"flag":true,"name":"a2"}]`,
		},
		{
			name: "special characters in name",
			records: []JsonRecord{
				{ID: 1, Value: 0, Flag: false, Name: "test"},
			},
			expected: `[{"id":1,"value":0,"flag":false,"name":"test"}]`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := serializeToJson(tt.records)
			if result != tt.expected {
				t.Errorf("Expected: %s\nGot: %s", tt.expected, result)
			}
		})
	}
}

// Test JSON parsing with valid and invalid inputs
func TestParseJsonString(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		expected  []JsonRecord
		expectErr bool
	}{
		{
			name:      "empty string",
			input:     "",
			expected:  nil,
			expectErr: true,
		},
		{
			name:      "empty array",
			input:     "[]",
			expected:  []JsonRecord{},
			expectErr: false,
		},
		{
			name:      "array with whitespace",
			input:     " [ ] ",
			expected:  []JsonRecord{},
			expectErr: false,
		},
		{
			name:  "single record",
			input: `[{"id":1,"value":123,"flag":true,"name":"a1"}]`,
			expected: []JsonRecord{
				{ID: 1, Value: 123, Flag: true, Name: "a1"},
			},
			expectErr: false,
		},
		{
			name:  "multiple records with whitespace",
			input: `[ {"id": 1, "value": 123, "flag": false, "name": "a1"} , {"id": 2, "value": -456, "flag": true, "name": "a2"} ]`,
			expected: []JsonRecord{
				{ID: 1, Value: 123, Flag: false, Name: "a1"},
				{ID: 2, Value: -456, Flag: true, Name: "a2"},
			},
			expectErr: false,
		},
		{
			name:      "invalid JSON - missing bracket",
			input:     `{"id":1,"value":123,"flag":true,"name":"a1"}`,
			expected:  nil,
			expectErr: true,
		},
		{
			name:      "invalid JSON - malformed object",
			input:     `[{"id":1,"value":123,"flag":true}]`,
			expected:  nil,
			expectErr: true,
		},
		{
			name:      "invalid JSON - wrong field type",
			input:     `[{"id":"not_a_number","value":123,"flag":true,"name":"a1"}]`,
			expected:  nil,
			expectErr: true,
		},
		{
			name:      "invalid JSON - unknown field",
			input:     `[{"id":1,"value":123,"flag":true,"name":"a1","extra":"field"}]`,
			expected:  nil,
			expectErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := parseJsonString(tt.input)

			if tt.expectErr {
				if err == nil {
					t.Errorf("Expected error, but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if len(result) != len(tt.expected) {
				t.Errorf("Expected %d records, got %d", len(tt.expected), len(result))
				return
			}

			for i, expected := range tt.expected {
				if result[i] != expected {
					t.Errorf("Record %d: expected %+v, got %+v", i, expected, result[i])
				}
			}
		})
	}
}

// Test string parsing with escape sequences
func TestParseJsonStringValue(t *testing.T) {
	tests := []struct {
		name        string
		input       []rune
		pos         int
		expected    string
		expectedPos int
		expectErr   bool
	}{
		{
			name:        "simple string",
			input:       []rune(`"hello"`),
			pos:         0,
			expected:    "hello",
			expectedPos: 7,
			expectErr:   false,
		},
		{
			name:        "empty string",
			input:       []rune(`""`),
			pos:         0,
			expected:    "",
			expectedPos: 2,
			expectErr:   false,
		},
		{
			name:        "string with escaped quote",
			input:       []rune(`"hello \"world\""`),
			pos:         0,
			expected:    `hello "world"`,
			expectedPos: 17,
			expectErr:   false,
		},
		{
			name:        "string with escaped backslash",
			input:       []rune(`"path\\to\\file"`),
			pos:         0,
			expected:    `path\to\file`,
			expectedPos: 16,
			expectErr:   false,
		},
		{
			name:        "unterminated string",
			input:       []rune(`"hello`),
			pos:         0,
			expected:    "",
			expectedPos: 0,
			expectErr:   true,
		},
		{
			name:        "no opening quote",
			input:       []rune(`hello"`),
			pos:         0,
			expected:    "",
			expectedPos: 0,
			expectErr:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pos := tt.pos
			result, err := parseJsonStringValue(tt.input, &pos)

			if tt.expectErr {
				if err == nil {
					t.Errorf("Expected error, but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if result != tt.expected {
				t.Errorf("Expected: %s, Got: %s", tt.expected, result)
			}

			if pos != tt.expectedPos {
				t.Errorf("Expected position %d, got %d", tt.expectedPos, pos)
			}
		})
	}
}

// Test number parsing with positive and negative values
func TestParseJsonNumber(t *testing.T) {
	tests := []struct {
		name        string
		input       []rune
		pos         int
		expected    int32
		expectedPos int
		expectErr   bool
	}{
		{
			name:        "positive integer",
			input:       []rune("123"),
			pos:         0,
			expected:    123,
			expectedPos: 3,
			expectErr:   false,
		},
		{
			name:        "negative integer",
			input:       []rune("-456"),
			pos:         0,
			expected:    -456,
			expectedPos: 4,
			expectErr:   false,
		},
		{
			name:        "zero",
			input:       []rune("0"),
			pos:         0,
			expected:    0,
			expectedPos: 1,
			expectErr:   false,
		},
		{
			name:        "large positive number",
			input:       []rune("2147483647"),
			pos:         0,
			expected:    2147483647,
			expectedPos: 10,
			expectErr:   false,
		},
		{
			name:        "large negative number",
			input:       []rune("-2147483648"),
			pos:         0,
			expected:    -2147483648,
			expectedPos: 11,
			expectErr:   false,
		},
		{
			name:        "invalid - no digits",
			input:       []rune("-"),
			pos:         0,
			expected:    0,
			expectedPos: 0,
			expectErr:   true,
		},
		{
			name:        "invalid - not a number",
			input:       []rune("abc"),
			pos:         0,
			expected:    0,
			expectedPos: 0,
			expectErr:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pos := tt.pos
			result, err := parseJsonNumber(tt.input, &pos)

			if tt.expectErr {
				if err == nil {
					t.Errorf("Expected error, but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if result != tt.expected {
				t.Errorf("Expected: %d, Got: %d", tt.expected, result)
			}

			if pos != tt.expectedPos {
				t.Errorf("Expected position %d, got %d", tt.expectedPos, pos)
			}
		})
	}
}

// Test boolean parsing
func TestParseJsonBoolean(t *testing.T) {
	tests := []struct {
		name        string
		input       []rune
		pos         int
		expected    bool
		expectedPos int
		expectErr   bool
	}{
		{
			name:        "true value",
			input:       []rune("true"),
			pos:         0,
			expected:    true,
			expectedPos: 4,
			expectErr:   false,
		},
		{
			name:        "false value",
			input:       []rune("false"),
			pos:         0,
			expected:    false,
			expectedPos: 5,
			expectErr:   false,
		},
		{
			name:        "invalid boolean",
			input:       []rune("maybe"),
			pos:         0,
			expected:    false,
			expectedPos: 0,
			expectErr:   true,
		},
		{
			name:        "partial true",
			input:       []rune("tru"),
			pos:         0,
			expected:    false,
			expectedPos: 0,
			expectErr:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pos := tt.pos
			result, err := parseJsonBoolean(tt.input, &pos)

			if tt.expectErr {
				if err == nil {
					t.Errorf("Expected error, but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if result != tt.expected {
				t.Errorf("Expected: %t, Got: %t", tt.expected, result)
			}

			if pos != tt.expectedPos {
				t.Errorf("Expected position %d, got %d", tt.expectedPos, pos)
			}
		})
	}
}

// Test FNV-1a hash calculation
func TestFnv1aHashRecords(t *testing.T) {
	tests := []struct {
		name     string
		records  []JsonRecord
		expected uint32
	}{
		{
			name:     "empty records",
			records:  []JsonRecord{},
			expected: 2166136261, // FNV offset basis
		},
		{
			name: "single record",
			records: []JsonRecord{
				{ID: 1, Value: 123, Flag: true, Name: "a1"},
			},
			expected: calculateExpectedHash([]JsonRecord{{ID: 1, Value: 123, Flag: true, Name: "a1"}}),
		},
		{
			name: "multiple records",
			records: []JsonRecord{
				{ID: 1, Value: 123, Flag: false, Name: "a1"},
				{ID: 2, Value: -456, Flag: true, Name: "a2"},
			},
			expected: calculateExpectedHash([]JsonRecord{
				{ID: 1, Value: 123, Flag: false, Name: "a1"},
				{ID: 2, Value: -456, Flag: true, Name: "a2"},
			}),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := fnv1aHashRecords(tt.records)
			if result != tt.expected {
				t.Errorf("Expected hash %d, got %d", tt.expected, result)
			}
		})
	}
}

// Helper function to calculate expected hash for testing
func calculateExpectedHash(records []JsonRecord) uint32 {
	const fnvOffsetBasis uint32 = 2166136261
	const fnvPrime uint32 = 16777619

	hash := fnvOffsetBasis

	for _, record := range records {
		// Hash ID field
		id := record.ID
		hash ^= uint32(id & 0xFF)
		hash *= fnvPrime
		hash ^= uint32((id >> 8) & 0xFF)
		hash *= fnvPrime
		hash ^= uint32((id >> 16) & 0xFF)
		hash *= fnvPrime
		hash ^= uint32((id >> 24) & 0xFF)
		hash *= fnvPrime

		// Hash Value field
		value := uint32(record.Value)
		hash ^= uint32(value & 0xFF)
		hash *= fnvPrime
		hash ^= uint32((value >> 8) & 0xFF)
		hash *= fnvPrime
		hash ^= uint32((value >> 16) & 0xFF)
		hash *= fnvPrime
		hash ^= uint32((value >> 24) & 0xFF)
		hash *= fnvPrime

		// Hash Flag field
		var flagByte uint32 = 0
		if record.Flag {
			flagByte = 1
		}
		hash ^= flagByte
		hash *= fnvPrime

		// Hash Name field
		nameBytes := []byte(record.Name)
		for _, b := range nameBytes {
			hash ^= uint32(b)
			hash *= fnvPrime
		}
	}

	return hash
}

// Test Linear Congruential Generator
func TestLinearCongruentialGenerator(t *testing.T) {
	tests := []struct {
		name     string
		seed     uint32
		expected uint32
	}{
		{
			name:     "seed 0",
			seed:     0,
			expected: 1013904223,
		},
		{
			name:     "seed 1",
			seed:     1,
			expected: 1015568748,
		},
		{
			name:     "large seed",
			seed:     4294967295, // max uint32
			expected: 1012239698,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			seed := tt.seed
			result := linearCongruentialGenerator(&seed)
			if result != tt.expected {
				t.Errorf("Expected %d, got %d", tt.expected, result)
			}
			if seed != tt.expected {
				t.Errorf("Expected seed to be updated to %d, got %d", tt.expected, seed)
			}
		})
	}
}

// Test complete round-trip: generate -> serialize -> parse -> hash
func TestCompleteRoundTrip(t *testing.T) {
	tests := []struct {
		name  string
		count int
		seed  uint32
	}{
		{
			name:  "small dataset",
			count: 5,
			seed:  12345,
		},
		{
			name:  "medium dataset",
			count: 100,
			seed:  67890,
		},
		{
			name:  "edge case - seed 0",
			count: 10,
			seed:  0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Generate original records
			originalRecords := generateJsonRecords(tt.count, tt.seed)
			if len(originalRecords) != tt.count {
				t.Fatalf("Expected %d records, got %d", tt.count, len(originalRecords))
			}

			// Serialize to JSON
			jsonStr := serializeToJson(originalRecords)
			if jsonStr == "" {
				t.Fatalf("Serialization failed")
			}

			// Parse JSON back to records
			parsedRecords, err := parseJsonString(jsonStr)
			if err != nil {
				t.Fatalf("Parsing failed: %v", err)
			}

			// Verify record count matches
			if len(parsedRecords) != len(originalRecords) {
				t.Fatalf("Parsed record count mismatch: expected %d, got %d", len(originalRecords), len(parsedRecords))
			}

			// Verify all fields match exactly
			for i, original := range originalRecords {
				parsed := parsedRecords[i]
				if original.ID != parsed.ID {
					t.Errorf("Record %d ID mismatch: expected %d, got %d", i, original.ID, parsed.ID)
				}
				if original.Value != parsed.Value {
					t.Errorf("Record %d Value mismatch: expected %d, got %d", i, original.Value, parsed.Value)
				}
				if original.Flag != parsed.Flag {
					t.Errorf("Record %d Flag mismatch: expected %t, got %t", i, original.Flag, parsed.Flag)
				}
				if original.Name != parsed.Name {
					t.Errorf("Record %d Name mismatch: expected %s, got %s", i, original.Name, parsed.Name)
				}
			}

			// Verify hash consistency
			originalHash := fnv1aHashRecords(originalRecords)
			parsedHash := fnv1aHashRecords(parsedRecords)
			if originalHash != parsedHash {
				t.Errorf("Hash mismatch: original %d, parsed %d", originalHash, parsedHash)
			}
		})
	}
}

// Test WebAssembly interface functions
func TestWebAssemblyInterface(t *testing.T) {
	// Test init function
	init_wasm(42)
	if globalSeed != 42 {
		t.Errorf("Expected globalSeed to be 42, got %d", globalSeed)
	}

	// Test alloc function
	ptr := alloc(128)
	if ptr == 0 {
		t.Errorf("Expected non-zero pointer, got 0")
	}

	// Test parseParams function
	params := JsonParseParams{RecordCount: 5, Seed: 12345}
	ptr = uintptr(unsafe.Pointer(&params))
	parsedParams := parseParams(ptr)
	if parsedParams == nil {
		t.Errorf("Expected non-nil params, got nil")
	} else {
		if parsedParams.RecordCount != 5 {
			t.Errorf("Expected RecordCount 5, got %d", parsedParams.RecordCount)
		}
		if parsedParams.Seed != 12345 {
			t.Errorf("Expected Seed 12345, got %d", parsedParams.Seed)
		}
	}

	// Test runTask function with valid parameters
	result := runTask(ptr)
	if result == 0 {
		t.Errorf("Expected non-zero hash result, got 0")
	}

	// Test runTask with null pointer
	result = runTask(0)
	if result != 0 {
		t.Errorf("Expected 0 for null pointer, got %d", result)
	}
}

// Benchmark tests for performance measurement
func BenchmarkGenerateJsonRecords(b *testing.B) {
	for i := 0; i < b.N; i++ {
		generateJsonRecords(100, 12345)
	}
}

func BenchmarkSerializeToJson(b *testing.B) {
	records := generateJsonRecords(100, 12345)
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		serializeToJson(records)
	}
}

func BenchmarkParseJsonString(b *testing.B) {
	records := generateJsonRecords(100, 12345)
	jsonStr := serializeToJson(records)
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		parseJsonString(jsonStr)
	}
}

func BenchmarkFnv1aHashRecords(b *testing.B) {
	records := generateJsonRecords(100, 12345)
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		fnv1aHashRecords(records)
	}
}

func BenchmarkCompleteRoundTrip(b *testing.B) {
	for i := 0; i < b.N; i++ {
		records := generateJsonRecords(100, 12345)
		jsonStr := serializeToJson(records)
		parsedRecords, _ := parseJsonString(jsonStr)
		fnv1aHashRecords(parsedRecords)
	}
}
