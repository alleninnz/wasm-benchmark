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
	Name         string                 `json:"name"`
	Description  string                 `json:"description"`
	Params       SerializableParams     `json:"params"`
	ExpectedHash uint32                 `json:"expected_hash"`
	Category     string                 `json:"category"`
}

// SerializableParams matches the JSON structure from Rust
type SerializableParams struct {
	Width       uint32  `json:"width"`
	Height      uint32  `json:"height"`
	MaxIter     uint32  `json:"max_iter"`
	CenterReal  float64 `json:"center_real"`
	CenterImag  float64 `json:"center_imag"`
	ScaleFactor float64 `json:"scale_factor"`
}

// Convert to our internal MandelbrotParams
func (sp SerializableParams) toMandelbrotParams() MandelbrotParams {
	return MandelbrotParams{
		Width:       sp.Width,
		Height:      sp.Height,
		MaxIter:     sp.MaxIter,
		CenterReal:  sp.CenterReal,
		CenterImag:  sp.CenterImag,
		ScaleFactor: sp.ScaleFactor,
	}
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
		// Convert parameters
		params := vector.Params.toMandelbrotParams()
		ptr := uintptr(unsafe.Pointer(&params))

		// Compute hash with TinyGo implementation
		actualHash := runTask(ptr)

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
			"Check algorithm implementation for differences in floating-point arithmetic,\n"+
			"iteration logic, or coordinate mapping.", 
			totalFailed, totalTests, firstFailure)
	}
}

// Test memory layout compatibility between Rust and TinyGo
func TestMemoryLayoutCompatibility(t *testing.T) {
	params := MandelbrotParams{
		Width:       100,
		Height:      200,
		MaxIter:     1000,
		CenterReal:  -0.5,
		CenterImag:  0.25,
		ScaleFactor: 2.0,
	}

	// Get pointer and verify we can parse it back correctly
	ptr := uintptr(unsafe.Pointer(&params))
	parsed := parseParams(ptr)

	if parsed.Width != params.Width ||
		parsed.Height != params.Height ||
		parsed.MaxIter != params.MaxIter ||
		parsed.CenterReal != params.CenterReal ||
		parsed.CenterImag != params.CenterImag ||
		parsed.ScaleFactor != params.ScaleFactor {
		t.Errorf("❌ MEMORY LAYOUT INCOMPATIBLE\n"+
			"Parameter parsing failed - struct layout differs from Rust.\n"+
			"This will cause incorrect WebAssembly interop.\n"+
			"Check struct field order and padding.")
	} else {
		t.Logf("✅ Memory layout compatible with Rust implementation")
	}
}