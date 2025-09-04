package main

import (
	"math"
	"unsafe"
)

// Constants for validation and computation
const (
	// Validation limits to prevent resource exhaustion
	maxImageDimension = 10_000
	maxTotalPixels    = 100_000_000
	maxAllocationSize = 1_073_741_824 // 1GB
	
	// Mathematical constants
	divergenceThreshold = 4.0
	
	// FNV-1a hash algorithm constants  
	fnvOffsetBasis uint32 = 2166136261
	fnvPrime       uint32 = 16777619
)

//
// WebAssembly Interface Functions
//

//go:export init
func init_wasm(seed uint32) {
	// Initialize WebAssembly module - no-op for this implementation
	_ = seed
}

//go:export alloc
func alloc(nBytes uint32) uintptr {
	if nBytes == 0 {
		return 0
	}
	
	if nBytes > maxAllocationSize {
		return 0
	}
	
	buf := make([]byte, nBytes)
	
	if len(buf) == 0 {
		return 0
	}
	
	return uintptr(unsafe.Pointer(&buf[0]))
}

//go:export run_task
func runTask(paramsPtr uintptr) uint32 {
	if paramsPtr == 0 {
		return 0
	}
	
	params := parseParams(paramsPtr)
	
	if !validateParameters(params) {
		return 0
	}
	
	totalPixels := params.Width * params.Height
	if totalPixels > maxTotalPixels {
		return 0
	}
	
	iterationCounts := make([]uint32, totalPixels)
	
	for y := uint32(0); y < params.Height; y++ {
		for x := uint32(0); x < params.Width; x++ {
			// Map pixel to complex plane
			xNorm := float64(x)/float64(params.Width) - 0.5
			yNorm := float64(y)/float64(params.Height) - 0.5
			
			cReal := params.CenterReal + xNorm*params.ScaleFactor
			cImag := params.CenterImag + yNorm*params.ScaleFactor
			
			iterations := mandelbrotPixel(cReal, cImag, params.MaxIter)
			iterationCounts[y*params.Width+x] = iterations
		}
	}
	
	return fnv1aHashU32(iterationCounts)
}

//
// Parameter Validation
//

func validateParameters(params *MandelbrotParams) bool {
	// Check for reasonable image dimensions
	if params.Width == 0 || params.Height == 0 ||
		params.Width > maxImageDimension || params.Height > maxImageDimension {
		return false
	}
	
	// Check for finite floating point values
	if !isFinite(params.CenterReal) || !isFinite(params.CenterImag) ||
		!isFinite(params.ScaleFactor) {
		return false
	}
	
	// Check for positive scale factor
	if params.ScaleFactor <= 0.0 {
		return false
	}
	
	return true
}

func isFinite(f float64) bool {
	return !math.IsNaN(f) && !math.IsInf(f, 0)
}

//
// Mandelbrot Computation
//

func mandelbrotPixel(cReal, cImag float64, maxIter uint32) uint32 {
	var zReal, zImag float64 = 0.0, 0.0
	var iterations uint32 = 0
	
	for iterations < maxIter {
		if complexMagnitudeSquared(zReal, zImag) > divergenceThreshold {
			break
		}
		
		// Calculate z² + c
		zRealNew := zReal*zReal - zImag*zImag + cReal
		zImagNew := 2.0*zReal*zImag + cImag
		
		zReal = zRealNew
		zImag = zImagNew
		iterations++
	}
	
	return iterations
}

func complexMagnitudeSquared(real, imag float64) float64 {
	return real*real + imag*imag
}

//
// Hash Computation
//

func fnv1aHashU32(data []uint32) uint32 {
	hash := fnvOffsetBasis
	
	for _, value := range data {
		// Convert uint32 to bytes (little-endian)
		bytes := [4]byte{
			byte(value),
			byte(value >> 8),
			byte(value >> 16),
			byte(value >> 24),
		}
		
		for _, b := range bytes {
			hash ^= uint32(b)
			hash *= fnvPrime
		}
	}
	
	return hash
}

//
// Data Structures
//

// MandelbrotParams represents parameters for Mandelbrot set computation
type MandelbrotParams struct {
	Width       uint32
	Height      uint32
	MaxIter     uint32
	CenterReal  float64
	CenterImag  float64
	ScaleFactor float64
}

func parseParams(ptr uintptr) *MandelbrotParams {
	return (*MandelbrotParams)(unsafe.Pointer(ptr))
}

// Required for TinyGo WebAssembly compilation
func main() {
	// Empty main function required for compilation
}