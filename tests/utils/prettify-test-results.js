#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const TEST_RESULTS_FILE = './test-results.json';

function prettifyTestResults() {
    try {
        if (!fs.existsSync(TEST_RESULTS_FILE)) {
            console.log('⏭️  No test results file found, skipping prettify');
            return;
        }

        // Read the JSON file
        const rawData = fs.readFileSync(TEST_RESULTS_FILE, 'utf8');

        // Parse and re-stringify with formatting
        const testResults = JSON.parse(rawData);
        const prettyJson = JSON.stringify(testResults, null, 2);

        // Write back the prettified JSON
        fs.writeFileSync(TEST_RESULTS_FILE, `${prettyJson}\n`);

        const fileSize = Math.round(fs.statSync(TEST_RESULTS_FILE).size / 1024);
        console.log(`📄 Test results prettified: ${TEST_RESULTS_FILE} (${fileSize}KB)`);
    } catch (error) {
        console.warn(`⚠️  Failed to prettify test results: ${error.message}`);
    }
}

prettifyTestResults();
