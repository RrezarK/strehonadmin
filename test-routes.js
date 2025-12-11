/**
 * Route Testing Script for Node.js
 * Usage: node test-routes.js
 */

const https = require('https');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function testEndpoint(baseUrl, path, method = 'GET', apiKey = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(baseUrl + path);
        
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        if (apiKey) {
            options.headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ 
                        status: res.statusCode, 
                        data: json,
                        success: res.statusCode >= 200 && res.statusCode < 300
                    });
                } catch (e) {
                    resolve({ 
                        status: res.statusCode, 
                        data: data,
                        success: res.statusCode >= 200 && res.statusCode < 300
                    });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.end();
    });
}

async function runTests() {
    console.log('\n🧪 Testing Modular Routes...\n');

    // Get configuration
    const projectUrl = await question('Enter your Supabase Project URL (e.g., https://xxxxx.supabase.co): ');
    const apiKey = await question('Enter your Supabase Anon Key: ');
    
    const baseUrl = `${projectUrl}/functions/v1/server`;
    
    console.log(`\nBase URL: ${baseUrl}\n`);

    const endpoints = [
        { path: '/make-server-0bdba248/health', auth: false },
        { path: '/make-server-0bdba248/tenants', auth: true },
        { path: '/make-server-0bdba248/plans', auth: true },
        { path: '/make-server-0bdba248/dashboard/metrics', auth: true },
        { path: '/make-server-0bdba248/system/health', auth: true },
        { path: '/make-server-0bdba248/status/services', auth: true },
    ];

    let successCount = 0;
    let failCount = 0;

    for (const endpoint of endpoints) {
        process.stdout.write(`Testing: ${endpoint.path}... `);
        
        try {
            const result = await testEndpoint(
                baseUrl, 
                endpoint.path, 
                'GET', 
                endpoint.auth ? apiKey : null
            );
            
            if (result.success) {
                console.log(`✅ Success (${result.status})`);
                successCount++;
            } else {
                console.log(`⚠️  Status: ${result.status}`);
                failCount++;
            }
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
            failCount++;
        }
    }

    console.log('\n📊 Test Summary:');
    console.log(`  ✅ Passed: ${successCount}`);
    console.log(`  ❌ Failed: ${failCount}`);
    console.log(`  Total: ${endpoints.length}\n`);

    if (failCount === 0) {
        console.log('🎉 All tests passed!\n');
    } else {
        console.log('⚠️  Some tests failed. Check the errors above.\n');
    }

    rl.close();
}

runTests().catch(console.error);


