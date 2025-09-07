package main

import (
	"encoding/json"
	"fmt"
	"os"
	"testing"
	"unsafe"
)

// TestVector represents a cross-implementation test case
type TestVector struct {
	Name         string             `json:"name"`
	Description  string             `json:"description"`
	Params       SerializableParams `json:"params"`
	ExpectedHash uint32             `json:"expected_hash"`
	Category     string             `json:"category"`
}

// SerializableParams matches the JSON structure from Rust
type SerializableParams struct {
	RecordCount uint32 `json:"record_count"`
	Seed        uint32 `json:"seed"`
}

// Convert to our internal parameter structure for WebAssembly interface
func (sp SerializableParams) toParams() []uint32 {
	return []uint32{sp.RecordCount, sp.Seed}
}

// Load test vectors from JSON file
func loadTestVectors(filename string) ([]TestVector, error) {
	data, err := os.ReadFile(filename)
	if err != nil {
		return nil, err
	}

	var vectors []TestVector
	err = json.Unmarshal(data, &vectors)
	if err != nil {
		return nil, err
	}

	return vectors, nil
}

// Test exact hash matching against Rust implementation
func TestCrossImplementationHashMatching(t *testing.T) {
	vectors, err := loadTestVectors("reference_hashes.json")
	if err != nil {
		t.Fatalf("Failed to load reference test vectors: %v", err)
	}

	totalTests := len(vectors)
	totalPassed := 0
	totalFailed := 0
	firstFailure := ""

	for _, vector := range vectors {
		// Convert parameters to WebAssembly interface format
		params := vector.Params.toParams()

		// Allocate memory for parameters (8 bytes for 2 uint32s)
		paramPtr := alloc(8)
		if paramPtr == 0 {
			t.Fatalf("Failed to allocate parameter memory for test '%s'", vector.Name)
		}

		// Write parameters to allocated memory
		paramSlice := (*[2]uint32)(unsafe.Pointer(paramPtr))
		paramSlice[0] = params[0] // record_count
		paramSlice[1] = params[1] // seed

		// Initialize (no-op but part of interface)
		init_wasm(params[1])

		// Compute hash with TinyGo implementation
		actualHash := runTask(paramPtr)

		if actualHash == vector.ExpectedHash {
			totalPassed++
		} else {
			totalFailed++
			if firstFailure == "" {
				firstFailure = fmt.Sprintf("Test '%s' (%s) failed: expected hash %d, got %d (diff: %d)",
					vector.Name, vector.Description, vector.ExpectedHash, actualHash, int64(actualHash)-int64(vector.ExpectedHash))
			}
		}
	}

	// Simple pass/fail result
	if totalFailed == 0 {
		t.Logf("✅ SUCCESS: All %d test vectors passed cross-implementation validation", totalTests)
	} else {
		t.Errorf("❌ CROSS-IMPLEMENTATION VALIDATION FAILED\n"+
			"Result: %d/%d test vectors failed\n"+
			"First failure: %s\n"+
			"This indicates the TinyGo implementation does not match the Rust reference.\n"+
			"Check algorithm implementation for differences in JSON generation,\n"+
			"parsing logic, or hash calculation.",
			totalFailed, totalTests, firstFailure)
	}
}

// Test WebAssembly interface parameter handling
func TestWebAssemblyInterfaceCompatibility(t *testing.T) {
	// Test parameter allocation and passing
	paramPtr := alloc(8)
	if paramPtr == 0 {
		t.Fatal("❌ MEMORY ALLOCATION FAILED\n" +
			"WebAssembly interface alloc() returned null pointer.\n" +
			"This will prevent proper parameter passing from benchmark harness.")
	}

	// Test parameter writing and reading
	testParams := []uint32{100, 12345} // record_count=100, seed=12345
	paramSlice := (*[2]uint32)(unsafe.Pointer(paramPtr))
	paramSlice[0] = testParams[0]
	paramSlice[1] = testParams[1]

	// Verify parameters can be read back correctly
	if paramSlice[0] != testParams[0] || paramSlice[1] != testParams[1] {
		t.Errorf("❌ PARAMETER PASSING INCOMPATIBLE\n"+
			"Parameter write/read failed - memory layout differs from expectation.\n"+
			"Expected: [%d, %d], Got: [%d, %d]\n"+
			"This will cause incorrect WebAssembly interop.",
			testParams[0], testParams[1], paramSlice[0], paramSlice[1])
	} else {
		t.Logf("✅ WebAssembly interface compatible with benchmark harness")
	}

	// Test init function (should not panic)
	init_wasm(testParams[1])
	t.Logf("✅ Init function operates correctly")

	// Test run_task with valid parameters
	hash := runTask(paramPtr)
	if hash == 0 {
		t.Error("❌ RUN_TASK EXECUTION FAILED\n" +
			"runTask() returned 0, indicating parse error or execution failure.\n" +
			"Check JSON generation, parsing, and hash calculation logic.")
	} else {
		t.Logf("✅ runTask() executed successfully with hash: %d", hash)
	}
}
