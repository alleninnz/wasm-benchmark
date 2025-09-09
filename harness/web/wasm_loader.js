/**
 * WebAssembly Module Loader
 * Handles loading and instantiation of WASM modules with unified interface
 */

export class WasmLoader {
    constructor() {
        this.loadedModules = new Map();
        this.moduleCache = new Map();
        this.loadingPromises = new Map();
        
        // Constants
        this.REQUIRED_EXPORTS = ['init', 'alloc', 'run_task', 'memory'];
        this.WASM_PAGE_SIZE = 65536;
        this.MAX_MODULE_ID_LENGTH = 100;
        this.MAX_DATA_SIZE = 100 * 1024 * 1024; // 100MB safety limit
    }

    /**
     * Load a WASM module from file path
     * @param {string} wasmPath - Path to the .wasm file
     * @param {string} moduleId - Unique identifier for the module
     * @returns {Promise<WebAssembly.Instance>}
     */
    async loadModule(wasmPath, moduleId) {
        // Input validation
        if (typeof wasmPath !== 'string' || !wasmPath.trim()) {
            throw new Error('loadModule: wasmPath must be a non-empty string');
        }
        if (typeof moduleId !== 'string' || !moduleId.trim()) {
            throw new Error('loadModule: moduleId must be a non-empty string');
        }
        if (moduleId.length > this.MAX_MODULE_ID_LENGTH) {
            throw new Error(`loadModule: moduleId exceeds maximum length of ${this.MAX_MODULE_ID_LENGTH} characters`);
        }

        // Check if already loaded
        if (this.loadedModules.has(moduleId)) {
            window.logResult && window.logResult(`Using cached module: ${moduleId}`);
            return this.loadedModules.get(moduleId);
        }

        // Check if currently loading
        if (this.loadingPromises.has(moduleId)) {
            window.logResult && window.logResult(`Waiting for module load: ${moduleId}`);
            return this.loadingPromises.get(moduleId);
        }

        const loadPromise = this._loadModuleInternal(wasmPath, moduleId);
        this.loadingPromises.set(moduleId, loadPromise);

        try {
            const instance = await loadPromise;
            this.loadedModules.set(moduleId, instance);
            this.loadingPromises.delete(moduleId);
            return instance;
        } catch (error) {
            this.loadingPromises.delete(moduleId);
            throw error;
        }
    }

