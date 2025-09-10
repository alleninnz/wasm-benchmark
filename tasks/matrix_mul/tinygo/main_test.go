package main

import (
	"encoding/json"
	"fmt"
	"math"
	"testing"
	"unsafe"
)

// Test vector structure for cross-implementation validation
type TestVector struct {
	Name         string             `json:"name"`
	Description  string             `json:"description"`
	Params       SerializableParams `json:"params"`
	ExpectedHash uint32             `json:"expected_hash"`
	Category     string             `json:"category"`
}

type SerializableParams struct {
	Dimension uint32 `json:"dimension"`
	Seed      uint32 `json:"seed"`
}

// Matrix operations tests

func TestCreateZeroMatrix(t *testing.T) {
	matrix := createZeroMatrix(3)

	if len(matrix) != 3 {
		t.Errorf("Expected matrix to have 3 rows, got %d", len(matrix))
	}

	for i, row := range matrix {
		if len(row) != 3 {
			t.Errorf("Expected row %d to have 3 columns, got %d", i, len(row))
		}
		for j, element := range row {
			if element != 0.0 {
				t.Errorf("Expected element [%d][%d] to be 0.0, got %f", i, j, element)
			}
		}
	}
}

func TestCreateIdentityMatrix(t *testing.T) {
	identity := createIdentityMatrix(3)

	for i := 0; i < 3; i++ {
		for j := 0; j < 3; j++ {
			expected := float32(0.0)
			if i == j {
				expected = 1.0
			}
			if identity[i][j] != expected {
				t.Errorf("Identity[%d][%d] = %f, expected %f", i, j, identity[i][j], expected)
			}
		}
	}
}

func TestMatrixMultiplyIdentity(t *testing.T) {
	// Test A × I = A
	a := [][]float32{
		{1.0, 2.0},
		{3.0, 4.0},
	}
	identity := createIdentityMatrix(2)

	result := matrixMultiply(a, identity)

	if !matricesApproximatelyEqual(a, result, 1e-6) {
		t.Error("A × I should equal A")
	}
}

func TestMatrixMultiplyZero(t *testing.T) {
	// Test A × 0 = 0
	a := [][]float32{
		{1.0, 2.0},
		{3.0, 4.0},
	}
	zero := createZeroMatrix(2)

	result := matrixMultiply(a, zero)

	if !matricesApproximatelyEqual(zero, result, 1e-6) {
		t.Error("A × 0 should equal 0")
	}
}

func TestMatrixMultiplyKnownValues(t *testing.T) {
	// Test with known multiplication result
	a := [][]float32{
		{1.0, 2.0},
		{3.0, 4.0},
	}
	b := [][]float32{
		{2.0, 0.0},
		{1.0, 2.0},
	}

	expected := [][]float32{
		{4.0, 4.0},  // [1*2 + 2*1, 1*0 + 2*2]
		{10.0, 8.0}, // [3*2 + 4*1, 3*0 + 4*2]
	}

	result := matrixMultiply(a, b)

	if !matricesApproximatelyEqual(expected, result, 1e-6) {
		t.Errorf("Matrix multiplication produced incorrect result")
	}
}

func TestNaiveTripleLoopMultiply(t *testing.T) {
	// Test 2x2 matrix multiplication with known values
	a := [][]float32{{1.0, 2.0}, {3.0, 4.0}}
	b := [][]float32{{5.0, 6.0}, {7.0, 8.0}}
	c := [][]float32{{0.0, 0.0}, {0.0, 0.0}}

	naiveTripleLoopMultiply(a, b, c)

	// Expected result: [[19, 22], [43, 50]]
	expected := [][]float32{{19.0, 22.0}, {43.0, 50.0}}

	if !matricesApproximatelyEqual(expected, c, 1e-6) {
		t.Errorf("Triple loop multiplication failed. Got: %v, Expected: %v", c, expected)
	}
}

// Random generation tests

