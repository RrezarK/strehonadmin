# Testing Guide for Modular Routes

## Quick Test Methods

### 1. **Local Testing with Supabase CLI**

#### Start Local Development Server
```bash
# Navigate to your project root
cd "C:\Users\User\Downloads\Strehon Admin Panel (1)"

# Start Supabase locally (if you have Supabase CLI)
supabase functions serve server --no-verify-jwt
```

#### Test Health Endpoint
```bash
# Test the health check endpoint
curl http://localhost:54321/functions/v1/server/make-server-0bdba248/health
```

### 2. **Manual API Testing with curl/Postman**

#### Test Key Endpoints

**Health Check:**
```bash
curl -X GET "https://YOUR_PROJECT.supabase.co/functions/v1/server/make-server-0bdba248/health"
```

**Get Tenants:**
```bash
curl -X GET "https://YOUR_PROJECT.supabase.co/functions/v1/server/make-server-0bdba248/tenants" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

**Get Dashboard Metrics:**
```bash
curl -X GET "https://YOUR_PROJECT.supabase.co/functions/v1/server/make-server-0bdba248/dashboard/metrics" \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

### 3. **Browser Testing**

Open your browser and navigate to:
```
https://YOUR_PROJECT.supabase.co/functions/v1/server/make-server-0bdba248/health
```

You should see a JSON response with status "ok".

### 4. **Using Postman/Insomnia**

1. Create a new collection
2. Set base URL: `https://YOUR_PROJECT.supabase.co/functions/v1/server`
3. Add Authorization header: `Bearer YOUR_ANON_KEY`
4. Test endpoints:
   - `GET /make-server-0bdba248/health`
   - `GET /make-server-0bdba248/tenants`
   - `GET /make-server-0bdba248/dashboard/metrics`

## Automated Testing Script

Create a test script to verify all routes:

### Option 1: PowerShell Test Script

```powershell
# test-routes.ps1
$baseUrl = "https://YOUR_PROJECT.supabase.co/functions/v1/server"
$apiKey = "YOUR_ANON_KEY"

$endpoints = @(
    "/make-server-0bdba248/health",
    "/make-server-0bdba248/tenants",
    "/make-server-0bdba248/plans",
    "/make-server-0bdba248/dashboard/metrics"
)

foreach ($endpoint in $endpoints) {
    $url = "$baseUrl$endpoint"
    Write-Host "Testing: $url"
    
    try {
        $response = Invoke-RestMethod -Uri $url -Method Get -Headers @{
            "Authorization" = "Bearer $apiKey"
        }
        Write-Host "✅ Success: $endpoint" -ForegroundColor Green
        Write-Host "Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Gray
    } catch {
        Write-Host "❌ Failed: $endpoint" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    }
    Write-Host ""
}
```

### Option 2: Node.js Test Script

```javascript
// test-routes.js
const https = require('https');

const BASE_URL = 'YOUR_PROJECT.supabase.co';
const API_KEY = 'YOUR_ANON_KEY';
const BASE_PATH = '/functions/v1/server';

const endpoints = [
    '/make-server-0bdba248/health',
    '/make-server-0bdba248/tenants',
    '/make-server-0bdba248/plans',
    '/make-server-0bdba248/dashboard/metrics',
];

function testEndpoint(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: BASE_URL,
            path: BASE_PATH + path,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ status: res.statusCode, data: json });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

async function runTests() {
    console.log('🧪 Testing Routes...\n');
    
    for (const endpoint of endpoints) {
        try {
            const result = await testEndpoint(endpoint);
            if (result.status === 200) {
                console.log(`✅ ${endpoint} - Status: ${result.status}`);
            } else {
                console.log(`⚠️  ${endpoint} - Status: ${result.status}`);
            }
        } catch (error) {
            console.log(`❌ ${endpoint} - Error: ${error.message}`);
        }
    }
}

runTests();
```

## Testing Checklist

### Core Endpoints
- [ ] Health check: `/make-server-0bdba248/health`
- [ ] Get tenants: `/make-server-0bdba248/tenants`
- [ ] Get users: `/make-server-0bdba248/users`
- [ ] Get plans: `/make-server-0bdba248/plans`
- [ ] Dashboard metrics: `/make-server-0bdba248/dashboard/metrics`

### Admin Endpoints
- [ ] Create admin: `POST /make-server-0bdba248/create-admin`
- [ ] Get admin profile: `GET /make-server-0bdba248/admin/me`

### HMS/PMS Endpoints
- [ ] Get guests: `/make-server-0bdba248/guests`
- [ ] Get reservations: `/make-server-0bdba248/reservations`
- [ ] Get rooms: `/make-server-0bdba248/rooms?tenantId=XXX`
- [ ] Get availability rates: `/make-server-0bdba248/availability-rates?tenantId=XXX`

### System Endpoints
- [ ] System health: `/make-server-0bdba248/system/health`
- [ ] Status services: `/make-server-0bdba248/status/services`
- [ ] Verify database: `/make-server-0bdba248/verify-database`

## Common Issues & Solutions

### Issue: 404 Not Found
**Solution:** Check that the route path matches exactly, including the base path `/make-server-0bdba248`

### Issue: 401 Unauthorized
**Solution:** Ensure you're sending the Authorization header with a valid Bearer token

### Issue: CORS Error
**Solution:** The CORS middleware is configured, but check if your frontend origin is allowed

### Issue: Module Not Found
**Solution:** Ensure all route files are in the `routes/` directory and imports are correct

## Deployment Testing

### Deploy to Supabase
```bash
# Deploy the function
supabase functions deploy server

# Check deployment logs
supabase functions logs server
```

### Verify Deployment
1. Check Supabase Dashboard → Edge Functions → server
2. View function logs for any errors
3. Test endpoints using the Supabase API URL

## Performance Testing

### Load Testing (Optional)
Use tools like:
- **Apache Bench (ab)**: `ab -n 100 -c 10 https://YOUR_PROJECT.supabase.co/functions/v1/server/make-server-0bdba248/health`
- **k6**: Load testing tool
- **Postman**: Collection runner with multiple iterations

## Next Steps

1. ✅ Test health endpoint first (no auth required)
2. ✅ Test a few core endpoints (tenants, users, plans)
3. ✅ Test HMS/PMS endpoints (guests, reservations)
4. ✅ Test system endpoints (health, status)
5. ✅ Compare response times with old version
6. ✅ Check logs for any errors or warnings

## Getting Your Project URL

1. Go to Supabase Dashboard
2. Select your project
3. Go to Settings → API
4. Copy:
   - **Project URL**: `https://YOUR_PROJECT.supabase.co`
   - **Anon Key**: Your anonymous key for testing

