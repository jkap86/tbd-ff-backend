// Check if any tokens are registered in the database
const https = require('https');

const options = {
  hostname: 'tbd-ff-6abbe03bd5b6.herokuapp.com',
  path: '/api/v1/notifications/token',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  }
};

console.log('Checking push token registration...\n');
console.log('Note: This will fail with 401 (authentication required), but that confirms the endpoint is working.\n');

const req = https.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);

  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });

  res.on('end', () => {
    console.log(`Response: ${body}\n`);

    if (res.statusCode === 401) {
      console.log('✓ Endpoint working (401 = auth required)');
      console.log('\nTo check if YOUR token is registered:');
      console.log('1. Open the app on your iOS device');
      console.log('2. You should be logged in already (from before)');
      console.log('3. Watch Heroku logs:');
      console.log('   heroku logs --tail --app tbd-ff');
      console.log('4. Look for: "Push token registered for user X on ios"');
      console.log('\nIf you don\'t see the registration message:');
      console.log('- Close the app completely');
      console.log('- Open it again (this triggers push notification initialization)');
      console.log('- Or logout and login again');
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error.message);
});

req.end();