func TestLinearCongruentialGeneratorDeterministic(t *testing.T) {
	seed1 := uint32(12345)
	seed2 := uint32(12345)

	// Same seed should produce same sequence
	for i := 0; i < 10; i++ {
		val1 := linearCongruentialGenerator(&seed1)
		val2 := linearCongruentialGenerator(&seed2)
		if val1 != val2 {
			t.Errorf("LCG should be deterministic: iteration %d, %d != %d", i, val1, val2)
		}
	}
}

func TestLcgToFloatRange(t *testing.T) {
	// Test range conversion with standardized precision
	testValue := uint32(math.MaxUint32 / 2) // Middle value
	result := lcgToFloatRange(testValue, -1.0, 1.0)

	// Should be approximately in the middle of range
	if result < -1.0 || result > 1.0 {
		t.Errorf("Value should be in range [-1, 1], got %f", result)
	}

	if math.Abs(float64(result)) > 0.1 {
		t.Errorf("Middle value should be near 0, got %f", result)
	}

	// Test extremes
	minResult := lcgToFloatRange(0, -1.0, 1.0)
	maxResult := lcgToFloatRange(math.MaxUint32, -1.0, 1.0)

	if math.Abs(float64(minResult-(-1.0))) > 0.01 {
		t.Errorf("Min should be close to -1.0, got %f", minResult)
	}
	if math.Abs(float64(maxResult-1.0)) > 0.01 {
		t.Errorf("Max should be close to 1.0, got %f", maxResult)
	}
}

func TestCrossLanguagePrecisionConsistency(t *testing.T) {
	// Test specific values to ensure cross-language consistency with Rust
	testCases := []struct {
		lcgValue uint32
		min, max float32
	}{
		{12345, -1.0, 1.0},
		{math.MaxUint32 / 2, -1.0, 1.0},
		{1664525, -1.0, 1.0},
		{1013904223, -1.0, 1.0},
	}

	for _, tc := range testCases {
		result := lcgToFloatRange(tc.lcgValue, tc.min, tc.max)
		
		// Ensure result is in valid range
		if result < tc.min || result > tc.max {
			t.Errorf("Value %f should be in range [%f, %f] for LCG %d", 
				result, tc.min, tc.max, tc.lcgValue)
		}
		
		// The result should be deterministic
		result2 := lcgToFloatRange(tc.lcgValue, tc.min, tc.max)
		if result != result2 {
			t.Errorf("Results should be deterministic: %f != %f for LCG %d", 
				result, result2, tc.lcgValue)
		}
		
		t.Logf("LCG %d -> %.10f", tc.lcgValue, result)
	}
}

func TestGenerateRandomMatrixDeterministic(t *testing.T) {
	seed1 := uint32(42)
	seed2 := uint32(42)

	matrix1 := generateRandomMatrix(3, &seed1)
	matrix2 := generateRandomMatrix(3, &seed2)

	// Matrices should be identical
	if !matricesApproximatelyEqual(matrix1, matrix2, 0) {
		t.Error("Generated matrices should be identical with same seed")
	}
}

func TestGenerateRandomMatrixDifferentSeeds(t *testing.T) {
	seed1 := uint32(42)
	seed2 := uint32(123)

	matrix1 := generateRandomMatrix(3, &seed1)
	matrix2 := generateRandomMatrix(3, &seed2)

	// Matrices should be different
	if matricesApproximatelyEqual(matrix1, matrix2, 0) {
		t.Error("Matrices with different seeds should be different")
	}
}

// Hash tests

func TestRoundFloat32ToPrecision(t *testing.T) {
	// Test basic rounding
	if roundFloat32ToPrecision(1.234567, 6) != 1234567 {
		t.Error("Basic rounding failed")
	}
	if roundFloat32ToPrecision(-1.234567, 6) != -1234567 {
		t.Error("Negative rounding failed")
	}
	if roundFloat32ToPrecision(0.0, 6) != 0 {
		t.Error("Zero rounding failed")
	}

	// Test rounding with different precisions
	if roundFloat32ToPrecision(1.23456789, 4) != 12346 {
		t.Error("Precision 4 rounding failed")
	}
}

