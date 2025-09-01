package main

import (
	"testing"
	"unsafe"
)

func TestMandelbrotKnownPoints(t *testing.T) {
	// Point (0,0) should be in the Mandelbrot set (high iteration count)
	iterationsOrigin := mandelbrotPixel(0.0, 0.0, 1000)
	if iterationsOrigin != 1000 {
		t.Errorf("Origin should reach max iterations, got %d", iterationsOrigin)
	}

	// Point (2,2) should diverge quickly (low iteration count)
	iterationsOutside := mandelbrotPixel(2.0, 2.0, 1000)
	if iterationsOutside >= 10 {
		t.Errorf("Point (2,2) should diverge quickly, got %d iterations", iterationsOutside)
	}

	// Point (-0.75, 0) should be in the set (on the main bulb boundary)
	iterationsBoundary := mandelbrotPixel(-0.75, 0.0, 1000)
	if iterationsBoundary <= 100 {
		t.Errorf("Point (-0.75, 0) should have high iteration count, got %d", iterationsBoundary)
	}
}

func TestHashConsistency(t *testing.T) {
	data1 := []uint32{1, 2, 3, 4, 5}
	data2 := []uint32{1, 2, 3, 4, 5}
	data3 := []uint32{1, 2, 3, 4, 6}

	hash1 := fnv1aHashU32(data1)
	hash2 := fnv1aHashU32(data2)
	hash3 := fnv1aHashU32(data3)

	if hash1 != hash2 {
		t.Errorf("Same input should produce same hash: %d != %d", hash1, hash2)
	}

	if hash1 == hash3 {
		t.Errorf("Different input should produce different hash: %d == %d", hash1, hash3)
	}
}

func TestComplexMagnitude(t *testing.T) {
	tests := []struct {
		real, imag, expected float64
	}{
		{3.0, 4.0, 25.0},
		{0.0, 0.0, 0.0},
		{1.0, 1.0, 2.0},
		{5.0, 0.0, 25.0},
		{0.0, 3.0, 9.0},
	}

	for _, test := range tests {
		result := complexMagnitudeSquared(test.real, test.imag)
		if result != test.expected {
			t.Errorf("complexMagnitudeSquared(%f, %f) = %f, expected %f", 
				test.real, test.imag, result, test.expected)
		}
	}
}

func TestMemoryAllocation(t *testing.T) {
	ptr := alloc(100)
	if ptr == 0 {
		t.Error("Allocation should succeed for non-zero bytes")
	}

	nullPtr := alloc(0)
	if nullPtr != 0 {
		t.Error("Zero-byte allocation should return null pointer")
	}
}

func TestFnv1aHashKnownValues(t *testing.T) {
	// Test with known values to verify FNV-1a implementation
	empty := []uint32{}
	hashEmpty := fnv1aHashU32(empty)
	if hashEmpty != 2166136261 {
		t.Errorf("Empty hash should equal offset basis, got %d", hashEmpty)
	}

	single := []uint32{0}
	hashSingle := fnv1aHashU32(single)
	if hashSingle == hashEmpty {
		t.Error("Single zero should produce different hash from empty")
	}
}

func TestParameterParsing(t *testing.T) {
	// Create test parameters
	params := MandelbrotParams{
		Width:       800,
		Height:      600,
		MaxIter:     1000,
		CenterReal:  -0.5,
		CenterImag:  0.0,
		ScaleFactor: 2.0,
	}

	// Get pointer to params
	ptr := uintptr(unsafe.Pointer(&params))

	// Parse back
	parsed := parseParams(ptr)

	if parsed.Width != params.Width {
		t.Errorf("Width mismatch: %d != %d", parsed.Width, params.Width)
	}
	if parsed.Height != params.Height {
		t.Errorf("Height mismatch: %d != %d", parsed.Height, params.Height)
	}
	if parsed.MaxIter != params.MaxIter {
		t.Errorf("MaxIter mismatch: %d != %d", parsed.MaxIter, params.MaxIter)
	}
	if parsed.CenterReal != params.CenterReal {
		t.Errorf("CenterReal mismatch: %f != %f", parsed.CenterReal, params.CenterReal)
	}
	if parsed.CenterImag != params.CenterImag {
		t.Errorf("CenterImag mismatch: %f != %f", parsed.CenterImag, params.CenterImag)
	}
	if parsed.ScaleFactor != params.ScaleFactor {
		t.Errorf("ScaleFactor mismatch: %f != %f", parsed.ScaleFactor, params.ScaleFactor)
	}
}

func TestRunTaskComplete(t *testing.T) {
	// Test a small Mandelbrot computation
	params := MandelbrotParams{
		Width:       4,
		Height:      4,
		MaxIter:     100,
		CenterReal:  0.0,
		CenterImag:  0.0,
		ScaleFactor: 4.0,
	}

	ptr := uintptr(unsafe.Pointer(&params))
	hash := runTask(ptr)

	// Should return a non-zero hash for valid computation
	if hash == 0 {
		t.Error("runTask should return non-zero hash for valid parameters")
	}

	// Test null pointer handling
	nullHash := runTask(0)
	if nullHash != 0 {
		t.Error("runTask should return 0 for null pointer")
	}
}

func TestInitWasm(t *testing.T) {
	// Test that init doesn't panic
	init_wasm(12345)
	init_wasm(0)
	init_wasm(4294967295) // Max uint32
}