package main

import (
	"unsafe"
)

// WebAssembly C-style interface exports

//go:export init
func init_wasm(seed uint32) {
	// Initialize random number generator with seed
	// Currently unused but available for future extensions
	_ = seed
}

//go:export alloc
func alloc(nBytes uint32) uintptr {
	if nBytes == 0 {
		return 0
	}
	
	// Allocate memory using make() for byte slice
	buf := make([]byte, nBytes)
	
	// Return pointer to the allocated memory
	if len(buf) == 0 {
		panic("Failed to allocate memory")
	}
	
	return uintptr(unsafe.Pointer(&buf[0]))
}

//go:export run_task
func runTask(paramsPtr uintptr) uint32 {
	if paramsPtr == 0 {
		return 0
	}
	
	params := parseParams(paramsPtr)
	
	// Calculate Mandelbrot set for each pixel
	iterationCounts := make([]uint32, params.Width*params.Height)
	
	for y := uint32(0); y < params.Height; y++ {
		for x := uint32(0); x < params.Width; x++ {
			// Map pixel to complex plane
			xNorm := float64(x)/float64(params.Width) - 0.5
			yNorm := float64(y)/float64(params.Height) - 0.5
			
			cReal := params.CenterReal + xNorm*params.ScaleFactor
			cImag := params.CenterImag + yNorm*params.ScaleFactor
			
			// Calculate iterations for this pixel
			iterations := mandelbrotPixel(cReal, cImag, params.MaxIter)
			iterationCounts[y*params.Width+x] = iterations
		}
	}
	
	// Compute FNV-1a hash of results for verification
	return fnv1aHashU32(iterationCounts)
}

// Private helper functions (to be implemented)

func mandelbrotPixel(cReal, cImag float64, maxIter uint32) uint32 {
	var zReal, zImag float64 = 0.0, 0.0
	var iterations uint32 = 0
	
	for iterations < maxIter {
		// Check if |z|² > 4 (equivalent to |z| > 2)
		if complexMagnitudeSquared(zReal, zImag) > 4.0 {
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

func fnv1aHashU32(data []uint32) uint32 {
	const fnvOffsetBasis uint32 = 2166136261
	const fnvPrime uint32 = 16777619
	
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

// Parameters structure for parsing from memory
// Parameters structure for parsing from memory pointer
// Matches the C layout of the Rust version exactly
type MandelbrotParams struct {
	Width       uint32  // Image width in pixels
	Height      uint32  // Image height in pixels
	MaxIter     uint32  // Maximum iteration count
	CenterReal  float64 // Real part of complex center
	CenterImag  float64 // Imaginary part of complex center
	ScaleFactor float64 // Zoom level scaling
}

func parseParams(ptr uintptr) *MandelbrotParams {
	// Cast uintptr to *MandelbrotParams and return
	return (*MandelbrotParams)(unsafe.Pointer(ptr))
}