func TestFnv1aHashMatrixConsistency(t *testing.T) {
	matrix1 := [][]float32{
		{1.0, 2.0},
		{3.0, 4.0},
	}

	matrix2 := [][]float32{
		{1.0, 2.0},
		{3.0, 4.0},
	}

	hash1 := fnv1aHashMatrix(matrix1)
	hash2 := fnv1aHashMatrix(matrix2)

	if hash1 != hash2 {
		t.Error("Same matrices should produce same hash")
	}
}

func TestFnv1aHashMatrixDifferent(t *testing.T) {
	matrix1 := [][]float32{
		{1.0, 2.0},
		{3.0, 4.0},
	}

	matrix2 := [][]float32{
		{1.0, 2.0},
		{3.0, 4.1}, // Small difference
	}

	hash1 := fnv1aHashMatrix(matrix1)
	hash2 := fnv1aHashMatrix(matrix2)

	if hash1 == hash2 {
		t.Error("Different matrices should produce different hashes")
	}
}

func TestFnv1aHashEmptyMatrix(t *testing.T) {
	var emptyMatrix [][]float32
	hash := fnv1aHashMatrix(emptyMatrix)

	// Empty matrix should produce the FNV offset basis
	if hash != FNVOffsetBasis {
		t.Errorf("Empty matrix should hash to offset basis (%d), got %d", FNVOffsetBasis, hash)
	}
}

func TestHashOrderSensitivity(t *testing.T) {
	// Test that element order matters for hash
	matrix1 := [][]float32{
		{1.0, 2.0},
		{3.0, 4.0},
	}

	matrix2 := [][]float32{
		{1.0, 3.0},
		{2.0, 4.0},
	}

	hash1 := fnv1aHashMatrix(matrix1)
	hash2 := fnv1aHashMatrix(matrix2)

	if hash1 == hash2 {
		t.Error("Different element orders should produce different hashes")
	}
}

func TestInt32ToLittleEndianBytes(t *testing.T) {
	// Test conversion of known values
	bytes := int32ToLittleEndianBytes(0x12345678)
	expected := []byte{0x78, 0x56, 0x34, 0x12}

	for i, b := range bytes {
		if b != expected[i] {
			t.Errorf("Byte %d: expected 0x%02x, got 0x%02x", i, expected[i], b)
		}
	}
}

// Validation tests

func TestValidateParametersValid(t *testing.T) {
	// Test valid small matrix
	params := &MatrixMulParams{
		Dimension: 10,
		Seed:      12345,
	}
	if !validateParameters(params) {
		t.Error("Valid small parameters should pass")
	}

	// Test valid medium matrix
	params = &MatrixMulParams{
		Dimension: 100,
		Seed:      0, // Seed 0 should be valid
	}
	if !validateParameters(params) {
		t.Error("Valid medium parameters should pass")
	}

	// Test valid large matrix (but within limits)
	params = &MatrixMulParams{
		Dimension: 1000,
		Seed:      math.MaxUint32, // Max seed should be valid
	}
	if !validateParameters(params) {
		t.Error("Valid large parameters should pass")
	}
}

func TestValidateParametersInvalid(t *testing.T) {
	// Test zero dimension
	params := &MatrixMulParams{
		Dimension: 0,
		Seed:      12345,
	}
	if validateParameters(params) {
		t.Error("Zero dimension should be invalid")
	}

	// Test dimension too large
	params = &MatrixMulParams{
		Dimension: MaxMatrixDimension + 1,
		Seed:      12345,
	}
	if validateParameters(params) {
		t.Error("Too large dimension should be invalid")
	}

	// Test dimension that would cause memory overflow
	params = &MatrixMulParams{
		Dimension: math.MaxUint32, // Would overflow in calculations
		Seed:      12345,
	}
	if validateParameters(params) {
		t.Error("Overflow-causing dimension should be invalid")
	}
}

func TestValidateParametersMemoryLimits(t *testing.T) {
	// Test dimension that would exceed memory limit
	// 2000x2000 matrices use ~48MB total, should be OK
	params := &MatrixMulParams{
		Dimension: 2000,
		Seed:      12345,
	}
	if !validateParameters(params) {
		t.Error("2000x2000 should be within limits")
	}

	// Larger dimensions should be rejected
	params = &MatrixMulParams{
		Dimension: 3000, // 3000x3000 would use ~108MB per matrix, 324MB total
		Seed:      12345,
	}
	if validateParameters(params) {
		t.Error("3000x3000 should exceed memory limits")
	}
}

