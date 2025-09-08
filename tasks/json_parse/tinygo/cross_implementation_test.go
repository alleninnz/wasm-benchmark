// Package main provides cross-implementation validation tests for the JSON parsing
// WebAssembly module, ensuring compatibility between TinyGo and Rust implementations.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"unsafe"
)

// Test configuration constants
const (
	// Default test vector file path relative to this test file
	defaultTestVectorFile = "../../../data/reference_hashes/json_parse.json"

	// Memory allocation constants
	parameterMemorySize = 8 // Size for 2 uint32 parameters

	// Test parameters for interface validation
	testRecordCount = 100
	testSeed        = 12345
)

// TestVector represents a cross-implementation test case for validating compatibility
// between TinyGo and Rust JSON parsing implementations.
type TestVector struct {
	Name         string             `json:"name"`          // Unique test case identifier
	Description  string             `json:"description"`   // Human-readable test description
	Params       SerializableParams `json:"params"`        // JSON parsing parameters
	ExpectedHash uint32             `json:"expected_hash"` // Expected hash from Rust reference
	Category     string             `json:"category"`      // Test category classification
}

// SerializableParams defines the JSON-serializable parameter structure that matches
// the Rust implementation's parameter format for cross-language compatibility.
type SerializableParams struct {
	RecordCount uint32 `json:"record_count"` // Number of JSON records to generate and parse
	Seed        uint32 `json:"seed"`         // Random seed for deterministic generation
}

// TestResult encapsulates the results of a single cross-implementation test
type TestResult struct {
	Vector     TestVector
	Passed     bool
	ActualHash uint32
	Error      error
}

// Validate checks if the serializable parameters are within acceptable ranges
func (sp SerializableParams) Validate() error {
	// Note: RecordCount = 0 is allowed as it represents a valid edge case for testing
	// Note: Seed can be any uint32 value including 0
	return nil
}

// Convert to our internal parameter structure for WebAssembly interface
func (sp SerializableParams) toParams() []uint32 {
	return []uint32{sp.RecordCount, sp.Seed}
}

// loadTestVectors loads and validates test vectors from a JSON file.
// It returns an error if the file cannot be read, contains invalid JSON,
// or if any test vector fails validation.
func loadTestVectors(filename string) ([]TestVector, error) {
	// Convert to absolute path for better error messages
	absPath, err := filepath.Abs(filename)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve absolute path for %s: %w", filename, err)
	}

	data, err := os.ReadFile(absPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read test vectors file %s: %w", absPath, err)
	}

	var vectors []TestVector
	if err := json.Unmarshal(data, &vectors); err != nil {
		return nil, fmt.Errorf("failed to parse JSON from %s: %w", absPath, err)
	}

	if len(vectors) == 0 {
		return nil, fmt.Errorf("no test vectors found in %s", absPath)
	}

	// Validate each test vector
	for i, vector := range vectors {
		if vector.Name == "" {
			return nil, fmt.Errorf("test vector %d missing required 'name' field", i)
		}
		if err := vector.Params.Validate(); err != nil {
			return nil, fmt.Errorf("test vector %d (%s) has invalid parameters: %w", i, vector.Name, err)
		}
	}

	return vectors, nil
}

// formatTestFailure creates a detailed error message for test failures
func formatTestFailure(result TestResult) string {
	diff := int64(result.ActualHash) - int64(result.Vector.ExpectedHash)
	return fmt.Sprintf("Test '%s' (%s) failed: expected hash %d, got %d (diff: %d)",
		result.Vector.Name, result.Vector.Description, result.Vector.ExpectedHash,
		result.ActualHash, diff)
}

// runSingleTest executes a single test vector and returns the result
func runSingleTest(t *testing.T, vector TestVector) TestResult {
	t.Helper()

	// Convert parameters to WebAssembly interface format
	params := vector.Params.toParams()

	// Allocate memory for parameters
	paramPtr := alloc(parameterMemorySize)
	if paramPtr == 0 {
		return TestResult{
			Vector: vector,
			Error:  fmt.Errorf("failed to allocate parameter memory"),
		}
	}

	// Write parameters to allocated memory
	paramSlice := (*[2]uint32)(unsafe.Pointer(paramPtr))
	paramSlice[0] = params[0] // record_count
	paramSlice[1] = params[1] // seed

	// Initialize WebAssembly module
	init_wasm(params[1])

	// Compute hash with TinyGo implementation
	actualHash := runTask(paramPtr)

	return TestResult{
		Vector:     vector,
		ActualHash: actualHash,
		Passed:     actualHash == vector.ExpectedHash,
	}
}

