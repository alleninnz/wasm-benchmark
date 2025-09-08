// Package main provides cross-implementation validation tests for the Mandelbrot set
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
	defaultTestVectorFile = "../../../data/reference_hashes/mandelbrot.json"

	// Memory layout test parameters
	testWidth       = 100
	testHeight      = 200
	testMaxIter     = 1000
	testCenterReal  = -0.5
	testCenterImag  = 0.25
	testScaleFactor = 2.0
)

// TestVector represents a cross-implementation test case containing parameters
// and expected results for validating compatibility between TinyGo and Rust
// implementations of the Mandelbrot set algorithm.
type TestVector struct {
	Name         string             `json:"name"`          // Unique test case identifier
	Description  string             `json:"description"`   // Human-readable test description
	Params       SerializableParams `json:"params"`        // Mandelbrot computation parameters
	ExpectedHash uint32             `json:"expected_hash"` // Expected hash from Rust reference
	Category     string             `json:"category"`      // Test category (e.g., "systematic", "edge_case")
}

// SerializableParams defines the JSON-serializable parameter structure that matches
// the Rust implementation's parameter format for cross-language compatibility.
type SerializableParams struct {
	Width       uint32  `json:"width"`        // Image width in pixels
	Height      uint32  `json:"height"`       // Image height in pixels
	MaxIter     uint32  `json:"max_iter"`     // Maximum iteration count
	CenterReal  float64 `json:"center_real"`  // Real component of center point
	CenterImag  float64 `json:"center_imag"`  // Imaginary component of center point
	ScaleFactor float64 `json:"scale_factor"` // Zoom scale factor
}

// Validate checks if the serializable parameters are within acceptable ranges
// and returns an error if any parameter is invalid.
func (sp SerializableParams) Validate() error {
	if sp.Width == 0 || sp.Height == 0 {
		return fmt.Errorf("width and height must be greater than 0, got width=%d height=%d", sp.Width, sp.Height)
	}
	// Note: MaxIter = 0 is allowed as it represents a valid edge case for testing
	if sp.ScaleFactor <= 0 {
		return fmt.Errorf("scale_factor must be positive, got %f", sp.ScaleFactor)
	}
	return nil
}

// toMandelbrotParams converts SerializableParams to the internal MandelbrotParams
// structure used by the TinyGo WebAssembly module. This ensures type compatibility
// while maintaining the exact field mapping required for correct computation.
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

// TestResult encapsulates the results of a single cross-implementation test
type TestResult struct {
	Vector     TestVector
	Passed     bool
	ActualHash uint32
	Error      error
}

// formatTestFailure creates a detailed error message for test failures
func formatTestFailure(result TestResult) string {
	diff := int64(result.ActualHash) - int64(result.Vector.ExpectedHash)
	return fmt.Sprintf("Test '%s' (%s) failed: expected hash %d, got %d (diff: %d)",
		result.Vector.Name, result.Vector.Description, result.Vector.ExpectedHash,
		result.ActualHash, diff)
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
		t.Errorf("❌ CROSS-IMPLEMENTATION VALIDATION FAILED\nResult: %d/%d test vectors failed\nFirst failure: %s\nThis indicates the TinyGo implementation does not match the Rust reference.\nCheck algorithm implementation for differences in floating-point arithmetic,\niteration logic, or coordinate mapping.", totalFailed, len(allResults), firstFailure)
	}
}

// runSingleTest executes a single test vector and returns the result
func runSingleTest(t *testing.T, vector TestVector) TestResult {
	t.Helper()

	// Convert parameters
	params := vector.Params.toMandelbrotParams()
	ptr := uintptr(unsafe.Pointer(&params))

	// Compute hash with TinyGo implementation
	actualHash := runTask(ptr)

	result := TestResult{
		Vector:     vector,
		ActualHash: actualHash,
		Passed:     actualHash == vector.ExpectedHash,
	}

	return result
}

// TestMemoryLayoutCompatibility verifies that the MandelbrotParams struct
// has the same memory layout as the Rust implementation, ensuring correct
// WebAssembly interoperability when parameters are passed between implementations.
func TestMemoryLayoutCompatibility(t *testing.T) {
	// Test with predefined parameters
	originalParams := MandelbrotParams{
		Width:       testWidth,
		Height:      testHeight,
		MaxIter:     testMaxIter,
		CenterReal:  testCenterReal,
		CenterImag:  testCenterImag,
		ScaleFactor: testScaleFactor,
	}

	t.Logf("Testing memory layout compatibility with params: %+v", originalParams)

	// Get pointer and verify we can parse it back correctly
	ptr := uintptr(unsafe.Pointer(&originalParams))
	parsed := parseParams(ptr)

	// Create detailed comparison
	layoutErrors := make([]string, 0)

	if parsed.Width != originalParams.Width {
		layoutErrors = append(layoutErrors, fmt.Sprintf("Width mismatch: expected %d, got %d", originalParams.Width, parsed.Width))
	}
	if parsed.Height != originalParams.Height {
		layoutErrors = append(layoutErrors, fmt.Sprintf("Height mismatch: expected %d, got %d", originalParams.Height, parsed.Height))
	}
	if parsed.MaxIter != originalParams.MaxIter {
		layoutErrors = append(layoutErrors, fmt.Sprintf("MaxIter mismatch: expected %d, got %d", originalParams.MaxIter, parsed.MaxIter))
	}
	if parsed.CenterReal != originalParams.CenterReal {
		layoutErrors = append(layoutErrors, fmt.Sprintf("CenterReal mismatch: expected %f, got %f", originalParams.CenterReal, parsed.CenterReal))
	}
	if parsed.CenterImag != originalParams.CenterImag {
		layoutErrors = append(layoutErrors, fmt.Sprintf("CenterImag mismatch: expected %f, got %f", originalParams.CenterImag, parsed.CenterImag))
	}
	if parsed.ScaleFactor != originalParams.ScaleFactor {
		layoutErrors = append(layoutErrors, fmt.Sprintf("ScaleFactor mismatch: expected %f, got %f", originalParams.ScaleFactor, parsed.ScaleFactor))
	}

	if len(layoutErrors) > 0 {
		t.Errorf("❌ MEMORY LAYOUT INCOMPATIBLE\nParameter parsing failed - struct layout differs from Rust.\nThis will cause incorrect WebAssembly interop.\nDetected issues:\n%s\nCheck struct field order and padding.", "  - "+fmt.Sprintf("%s", layoutErrors[0])+"\n") // Show first error for brevity

		// Log all errors for debugging
		for _, err := range layoutErrors {
			t.Logf("Layout error: %s", err)
		}
	} else {
		t.Logf("✅ Memory layout compatible with Rust implementation")
		t.Logf("Successfully round-tripped parameters through unsafe pointer conversion")
	}
}