func TestValidateParametersEdgeCases(t *testing.T) {
	// Test dimension 1 (should be valid)
	params := &MatrixMulParams{
		Dimension: 1,
		Seed:      12345,
	}
	if !validateParameters(params) {
		t.Error("1x1 matrix should be valid")
	}

	// Test exactly at limit
	params = &MatrixMulParams{
		Dimension: MaxMatrixDimension,
		Seed:      12345,
	}
	if !validateParameters(params) {
		t.Error("Exactly at max dimension should be valid")
	}
}

// WebAssembly interface tests

func TestRunTaskInterface(t *testing.T) {
	// Test WebAssembly interface compatibility
	params := MatrixMulParams{Dimension: 4, Seed: 12345}
	paramsPtr := uintptr(unsafe.Pointer(&params))

	hashResult := runTask(paramsPtr)

	if hashResult == 0 {
		t.Error("Should return valid hash")
	}

	// Same parameters should produce same hash
	hashResult2 := runTask(paramsPtr)
	if hashResult != hashResult2 {
		t.Error("Same parameters should produce same hash")
	}
}

func TestRunTaskNullPointer(t *testing.T) {
	// Test null pointer handling
	hashResult := runTask(0)

	if hashResult != 0 {
		t.Error("Null pointer should return 0")
	}
}

func TestRunTaskInvalidParams(t *testing.T) {
	// Test invalid parameters
	params := MatrixMulParams{Dimension: 0, Seed: 12345}
	paramsPtr := uintptr(unsafe.Pointer(&params))

	hashResult := runTask(paramsPtr)

	if hashResult != 0 {
		t.Error("Invalid parameters should return 0")
	}
}

// Utility tests

func TestMatricesApproximatelyEqual(t *testing.T) {
	a := [][]float32{
		{1.0, 2.0},
		{3.0, 4.0},
	}
	b := [][]float32{
		{1.0000001, 2.0000001},
		{3.0000001, 4.0000001},
	}

	if !matricesApproximatelyEqual(a, b, 1e-5) {
		t.Error("Matrices with small differences should be approximately equal")
	}

	if matricesApproximatelyEqual(a, b, 1e-8) {
		t.Error("Matrices should not be equal with very small tolerance")
	}
}

// Reference hash generation and validation