    /**
     * Internal module loading implementation
     * @private
     */
    async _loadModuleInternal(wasmPath, moduleId) {
        try {
            window.logResult(`Loading WASM module: ${moduleId} from ${wasmPath}`);
            
            // Fetch the WASM bytes
            const response = await fetch(wasmPath);
            if (!response.ok) {
                const errorMsg = `Failed to fetch WASM module from ${wasmPath}: ${response.status} ${response.statusText}`;
                if (response.status === 404) {
                    throw new Error(`${errorMsg}. Check that the WASM file exists and the path is correct.`);
                } else if (response.status >= 500) {
                    throw new Error(`${errorMsg}. Server error - check server logs and try again.`);
                } else {
                    throw new Error(`${errorMsg}. Check network connectivity and server configuration.`);
                }
            }
            
            const wasmBytes = await response.arrayBuffer();
            window.logResult(`Fetched ${wasmBytes.byteLength} bytes for ${moduleId}`);
            
            // Instantiate the WASM module with imports for both Rust and TinyGo
            const imports = {
                env: {
                    // Standard library functions that might be needed
                    abort: () => {
                        throw new Error('WASM module called abort()');
                    },
                    trace: (ptr, len) => {
                        console.log(`WASM trace: ptr=${ptr}, len=${len}`);
                    }
                },
                // WASI imports for TinyGo compatibility
                wasi_snapshot_preview1: {
                    proc_exit: (code) => {
                        console.log(`WASI proc_exit: ${code}`);
                    },
                    environ_get: () => { return 0; },
                    environ_sizes_get: () => { return 0; },
                    fd_close: () => { return 0; },
                    fd_read: () => { return 0; },
                    fd_seek: () => { return 0; },
                    fd_write: () => { return 0; },
                    path_open: () => { return 0; },
                    random_get: (ptr, len) => {
                        // Simple random implementation for testing - will be updated after instantiation
                        console.log(`WASI random_get called: ptr=${ptr}, len=${len}`);
                        return 0;
                    },
                    clock_time_get: (id, precision, ptr) => {
                        // Return current time in nanoseconds - will be updated after instantiation
                        console.log(`WASI clock_time_get called: id=${id}, precision=${precision}, ptr=${ptr}`);
                        return 0;
                    }
                },
                // Go JS runtime imports for TinyGo with JS interop
                gojs: {
                    // Runtime functions
                    'runtime.ticks': () => { return performance.now(); },
                    'runtime.sleepTicks': (ms) => { console.log(`sleep ${ms}ms`); },
                    'runtime.getRandomData': (ptr, len) => { return 0; },
                    // Syscall/js functions - comprehensive set for TinyGo
                    'syscall/js.valueGet': () => { return 0; },
                    'syscall/js.valueSet': () => { },
                    'syscall/js.valueNew': () => { return 0; },
                    'syscall/js.valueLength': () => { return 0; },
                    'syscall/js.valuePrepareString': () => { return 0; },
                    'syscall/js.valueLoadString': () => { return 0; },
                    'syscall/js.valueCall': () => { return 0; },
                    'syscall/js.finalizeRef': () => { },
                    'syscall/js.stringVal': () => { return 0; },
                    'syscall/js.valueIndex': () => { return 0; },
                    'syscall/js.valueSetIndex': () => { },
                    'syscall/js.valueDelete': () => { },
                    'syscall/js.valueInvoke': () => { return 0; },
                    'syscall/js.valueInstanceOf': () => { return 0; },
                    'syscall/js.copyBytesToGo': () => { return 0; },
                    'syscall/js.copyBytesToJS': () => { return 0; },
                    'debug': () => { }
                }
            };

            const { instance } = await WebAssembly.instantiate(wasmBytes, imports);
            
            // Validate required exports
            this._validateModuleExports(instance, moduleId);
            
            window.logResult(`Successfully loaded ${moduleId}`, 'success');
            return instance;
            
        } catch (error) {
            window.logResult(`Failed to load ${moduleId}: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Validate that the module exports the required functions
     * @private
     */
    _validateModuleExports(instance, moduleId) {
        const exports = instance.exports;
        const missingExports = [];
        
        for (const exportName of this.REQUIRED_EXPORTS) {
            if (!(exportName in exports)) {
                missingExports.push(exportName);
            }
        }
        
        if (missingExports.length > 0) {
            throw new Error(
                `Module ${moduleId} missing required exports: [${missingExports.join(', ')}]. ` +
                `Available exports: [${Object.keys(exports).join(', ')}]. ` +
                `Ensure the WASM module was compiled with the correct interface.`
            );
        }

        // Validate function signatures
        if (typeof exports.init !== 'function') {
            throw new Error(`Module ${moduleId}: init must be a function`);
        }
        if (typeof exports.alloc !== 'function') {
            throw new Error(`Module ${moduleId}: alloc must be a function`);
        }
        if (typeof exports.run_task !== 'function') {
            throw new Error(`Module ${moduleId}: run_task must be a function`);
        }
        if (!(exports.memory instanceof WebAssembly.Memory)) {
            throw new Error(`Module ${moduleId}: memory must be a WebAssembly.Memory`);
        }
    }

    /**
     * Get a loaded module instance
     * @param {string} moduleId 
     * @returns {WebAssembly.Instance|null}
     */
    getModule(moduleId) {
        return this.loadedModules.get(moduleId) || null;
    }

    /**
     * Unload a module and free its resources
     * @param {string} moduleId 
     */
    unloadModule(moduleId) {
        if (this.loadedModules.has(moduleId)) {
            window.logResult(`Unloading module: ${moduleId}`);
            
            const instance = this.loadedModules.get(moduleId);
            
            // Clear any cached data for this module
            this.moduleCache.delete(moduleId);
            this.loadedModules.delete(moduleId);
            
            // Clean up WASM memory if possible
            try {
                // Some WASM modules may export cleanup functions
                if (instance.exports.cleanup && typeof instance.exports.cleanup === 'function') {
                    instance.exports.cleanup();
                }
            } catch (e) {
                // Ignore cleanup errors, not all modules have cleanup
            }
            
            // Force garbage collection if available
            if (typeof window.gc === 'function') {
                window.gc();
            }
        }
    }

    /**
     * Get memory usage statistics for a module
     * @param {string} moduleId 
     * @returns {Object|null}
     */
    getModuleMemoryStats(moduleId) {
        const instance = this.getModule(moduleId);
        if (!instance) return null;

        const memory = instance.exports.memory;
        return {
            pages: memory.buffer.byteLength / this.WASM_PAGE_SIZE,
            bytes: memory.buffer.byteLength,
            maxPages: memory.maximum || 'unlimited'
        };
    }

    /**
     * Write data to WASM memory
     * @param {WebAssembly.Instance} instance 
     * @param {Uint8Array} data 
     * @returns {number} Pointer to allocated data
     */
    writeDataToMemory(instance, data) {
        // Input validation
        if (!instance || !instance.exports) {
            throw new Error('writeDataToMemory: invalid WebAssembly instance');
        }
        if (!(data instanceof Uint8Array)) {
            throw new Error('writeDataToMemory: data must be a Uint8Array');
        }
        if (data.length === 0) {
            throw new Error('writeDataToMemory: data cannot be empty');
        }
        if (data.length > this.MAX_DATA_SIZE) {
            throw new Error(`writeDataToMemory: data size ${data.length} exceeds maximum ${this.MAX_DATA_SIZE} bytes`);
        }
        if (!instance.exports.alloc || typeof instance.exports.alloc !== 'function') {
            throw new Error('writeDataToMemory: instance missing alloc function');
        }
        if (!instance.exports.memory) {
            throw new Error('writeDataToMemory: instance missing memory export');
        }

        try {
            const ptr = instance.exports.alloc(data.length);
            if (ptr === 0) {
                throw new Error('writeDataToMemory: allocation failed - returned null pointer');
            }
            
            const memView = new Uint8Array(instance.exports.memory.buffer);
            if (ptr + data.length > memView.length) {
                throw new Error(`writeDataToMemory: allocated memory ${ptr}+${data.length} exceeds buffer size ${memView.length}`);
            }
            
            memView.set(data, ptr);
            return ptr;
        } catch (error) {
            throw new Error(`writeDataToMemory: failed to write data - ${error.message}`);
        }
    }

    /**
     * Read data from WASM memory
     * @param {WebAssembly.Instance} instance 
     * @param {number} ptr 
     * @param {number} length 
     * @returns {Uint8Array}
     */
    readDataFromMemory(instance, ptr, length) {
        const memView = new Uint8Array(instance.exports.memory.buffer);
        return memView.slice(ptr, ptr + length);
    }

    /**
     * Clear all loaded modules
     */
    clearAll() {
        window.logResult('Clearing all loaded WASM modules');
        this.loadedModules.clear();
        this.moduleCache.clear();
        this.loadingPromises.clear();
        
        // Force garbage collection if available
        if (typeof window.gc === 'function') {
            window.gc();
        }
    }

    /**
     * Get information about all loaded modules
     * @returns {Array}
     */
    getLoadedModulesInfo() {
        const info = [];
        for (const [moduleId, instance] of this.loadedModules) {
            const memStats = this.getModuleMemoryStats(moduleId);
            info.push({
                id: moduleId,
                memoryPages: memStats.pages,
                memoryBytes: memStats.bytes
            });
        }
        return info;
    }
}

// Create a global instance
window.wasmLoader = new WasmLoader();

// Export for use in other modules
export default WasmLoader;