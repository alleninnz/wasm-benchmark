package main

import (
	"math"
	"unsafe"
)

// Constants for algorithm consistency and validation limits
const (
	// FNV-1a hash constants
	FNVOffsetBasis uint32 = 2166136261
	FNVPrime       uint32 = 16777619

	// Linear Congruential Generator constants (Numerical Recipes parameters)
	LCGMultiplier uint32 = 1664525
	LCGIncrement  uint32 = 1013904223

	// Matrix computation constants
	FloatRangeMin      float32 = -1.0
	FloatRangeMax      float32 = 1.0
	PrecisionDigits    uint32  = 6
	PrecisionMultiplier float32 = 1e6

	// Validation limits to prevent resource exhaustion
	MaxMatrixDimension uint32 = 2000              // Max 2000x2000 (16MB per matrix)
	MaxAllocationSize  uint32 = 1_073_741_824    // 1GB
)

// MatrixMulParams represents parameters for matrix multiplication computation
type MatrixMulParams struct {
	Dimension uint32 // Size of square matrices (N x N)
	Seed      uint32 // Seed for reproducible random matrix generation
}

// WebAssembly exports for benchmark harness integration

//go:export init
func initWasm(seed uint32) {
	// Initialize WebAssembly module - no-op for this implementation
	_ = seed
}

//go:export alloc
func alloc(nBytes uint32) uintptr {
	// Allocate memory for WebAssembly linear memory management
	if nBytes == 0 {
		return 0
	}
	
	if nBytes > MaxAllocationSize {
		return 0
	}
	
	// Allocate slice of bytes and return pointer to underlying data
	data := make([]byte, nBytes)
	return uintptr(unsafe.Pointer(&data[0]))
}

//go:export run_task
func runTask(paramsPtr uintptr) uint32 {
	// Execute matrix multiplication benchmark task
	if paramsPtr == 0 {
		return 0
	}
	
	params := (*MatrixMulParams)(unsafe.Pointer(paramsPtr))
	
	if !validateParameters(params) {
		return 0
	}
	
	// Generate matrices A and B using reproducible random generation
	seed := params.Seed
	matrixA := generateRandomMatrix(int(params.Dimension), &seed)
	matrixB := generateRandomMatrix(int(params.Dimension), &seed)
	
	// Initialize result matrix C
	matrixC := createZeroMatrix(int(params.Dimension))
	
	// Execute matrix multiplication: C = A × B
	naiveTripleLoopMultiply(matrixA, matrixB, matrixC)
	
	// Return FNV-1a hash of result matrix for verification
	return fnv1aHashMatrix(matrixC)
}

// Matrix operations

// createZeroMatrix creates a matrix filled with zeros
func createZeroMatrix(dimension int) [][]float32 {
	matrix := make([][]float32, dimension)
	for i := range matrix {
		matrix[i] = make([]float32, dimension)
	}
	return matrix
}

// createIdentityMatrix creates an identity matrix for testing
func createIdentityMatrix(dimension int) [][]float32 {
	matrix := createZeroMatrix(dimension)
	for i := 0; i < dimension; i++ {
		matrix[i][i] = 1.0
	}
	return matrix
}

// matrixMultiply performs matrix multiplication C = A × B using naive triple-loop algorithm
func matrixMultiply(a, b [][]float32) [][]float32 {
	n := len(a)
	if n == 0 || len(b) != n || len(b[0]) != n {
		return nil // Invalid matrix dimensions
	}
	
	c := createZeroMatrix(n)
	naiveTripleLoopMultiply(a, b, c)
	return c
}

// naiveTripleLoopMultiply performs triple-loop matrix multiplication with specific i,j,k order
// This order is chosen for consistency across language implementations
func naiveTripleLoopMultiply(a, b [][]float32, c [][]float32) {
	n := len(a)
	
	// Use i,j,k order for consistent cross-language behavior
	for i := 0; i < n; i++ {
		for j := 0; j < n; j++ {
			for k := 0; k < n; k++ {
				c[i][j] += a[i][k] * b[k][j]
			}
		}
	}
}