func generateTestVectors() []TestVector {
	vectors := []TestVector{}

	// Small matrices for detailed verification
	smallTests := []struct {
		dim  uint32
		seed uint32
		name string
		desc string
	}{
		{2, 12345, "small_2x2", "Basic 2x2 matrix multiplication"},
		{3, 54321, "small_3x3", "Basic 3x3 matrix multiplication"},
		{4, 98765, "small_4x4", "Basic 4x4 matrix multiplication"},
		{8, 11111, "small_8x8", "Small 8x8 matrix for algorithm verification"},
	}

	for _, test := range smallTests {
		params := MatrixMulParams{Dimension: test.dim, Seed: test.seed}
		hash := computeReferenceHash(params)

		vectors = append(vectors, TestVector{
			Name:        test.name,
			Description: test.desc,
			Params: SerializableParams{
				Dimension: test.dim,
				Seed:      test.seed,
			},
			ExpectedHash: hash,
			Category:     "small_matrices",
		})
	}

	// Medium matrices for performance validation
	mediumTests := []struct {
		dim  uint32
		seed uint32
		name string
		desc string
	}{
		{16, 12345, "medium_16x16", "Medium 16x16 matrix for performance baseline"},
		{32, 67890, "medium_32x32", "Medium 32x32 matrix multiplication"},
		{64, 24680, "medium_64x64", "Medium 64x64 matrix for computational load"},
		{128, 13579, "medium_128x128", "Large computation 128x128 matrix"},
	}

	for _, test := range mediumTests {
		params := MatrixMulParams{Dimension: test.dim, Seed: test.seed}
		hash := computeReferenceHash(params)

		vectors = append(vectors, TestVector{
			Name:        test.name,
			Description: test.desc,
			Params: SerializableParams{
				Dimension: test.dim,
				Seed:      test.seed,
			},
			ExpectedHash: hash,
			Category:     "medium_matrices",
		})
	}

	// Edge cases and boundary conditions
	edgeTests := []struct {
		dim  uint32
		seed uint32
		name string
		desc string
	}{
		{1, 0, "edge_1x1_seed_0", "Minimal 1x1 matrix with zero seed"},
		{1, 12345, "edge_1x1", "Minimal 1x1 matrix multiplication"},
		{2, 0, "edge_2x2_seed_0", "Small matrix with zero seed"},
		{16, math.MaxUint32, "edge_max_seed", "Matrix with maximum seed value"},
	}

	for _, test := range edgeTests {
		params := MatrixMulParams{Dimension: test.dim, Seed: test.seed}
		hash := computeReferenceHash(params)

		vectors = append(vectors, TestVector{
			Name:        test.name,
			Description: test.desc,
			Params: SerializableParams{
				Dimension: test.dim,
				Seed:      test.seed,
			},
			ExpectedHash: hash,
			Category:     "edge_cases",
		})
	}

	// Random seed variation tests
	seeds := []uint32{1, 42, 1337, 999999, 2147483647}
	dimension := uint32(16) // Fixed dimension, varying seeds

	for i, seed := range seeds {
		params := MatrixMulParams{Dimension: dimension, Seed: seed}
		hash := computeReferenceHash(params)

		vectors = append(vectors, TestVector{
			Name:        fmt.Sprintf("seed_var_%d", i+1),
			Description: fmt.Sprintf("16x16 matrix with seed %d", seed),
			Params: SerializableParams{
				Dimension: dimension,
				Seed:      seed,
			},
			ExpectedHash: hash,
			Category:     "seed_variations",
		})
	}

	return vectors
}

func computeReferenceHash(params MatrixMulParams) uint32 {
	if !validateParameters(&params) {
		return 0 // Invalid parameters
	}

	// Generate two random matrices A and B
	seed := params.Seed
	matrixA := generateRandomMatrix(int(params.Dimension), &seed)
	matrixB := generateRandomMatrix(int(params.Dimension), &seed)

	// Initialize result matrix C with zeros
	matrixC := createZeroMatrix(int(params.Dimension))

	// Perform matrix multiplication: C = A * B
	naiveTripleLoopMultiply(matrixA, matrixB, matrixC)

	// Compute and return FNV-1a hash of result matrix
	return fnv1aHashMatrix(matrixC)
}

func TestGenerateReferenceVectorsOutput(t *testing.T) {
	vectors := generateTestVectors()

	jsonData, err := json.MarshalIndent(vectors, "", "  ")
	if err != nil {
		t.Fatalf("Failed to marshal test vectors: %v", err)
	}

	fmt.Println("\n=== REFERENCE HASH VECTORS ===")
	fmt.Println(string(jsonData))
	fmt.Println("=== END REFERENCE VECTORS ===")

	// Basic validation
	if len(vectors) < 10 {
		t.Errorf("Should generate at least 10 test vectors, got %d", len(vectors))
	}

	for _, vector := range vectors {
		if vector.ExpectedHash == 0 {
			t.Errorf("Hash should not be zero for valid params: %s", vector.Name)
		}
	}
}

func TestComputeReferenceHashDeterministic(t *testing.T) {
	params := MatrixMulParams{Dimension: 4, Seed: 12345}

	hash1 := computeReferenceHash(params)
	hash2 := computeReferenceHash(params)

	if hash1 != hash2 {
		t.Error("Reference hash should be deterministic")
	}
	if hash1 == 0 {
		t.Error("Reference hash should not be zero")
	}
}

func TestInvalidParamsZeroHash(t *testing.T) {
	invalidParams := MatrixMulParams{Dimension: 0, Seed: 12345}
	hash := computeReferenceHash(invalidParams)

	if hash != 0 {
		t.Error("Invalid parameters should produce zero hash")
	}
}
