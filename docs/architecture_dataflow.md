# Benchmark Task Architecture

## System Architecture Overview

```mermaid
flowchart TB
    subgraph Input["📥 Input Parameters"]
        P1["Mandelbrot<br/>width, height, max_iter<br/>center_real/imag (f64)<br/>scale_factor (f64)"]
        P2["JSON Parse<br/>data_size<br/>json_string<br/>complexity_level"]
        P3["Matrix Multiply<br/>dimension<br/>seed (u32)<br/>float32 precision"]
    end

    subgraph Impl["🔄 Dual Implementation"]
        direction LR
        subgraph Rust["🦀 Rust"]
            R1["mandelbrot/rust"]
            R2["json_parse/rust"]
            R3["matrix_mul/rust"]
        end

        subgraph TinyGo["🐹 TinyGo"]
            T1["mandelbrot/tinygo"]
            T2["json_parse/tinygo"]
            T3["matrix_mul/tinygo"]
        end
    end

    subgraph Algo["⚙️ Algorithm Consistency"]
        A1["i-k-j loop order<br/>flat memory layout<br/>pre-calc offsets"]
        A2["field extraction<br/>aggregation logic<br/>UTF-8 parsing"]
        A3["complex iteration<br/>f64 coordinate map<br/>divergence check"]
    end

    subgraph Compute["💻 Computation"]
        C1["Mandelbrot Set<br/>Complex plane iteration<br/>Pixel-wise convergence"]
        C2["JSON Aggregation<br/>Field extraction<br/>String/numeric ops"]
        C3["Matrix C = A × B<br/>LCG random gen<br/>Triple loop multiply"]
    end

    subgraph Output["📤 Raw Output"]
        O1["Iteration counts<br/>u32 array<br/>[width × height]"]
        O2["Aggregated values<br/>sum, count, stats<br/>numeric results"]
        O3["Result matrix C<br/>f32 array<br/>[N × N]"]
    end

    subgraph Hash["🔐 FNV-1a Hash Verification"]
        direction TB
        H1["FNV offset: 2166136261<br/>FNV prime: 16777619"]
        H2["Byte-wise hashing<br/>hash = (hash ⊕ byte) × prime"]
        H3["u32 fingerprint<br/>Cross-language validation"]

        H1 --> H2 --> H3
    end

    subgraph Validate["✅ Equivalence Validation"]
        V1["449 Test Vectors<br/>Mandelbrot: 320<br/>JSON: 112<br/>Matrix: 17"]
        V2["Reference Hashes<br/>Rust canonical<br/>JSON storage"]
        V3["Cross-Test<br/>TinyGo vs Rust<br/>Exact match required"]

        V1 --> V2 --> V3
    end

    subgraph Result["📊 Final Output"]
        F1["✅ Hash Match<br/>Functional equivalence proven"]
        F2["❌ Hash Mismatch<br/>Algorithm difference detected"]
        F3["Performance Metrics<br/>Execution time<br/>Memory usage"]
    end

    %% Data flow connections
    P1 --> R1 & T1
    P2 --> R2 & T2
    P3 --> R3 & T3

    R1 & T1 --> A3 --> C1 --> O1
    R2 & T2 --> A2 --> C2 --> O2
    R3 & T3 --> A1 --> C3 --> O3

    O1 & O2 & O3 --> Hash
    Hash --> Validate
    Validate --> Result

    %% Styling
    classDef inputStyle fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef rustStyle fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    classDef goStyle fill:#e0f2f1,stroke:#004d40,stroke-width:2px
    classDef hashStyle fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef validateStyle fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef resultStyle fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px

    class P1,P2,P3 inputStyle
    class R1,R2,R3 rustStyle
    class T1,T2,T3 goStyle
    class H1,H2,H3 hashStyle
    class V1,V2,V3 validateStyle
    class F1,F2,F3 resultStyle
```

## Cross-Language Equivalence Validation

```mermaid
flowchart TB
    subgraph Generate["🦀 Reference Generation (Rust)"]
        G1["Execute Rust implementation<br/>All test cases"]
        G2["Compute FNV-1a hashes<br/>Canonical reference"]
        G3["Export to JSON<br/>449 test vectors"]
    end

    subgraph TestVectors["📋 Test Vector Suite"]
        T1["Mandelbrot: 320 vectors<br/>systematic + edge cases"]
        T2["JSON Parse: 112 vectors<br/>complexity variations"]
        T3["Matrix Multiply: 17 vectors<br/>dimension + seed combos"]
    end

    subgraph Validate["🐹 TinyGo Validation"]
        V1["Load reference hashes<br/>from JSON files"]
        V2["Execute TinyGo implementation<br/>Same parameters"]
        V3["Compute TinyGo hashes<br/>FNV-1a algorithm"]
        V4["Compare hashes<br/>Exact match required"]
    end

    subgraph Result["📊 Validation Result"]
        R1["✅ Full Compatibility<br/>100% match<br/>mandelbrot, json_parse"]
        R2["⚠️ Partial Compatibility<br/>Core cases match<br/>matrix_mul (FP precision)"]
        R3["❌ Incompatibility<br/>Algorithm difference<br/>Implementation bug"]
    end

    G1 --> G2 --> G3
    G3 --> T1 & T2 & T3
    T1 & T2 & T3 --> V1
    V1 --> V2 --> V3 --> V4
    V4 --> R1 & R2 & R3

    style G1 fill:#ffebee
    style G2 fill:#ffebee
    style G3 fill:#ffebee
    style T1 fill:#e3f2fd
    style T2 fill:#e3f2fd
    style T3 fill:#e3f2fd
    style V1 fill:#e0f2f1
    style V2 fill:#e0f2f1
    style V3 fill:#e0f2f1
    style V4 fill:#e0f2f1
    style R1 fill:#e8f5e9
    style R2 fill:#fff9c4
    style R3 fill:#ffebee
```

## Algorithm Consistency Guarantees

```mermaid
mindmap
  root((Algorithm<br/>Consistency))
    Mandelbrot
      Complex iteration: z² + c
      Divergence: |z|² > 4.0
      f64 coordinate mapping
      Same convergence logic
    JSON Parse
      Field extraction order
      Aggregation formulas
      UTF-8 string handling
      Numeric precision rules
    Matrix Multiply
      i-k-j loop order
      Flat memory layout
      Pre-calculated offsets
      LCG: 1664525x + 1013904223
      f32 element precision
    Hash Verification
      FNV-1a algorithm
      Little-endian bytes
      Same iteration order
      Identical constants
```

## Performance Measurement Integration

```mermaid
sequenceDiagram
    participant H as Harness (JS)
    participant W as WASM Module
    participant V as Validator

    Note over H,V: Benchmark Execution Flow

    H->>W: 1. Load WASM (Rust/TinyGo)
    activate W

    H->>W: 2. Call init(seed)
    W-->>H: Initialize

    H->>W: 3. Allocate params memory
    W-->>H: Return pointer

    H->>W: 4. Write parameters

    rect rgb(220, 240, 255)
        Note over H,W: Performance Measurement
        H->>H: Start timer (performance.now())
        H->>W: 5. Call run_task(params_ptr)
        W->>W: Execute computation
        W->>W: Compute FNV-1a hash
        W-->>H: Return u32 hash
        H->>H: Stop timer
        H->>H: Record: time, memory, hash
    end

    deactivate W

    H->>V: 6. Submit hash for validation
    activate V
    V->>V: Compare with reference
    V-->>H: ✅ Pass / ❌ Fail
    deactivate V

    H->>H: 7. Store results
    Note over H: {lang, task, scale, time, hash, valid}
```