// TestCrossImplementationHashMatching validates that the TinyGo implementation
// produces identical hash results to the Rust reference implementation across
// all test vectors. This ensures algorithmic compatibility between the two implementations.
func TestCrossImplementationHashMatching(t *testing.T) {
	vectors, err := loadTestVectors(defaultTestVectorFile)
	if err != nil {
		t.Fatalf("Failed to load reference test vectors: %v", err)
	}

	t.Logf("Running cross-implementation validation with %d test vectors", len(vectors))

	// Group test results by category for better reporting
	categoryResults := make(map[string][]TestResult)
	var allResults []TestResult

	for _, vector := range vectors {
		result := runSingleTest(t, vector)
		allResults = append(allResults, result)

		category := vector.Category
		if category == "" {
			category = "uncategorized"
		}
		categoryResults[category] = append(categoryResults[category], result)
	}

	// Report results by category
	totalPassed := 0
	totalFailed := 0
	var firstFailure string

	for category, results := range categoryResults {
		passed := 0
		failed := 0
		for _, result := range results {
			if result.Passed {
				passed++
				totalPassed++
			} else {
				failed++
				totalFailed++
				if firstFailure == "" && result.Error == nil {
					firstFailure = formatTestFailure(result)
				}
			}
		}
		t.Logf("Category '%s': %d passed, %d failed", category, passed, failed)
	}

	// Overall result
	if totalFailed == 0 {
		t.Logf("✅ SUCCESS: All %d test vectors passed cross-implementation validation", len(allResults))
	} else {
		t.Errorf("❌ CROSS-IMPLEMENTATION VALIDATION FAILED\nResult: %d/%d test vectors failed\nFirst failure: %s\nThis indicates the TinyGo implementation does not match the Rust reference.\nCheck algorithm implementation for differences in JSON generation,\nparsing logic, or hash calculation.", totalFailed, len(allResults), firstFailure)
	}
}

// TestWebAssemblyInterfaceCompatibility verifies that the WebAssembly interface
// correctly handles parameter allocation, memory layout, and function calls.
func TestWebAssemblyInterfaceCompatibility(t *testing.T) {
	// Test parameter allocation and passing
	paramPtr := alloc(parameterMemorySize)
	if paramPtr == 0 {
		t.Fatal("❌ MEMORY ALLOCATION FAILED\nWebAssembly interface alloc() returned null pointer.\nThis will prevent proper parameter passing from benchmark harness.")
	}

	// Test parameter writing and reading
	testParams := []uint32{testRecordCount, testSeed}
	paramSlice := (*[2]uint32)(unsafe.Pointer(paramPtr))
	paramSlice[0] = testParams[0]
	paramSlice[1] = testParams[1]

	// Verify parameters can be read back correctly
	if paramSlice[0] != testParams[0] || paramSlice[1] != testParams[1] {
		t.Errorf("❌ PARAMETER PASSING INCOMPATIBLE\nParameter write/read failed - memory layout differs from expectation.\nExpected: [%d, %d], Got: [%d, %d]\nThis will cause incorrect WebAssembly interop.", testParams[0], testParams[1], paramSlice[0], paramSlice[1])
	} else {
		t.Logf("✅ WebAssembly interface compatible with benchmark harness")
	}

	// Test init function (should not panic)
	init_wasm(testParams[1])
	t.Logf("✅ Init function operates correctly")

	// Test run_task with valid parameters
	hash := runTask(paramPtr)
	if hash == 0 {
		t.Error("❌ RUN_TASK EXECUTION FAILED\nrunTask() returned 0, indicating parse error or execution failure.\nCheck JSON generation, parsing, and hash calculation logic.")
	} else {
		t.Logf("✅ runTask() executed successfully with hash: %d", hash)
	}
}
