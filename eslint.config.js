import js from '@eslint/js';

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                // Browser globals
                window: 'readonly',
                document: 'readonly',
                console: 'readonly',
                performance: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                fetch: 'readonly',
                Response: 'readonly',
                Request: 'readonly',
                Headers: 'readonly',
                FormData: 'readonly',

                // Node.js globals for scripts
                process: 'readonly',
                Buffer: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                global: 'readonly',

                // WebAssembly globals
                WebAssembly: 'readonly',

                // Test globals (for Vitest)
                describe: 'readonly',
                it: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                vi: 'readonly'
            }
        },
        rules: {
            // Possible problems
            'no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_'
            }],
            'no-undef': 'error',
            'no-unreachable': 'warn',
            'no-duplicate-imports': 'error',

            // Suggestions
            'prefer-const': 'warn',
            'no-var': 'error',
            'prefer-arrow-callback': 'warn',
            'prefer-template': 'warn',
            'prefer-destructuring': ['warn', {
                array: false,
                object: true
            }],

            // Layout & Formatting
            'indent': ['warn', 4, { SwitchCase: 1 }],
            'quotes': ['warn', 'single', { allowTemplateLiterals: true }],
            'semi': ['warn', 'always'],
            'comma-dangle': ['warn', 'never'],
            'object-curly-spacing': ['warn', 'always'],
            'array-bracket-spacing': ['warn', 'never'],
            'space-before-blocks': 'warn',
            'keyword-spacing': 'warn',
            'space-infix-ops': 'warn',
            'eol-last': 'warn',
            'no-trailing-spaces': 'warn',
            'max-len': ['warn', {
                code: 120,
                ignoreUrls: true,
                ignoreStrings: true,
                ignoreTemplateLiterals: true
            }],

            // Best practices
            'eqeqeq': ['error', 'always'],
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-new-func': 'error',
            'no-throw-literal': 'error',
            'no-return-assign': 'error',
            'no-self-compare': 'error',
            'no-unmodified-loop-condition': 'error',
            'no-loop-func': 'error',

            // ES6+ specific
            'arrow-spacing': 'warn',
            'no-confusing-arrow': 'warn',
            'prefer-spread': 'warn',
            'template-curly-spacing': 'warn'
        }
    },
    {
        files: ['tests/**/*.js', '**/*.test.js', '**/*test.js'],
        rules: {
            // Relax some rules for test files
            'no-unused-expressions': 'off',
            'max-len': 'off'
        }
    },
    {
        files: ['scripts/**/*.js'],
        languageOptions: {
            globals: {
                // Additional Node.js globals for scripts
                require: 'readonly',
                module: 'readonly',
                exports: 'readonly'
            }
        }
    },
    {
        files: ['harness/web/**/*.js'],
        languageOptions: {
            globals: {
                // Additional browser-specific globals for web harness
                location: 'readonly',
                navigator: 'readonly',
                history: 'readonly',
                localStorage: 'readonly',
                sessionStorage: 'readonly'
            }
        }
    },
    {
        // Ignore patterns
        ignores: [
            'node_modules/**',
            'builds/**',
            'configs/**',
            'data/**',
            'docs/**',
            'results/**',
            'reports/**',
            'analysis/figures/**',
            'tasks/**',
            '*.wasm',
            '*.tmp',
            'dev-server.log',
            'test-results.json'
        ]
    }
];
