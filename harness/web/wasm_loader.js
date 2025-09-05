/**
 * WebAssembly Module Loader
 * Handles loading and instantiation of WASM modules with unified interface
 */

export class WasmLoader {
    constructor() {
        this.loadedModules = new Map();
        this.moduleCache = new Map();
        this.loadingPromises = new Map();
    }

    /**
     * Load a WASM module from file path
     * @param {string} wasmPath - Path to the .wasm file
     * @param {string} moduleId - Unique identifier for the module
     * @returns {Promise<WebAssembly.Instance>}
     */
    async loadModule(wasmPath, moduleId) {
        // Check if already loaded
        if (this.loadedModules.has(moduleId)) {
            return this.loadedModules.get(moduleId);
        }

        // Check if currently loading
        if (this.loadingPromises.has(moduleId)) {
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
                throw new Error(`Failed to fetch ${wasmPath}: ${response.statusText}`);
            }
            
            const wasmBytes = await response.arrayBuffer();
            window.logResult(`Fetched ${wasmBytes.byteLength} bytes for ${moduleId}`);
            
            // Instantiate the WASM module with minimal imports
            const imports = {
                env: {
                    // Standard library functions that might be needed
                    abort: () => {
                        throw new Error('WASM module called abort()');
                    },
                    trace: (ptr, len) => {
                        console.log(`WASM trace: ptr=${ptr}, len=${len}`);
                    }
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
        const requiredExports = ['init', 'alloc', 'run_task', 'memory'];
        const exports = instance.exports;
        
        for (const exportName of requiredExports) {
            if (!(exportName in exports)) {
                throw new Error(`Module ${moduleId} missing required export: ${exportName}`);
            }
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
            pages: memory.buffer.byteLength / 65536,
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
        const ptr = instance.exports.alloc(data.length);
        const memView = new Uint8Array(instance.exports.memory.buffer);
        memView.set(data, ptr);
        return ptr;
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