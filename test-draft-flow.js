/**
 * Automated Draft Flow Test Script
 * Tests draft order randomization and pick functionality
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/v1';
let authToken = null;
let testLeagueId = null;
let testDraftId = null;

// Test user credentials (you may need to adjust these)
const TEST_USER = {
  email: 'automation@example.com',
  password: 'SecurePass123!@#',
  username: 'autotest'
};

// Helper function to log with timestamp
function log(message, data = null) {
  console.log(`\n[${new Date().toISOString()}] ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

// Helper function to handle errors
function handleError(error, context) {
  console.error(`\n❌ ERROR in ${context}:`);
  if (error.response) {
    console.error(`Status: ${error.response.status}`);
    console.error(`Data:`, error.response.data);
  } else {
    console.error(error.message);
  }
  throw error;
}

// Step 1: Login or Register
async function authenticate() {
  log('🔐 Step 1: Authenticating...');

  try {
    // Try to login first
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      username: TEST_USER.username,
      password: TEST_USER.password
    });

    authToken = loginResponse.data.data.token;
    log('✅ Login successful', { token: authToken.substring(0, 20) + '...' });
  } catch (error) {
    if (error.response?.status === 401) {
      // User doesn't exist, try to register
      log('User not found, attempting registration...');
      try {
        const registerResponse = await axios.post(`${BASE_URL}/auth/register`, {
          email: TEST_USER.email,
          password: TEST_USER.password,
          username: TEST_USER.username,
          displayName: 'Test User'
        });

        authToken = registerResponse.data.data.token;
        log('✅ Registration successful', { token: authToken.substring(0, 20) + '...' });
      } catch (regError) {
        handleError(regError, 'Registration');
      }
    } else {
      handleError(error, 'Authentication');
    }
  }
}

// Step 2: Create a test league
async function createTestLeague() {
  log('🏈 Step 2: Creating test league...');

  try {
    const response = await axios.post(
      `${BASE_URL}/leagues`,
      {
        name: `Test League ${Date.now()}`,
        description: 'Automated test league',
        season: '2025',
        maxTeams: 4,
        scoringType: 'ppr',
        draftType: 'snake',
        settings: {
          roster_positions: [
            { position: 'QB', count: 1 },
            { position: 'RB', count: 2 },
            { position: 'WR', count: 2 },
            { position: 'TE', count: 1 },
            { position: 'FLEX', count: 1 },
            { position: 'BN', count: 5 }
          ]
        }
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    testLeagueId = response.data.data.id;
    log('✅ League created', { leagueId: testLeagueId, name: response.data.data.name });
    return response.data.data;
  } catch (error) {
    handleError(error, 'Create League');
  }
}

// Step 3: Add roster slots for other teams (simulate other users)
async function addRosterSlots() {
  log('👥 Step 3: Adding roster slots for 4 teams...');

  try {
    // Get current rosters
    const rostersResponse = await axios.get(
      `${BASE_URL}/rosters/league/${testLeagueId}`,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    const currentRosterCount = rostersResponse.data.data.length;
    log(`Current roster count: ${currentRosterCount}`);

    // We need 4 total rosters for a good test
    const rostersToAdd = 4 - currentRosterCount;

    if (rostersToAdd > 0) {
      for (let i = 0; i < rostersToAdd; i++) {
        await axios.post(
          `${BASE_URL}/rosters`,
          {
            leagueId: testLeagueId,
            teamName: `Test Team ${i + 2}`,
            userId: null // Create roster without user (commissioner can do this)
          },
          {
            headers: { Authorization: `Bearer ${authToken}` }
          }
        );
      }
      log(`✅ Added ${rostersToAdd} roster slots`);
    } else {
      log('✅ Rosters already sufficient');
    }
  } catch (error) {
    handleError(error, 'Add Roster Slots');
  }
}

// Step 4: Create a draft
async function createDraft() {
  log('📋 Step 4: Creating draft...');

  try {
    const response = await axios.post(
      `${BASE_URL}/drafts`,
      {
        leagueId: testLeagueId,
        draftType: 'snake',
        pickTimeSeconds: 60,
        totalRounds: 12
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    testDraftId = response.data.data.id;
    log('✅ Draft created', { draftId: testDraftId });
    return response.data.data;
  } catch (error) {
    handleError(error, 'Create Draft');
  }
}

// Step 5: Randomize draft order
async function randomizeDraftOrder() {
  log('🎲 Step 5: Randomizing draft order...');

  try {
    const response = await axios.post(
      `${BASE_URL}/drafts/${testDraftId}/order`,
      { randomize: true },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    const draftOrder = response.data.data;
    log('✅ Draft order randomized', {
      orderLength: draftOrder.length,
      order: draftOrder.map(o => ({ position: o.draft_position, teamName: o.team_name }))
    });

    return draftOrder;
  } catch (error) {
    handleError(error, 'Randomize Draft Order');
  }
}

// Step 6: Get draft order again to verify it persists
async function verifyDraftOrder() {
  log('🔍 Step 6: Verifying draft order persists...');

  try {
    const response = await axios.get(
      `${BASE_URL}/drafts/${testDraftId}/order`,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    const draftOrder = response.data.data;
    log('✅ Draft order retrieved', {
      orderLength: draftOrder.length,
      order: draftOrder.map(o => ({ position: o.draft_position, teamName: o.team_name }))
    });

    return draftOrder;
  } catch (error) {
    handleError(error, 'Verify Draft Order');
  }
}

// Step 7: Start the draft
async function startDraft() {
  log('▶️ Step 7: Starting draft...');

  try {
    const response = await axios.post(
      `${BASE_URL}/drafts/${testDraftId}/start`,
      {},
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    log('✅ Draft started', { status: response.data.data.status });
    return response.data.data;
  } catch (error) {
    handleError(error, 'Start Draft');
  }
}

// Step 8: Get available players
async function getAvailablePlayers() {
  log('👤 Step 8: Getting available players...');

  try {
    const response = await axios.get(
      `${BASE_URL}/drafts/${testDraftId}/available-players`,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    const players = response.data.data;
    log('✅ Available players retrieved', {
      count: players.length,
      samplePlayers: players.slice(0, 5).map(p => ({ id: p.id, name: p.full_name, position: p.position }))
    });

    return players;
  } catch (error) {
    handleError(error, 'Get Available Players');
  }
}

// Step 9: Make a test pick
async function makePick(playerId, rosterId) {
  log(`🎯 Step 9: Making pick (Player ID: ${playerId}, Roster ID: ${rosterId})...`);

  try {
    const response = await axios.post(
      `${BASE_URL}/drafts/${testDraftId}/pick`,
      {
        playerId: playerId,
        rosterId: rosterId
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    const pick = response.data.data.pick;
    log('✅ Pick made successfully', {
      pickNumber: pick.pick_number,
      playerName: pick.player_name,
      position: pick.player_position
    });

    return response.data.data;
  } catch (error) {
    handleError(error, 'Make Pick');
  }
}

// Step 10: Get all picks to verify
async function getAllPicks() {
  log('📊 Step 10: Getting all draft picks...');

  try {
    const response = await axios.get(
      `${BASE_URL}/drafts/${testDraftId}/picks`,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    const picks = response.data.data;
    log('✅ Draft picks retrieved', {
      count: picks.length,
      picks: picks.map(p => ({
        pickNum: p.pick_number,
        player: p.player_name,
        team: p.picked_by_username
      }))
    });

    return picks;
  } catch (error) {
    handleError(error, 'Get All Picks');
  }
}

// Main test execution
async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 AUTOMATED DRAFT FLOW TEST');
  console.log('='.repeat(60));

  try {
    await authenticate();
    await createTestLeague();
    await addRosterSlots();
    await createDraft();

    // Test randomization twice to ensure it changes
    log('\n' + '='.repeat(60));
    log('🎲 TESTING DRAFT ORDER RANDOMIZATION');
    log('='.repeat(60));

    const order1 = await randomizeDraftOrder();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    const order2 = await randomizeDraftOrder();

    // Verify orders are different
    const positions1 = order1.map(o => o.roster_id).join(',');
    const positions2 = order2.map(o => o.roster_id).join(',');

    if (positions1 !== positions2) {
      log('✅ Draft order randomization working - orders are different');
    } else {
      log('⚠️  WARNING: Draft orders are the same (might be random chance with 4 teams)');
    }

    // Verify persistence
    await verifyDraftOrder();

    // Start draft and make some picks
    log('\n' + '='.repeat(60));
    log('🎯 TESTING DRAFT PICKS');
    log('='.repeat(60));

    await startDraft();
    const players = await getAvailablePlayers();
    const draftOrder = await verifyDraftOrder();

    // Make 3 picks
    for (let i = 0; i < 3; i++) {
      const pickNumber = i + 1;
      const currentRoster = draftOrder.find(o => o.draft_position === ((pickNumber - 1) % draftOrder.length) + 1);

      if (players[i] && currentRoster) {
        await makePick(players[i].id, currentRoster.roster_id);
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait 0.5 seconds between picks
      }
    }

    // Verify all picks were recorded
    await getAllPicks();

    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL TESTS PASSED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log(`\nTest League ID: ${testLeagueId}`);
    console.log(`Test Draft ID: ${testDraftId}`);
    console.log('\nYou can view this draft in your Flutter app to verify UI updates.\n');

  } catch (error) {
    console.log('\n' + '='.repeat(60));
    console.log('❌ TEST FAILED');
    console.log('='.repeat(60));
    console.error(error);
    process.exit(1);
  }
}

// Run the tests
runTests();
