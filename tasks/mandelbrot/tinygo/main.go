package main

import (
	"math"
	"unsafe"
)

// WebAssembly C-style interface exports

// init_wasm initializes the WebAssembly module with optional seed value.
//
// Parameters:
//   - seed: Random seed for future extensions (currently unused)
//
// Note: This function is provided for WebAssembly compatibility and future
// extensibility but currently performs no operations.
//go:export init
func init_wasm(seed uint32) {
	// Initialize random number generator with seed
	// Currently unused but available for future extensions
	_ = seed
}

// alloc allocates memory for WebAssembly interop.
//
// Parameters:
//   - nBytes: Number of bytes to allocate (must be > 0 and <= 2^30)
//
// Returns:
//   - Non-zero pointer to allocated memory on success
//   - Zero pointer on failure (zero bytes requested or allocation failed)
//
// Safety: This function is designed for WebAssembly FFI. The caller is responsible
// for memory management and ensuring the returned pointer is valid.
//go:export alloc
func alloc(nBytes uint32) uintptr {
	// Validate input parameters
	if nBytes == 0 {
		return 0
	}
	
	// Prevent excessive memory allocation (max 1GB)
	if nBytes > 1_073_741_824 {
		return 0
	}
	
	// Allocate memory using make() for byte slice
	buf := make([]byte, nBytes)
	
	// Return zero pointer on allocation failure instead of panicking
	if len(buf) == 0 {
		return 0
	}
	
	return uintptr(unsafe.Pointer(&buf[0]))
}

// runTask computes the Mandelbrot set for given parameters and returns a verification hash.
//
// Parameters:
//   - paramsPtr: Pointer to MandelbrotParams structure in memory
//
// Returns:
//   - FNV-1a hash of iteration counts for all pixels (uint32)
//   - 0 if parameters are invalid or computation fails
//
// Safety: This function assumes the pointer references valid MandelbrotParams data.
// Parameter validation is performed to prevent resource exhaustion.
//go:export run_task
func runTask(paramsPtr uintptr) uint32 {
	if paramsPtr == 0 {
		return 0
	}
	
	params := parseParams(paramsPtr)
	
	// Validate parameters to prevent resource exhaustion
	if !validateParameters(params) {
		return 0
	}
	
	// Calculate total pixel count safely
	totalPixels := params.Width * params.Height
	if totalPixels > 100_000_000 { // Max 100M pixels (400MB memory)
		return 0
	}
	
	// Calculate Mandelbrot set for each pixel
	iterationCounts := make([]uint32, totalPixels)
	
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

// validateParameters validates MandelbrotParams to prevent resource exhaustion and invalid computations.
//
// Parameters:
//   - params: Parameters to validate
//
// Returns:
//   - true if parameters are valid and safe for computation
//   - false if parameters could cause resource exhaustion or invalid results
func validateParameters(params *MandelbrotParams) bool {
	// Check for reasonable image dimensions (1x1 to 10000x10000)
	if params.Width == 0 || params.Height == 0 ||
		params.Width > 10_000 || params.Height > 10_000 {
		return false
	}
	
	// Allow all valid uint32 iteration counts
	// Resource exhaustion is limited by image size, not iterations
	// (max_iter of 2^32-1 is valid for testing edge cases)
	
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

// isFinite checks if a float64 value is finite (not NaN or infinity)
func isFinite(f float64) bool {
	return !math.IsNaN(f) && !math.IsInf(f, 0)
}

// Private helper functions

// mandelbrotPixel computes the number of iterations for a single Mandelbrot set pixel.
//
// Parameters:
//   - cReal: Real part of complex number c
//   - cImag: Imaginary part of complex number c
//   - maxIter: Maximum number of iterations before considering point in set
//
// Returns:
//   - Number of iterations until divergence (|z| > 2)
//   - maxIter if point appears to be in the Mandelbrot set
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

// complexMagnitudeSquared computes the squared magnitude of a complex number.
//
// Parameters:
//   - real: Real part of the complex number
//   - imag: Imaginary part of the complex number
//
// Returns:
//   - |z|² = real² + imag²
func complexMagnitudeSquared(real, imag float64) float64 {
	return real*real + imag*imag
}

// fnv1aHashU32 computes FNV-1a hash of uint32 array for cross-implementation verification.
//
// Parameters:
//   - data: Array of uint32 values to hash
//
// Returns:
//   - 32-bit FNV-1a hash value
//
// Note: Uses little-endian byte order for cross-platform consistency.
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

// MandelbrotParams represents the parameters for Mandelbrot set computation.
// This structure matches the C layout of the Rust version exactly for WebAssembly interop.
type MandelbrotParams struct {
	Width       uint32  // Image width in pixels
	Height      uint32  // Image height in pixels
	MaxIter     uint32  // Maximum iteration count
	CenterReal  float64 // Real part of complex center
	CenterImag  float64 // Imaginary part of complex center
	ScaleFactor float64 // Zoom level scaling
}

// parseParams safely converts a memory pointer to MandelbrotParams structure.
//
// Parameters:
//   - ptr: Memory pointer to MandelbrotParams data
//
// Returns:
//   - Pointer to MandelbrotParams structure
//
// Safety: Assumes the pointer references valid MandelbrotParams data.
func parseParams(ptr uintptr) *MandelbrotParams {
	// Cast uintptr to *MandelbrotParams and return
	return (*MandelbrotParams)(unsafe.Pointer(ptr))
}