// Random matrix generation

// generateRandomMatrix generates random matrix with reproducible values using LCG
func generateRandomMatrix(dimension int, seed *uint32) [][]float32 {
	matrix := make([][]float32, dimension)
	
	for i := 0; i < dimension; i++ {
		matrix[i] = make([]float32, dimension)
		for j := 0; j < dimension; j++ {
			lcgValue := linearCongruentialGenerator(seed)
			floatValue := lcgToFloatRange(lcgValue, FloatRangeMin, FloatRangeMax)
			matrix[i][j] = floatValue
		}
	}
	
	return matrix
}

// linearCongruentialGenerator implements LCG for reproducible pseudo-random numbers
func linearCongruentialGenerator(seed *uint32) uint32 {
	*seed = (*seed)*LCGMultiplier + LCGIncrement
	return *seed
}

// lcgToFloatRange converts LCG value to float32 in specified range [min, max]
func lcgToFloatRange(lcgValue uint32, min, max float32) float32 {
	// Convert uint32 to [0, 1] range
	normalized := float64(lcgValue) / float64(math.MaxUint32)
	// Scale to [min, max] range
	return float32(float64(min) + normalized*float64(max-min))
}

// Hash computation

// fnv1aHashMatrix computes FNV-1a hash of matrix elements for cross-implementation verification
func fnv1aHashMatrix(matrix [][]float32) uint32 {
	hash := FNVOffsetBasis
	
	// Process elements in row-major order for consistency
	for _, row := range matrix {
		for _, value := range row {
			// Round float32 to specified precision and convert to int32
			roundedValue := roundFloat32ToPrecision(value, PrecisionDigits)
			
			// Hash the int32 as little-endian bytes
			bytes := int32ToLittleEndianBytes(roundedValue)
			for _, b := range bytes {
				hash ^= uint32(b)
				hash *= FNVPrime
			}
		}
	}
	
	return hash
}

// roundFloat32ToPrecision rounds float32 to specified decimal places and converts to int32
func roundFloat32ToPrecision(value float32, precisionDigits uint32) int32 {
	multiplier := math.Pow(10, float64(precisionDigits))
	return int32(math.Round(float64(value) * multiplier))
}

// int32ToLittleEndianBytes converts int32 to little-endian byte slice
func int32ToLittleEndianBytes(value int32) []byte {
	bytes := make([]byte, 4)
	bytes[0] = byte(value)
	bytes[1] = byte(value >> 8)
	bytes[2] = byte(value >> 16)
	bytes[3] = byte(value >> 24)
	return bytes
}

// Parameter validation

// validateParameters validates MatrixMulParams to prevent resource exhaustion and invalid computations
func validateParameters(params *MatrixMulParams) bool {
	// Check for reasonable matrix dimensions
	if params.Dimension == 0 {
		return false // Zero dimension is invalid
	}
	
	if params.Dimension > MaxMatrixDimension {
		return false // Too large, would cause memory exhaustion
	}
	
	// Check for potential overflow in memory calculations
	// Each matrix needs dimension² × 4 bytes (float32), need 3 matrices total
	elements := uint64(params.Dimension) * uint64(params.Dimension)
	bytesPerMatrix := elements * 4
	totalBytes := bytesPerMatrix * 3
	
	// Reasonable memory limit: 256MB total for all matrices
	if totalBytes > 256*1024*1024 {
		return false
	}
	
	// Seed can be any uint32 value (including 0)
	return true
}

// Utility functions for testing

// matricesApproximatelyEqual checks if two matrices are approximately equal (for testing)
func matricesApproximatelyEqual(a, b [][]float32, tolerance float32) bool {
	if len(a) != len(b) {
		return false
	}
	
	for i := 0; i < len(a); i++ {
		if len(a[i]) != len(b[i]) {
			return false
		}
		for j := 0; j < len(a[i]); j++ {
			if math.Abs(float64(a[i][j]-b[i][j])) > float64(tolerance) {
				return false
			}
		}
	}
	
	return true
}

// Required for TinyGo WebAssembly compilation
func main() {
	// Empty main function required for compilation
}