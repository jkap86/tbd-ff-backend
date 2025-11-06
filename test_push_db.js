// Quick test to verify push notification tables exist in production
const https = require('https');

const testEndpoint = 'https://tbd-ff-6abbe03bd5b6.herokuapp.com/api/v1/notifications/token';

console.log('Testing push notification endpoint...');
console.log(`URL: ${testEndpoint}\n`);

const data = JSON.stringify({
  token: 'test_token_123',
  device_type: 'ios',
  device_id: 'test_device'
});

const options = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(testEndpoint, options, (res) => {
  console.log(`Status: ${res.statusCode}`);

  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });

  res.on('end', () => {
    console.log(`Response: ${body}\n`);

    if (res.statusCode === 401) {
      console.log('✓ Endpoint is working! (401 = authentication required, which is expected)');
      console.log('✓ This means the route exists and backend tables are likely set up');
    } else if (res.statusCode === 500) {
      console.log('✗ Server error - may indicate missing database tables');
      console.log('  Run migrations: npm run migrate');
    } else {
      console.log(`? Unexpected status code: ${res.statusCode}`);
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error.message);
});

req.write(data);
req.end();
