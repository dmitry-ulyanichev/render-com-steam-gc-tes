// steam-gc-test.js - Minimal Steam GC connection test for Render.com
const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');
const GlobalOffensive = require('globaloffensive');
const SteamID = require('steamid');

// Load configuration from config.json
const fs = require('fs');
const path = require('path');

function loadConfig() {
    const configPath = path.join(__dirname, 'config.json');
    
    if (!fs.existsSync(configPath)) {
        console.log('❌ config.json not found!');
        console.log('📋 Please create config.json with the following structure:');
        console.log(JSON.stringify({
            "steam_username": "your_steam_username",
            "steam_password": "your_steam_password", 
            "shared_secret": "your_shared_secret_from_mafile",
            "test_steam_id": "76561199556731347"
        }, null, 2));
        process.exit(1);
    }
    
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        // Validate required fields
        const required = ['steam_username', 'steam_password', 'shared_secret'];
        for (const field of required) {
            if (!config[field]) {
                console.log(`❌ Missing required field in config.json: ${field}`);
                process.exit(1);
            }
        }
        
        // Set default test Steam ID if not provided
        if (!config.test_steam_id) {
            config.test_steam_id = '76561199556731347';
        }
        
        return config;
    } catch (error) {
        console.log(`❌ Error reading config.json: ${error.message}`);
        process.exit(1);
    }
}

const config = loadConfig();
const STEAM_USERNAME = config.steam_username;
const STEAM_PASSWORD = config.steam_password;
const SHARED_SECRET = config.shared_secret;
const TEST_STEAM_ID = config.test_steam_id;

console.log('🚀 Steam GC Connection Test Starting...');
console.log(`📊 Test Parameters:`);
console.log(`   - Account: ${STEAM_USERNAME}`);
console.log(`   - Test Steam ID: ${TEST_STEAM_ID}`);
console.log(`   - Environment: ${process.env.NODE_ENV || 'development'}`);
console.log('');

// Initialize Steam clients
const steamClient = new SteamUser();
const csgo = new GlobalOffensive(steamClient);

// State tracking
let testStartTime = Date.now();
let gcConnectStartTime = null;
let testCompleted = false;

// Timeout for overall test (5 minutes max)
const testTimeout = setTimeout(() => {
    if (!testCompleted) {
        console.log('❌ TEST TIMEOUT AFTER 5 MINUTES');
        console.log('🔍 Possible causes:');
        console.log('   - Steam login issues');
        console.log('   - GC connection soft ban');
        console.log('   - Network connectivity problems');
        process.exit(1);
    }
}, 300000); // 5 minutes

// Generate 2FA code
function generateAuthCode() {
    try {
        const authCode = SteamTotp.generateAuthCode(SHARED_SECRET);
        console.log(`✅ Generated 2FA code: ${authCode}`);
        return authCode;
    } catch (error) {
        console.log(`❌ Failed to generate 2FA code: ${error.message}`);
        console.log('🔍 Check your SHARED_SECRET value');
        process.exit(1);
    }
}

// Steam client event handlers
steamClient.on('error', (err) => {
    console.log(`❌ Steam Error: ${err.message}`);
    console.log(`🔍 Error Details:`);
    console.log(`   - EResult: ${err.eresult}`);
    
    if (err.eresult === SteamUser.EResult.InvalidPassword) {
        console.log('   - Diagnosis: Invalid credentials');
    } else if (err.eresult === SteamUser.EResult.TwoFactorCodeMismatch) {
        console.log('   - Diagnosis: 2FA code mismatch');
    } else if (err.eresult === SteamUser.EResult.AccountLoginDeniedNeedTwoFactor) {
        console.log('   - Diagnosis: 2FA required but not provided correctly');
    } else if (err.eresult === SteamUser.EResult.RateLimitExceeded) {
        console.log('   - Diagnosis: Login rate limited');
    } else {
        console.log(`   - Diagnosis: Unknown error (${err.eresult})`);
    }
    
    process.exit(1);
});

steamClient.on('loggedOn', () => {
    const loginDuration = Date.now() - testStartTime;
    console.log(`✅ Steam Login Successful! (${loginDuration}ms)`);
    console.log(`📊 Account Info:`);
    console.log(`   - Steam ID: ${steamClient.steamID.getSteamID64()}`);
    console.log(`   - Account Name: ${steamClient.accountInfo?.name || 'Unknown'}`);
    
    // Set online status
    steamClient.setPersona(SteamUser.EPersonaState.Online);
    
    // Launch CS2 immediately for testing
    console.log('🎮 Launching CS2...');
    gcConnectStartTime = Date.now();
    steamClient.gamesPlayed([730]);
});

steamClient.on('disconnected', (eresult, msg) => {
    console.log(`⚠️ Steam Disconnected: ${eresult} - ${msg}`);
    if (!testCompleted) {
        console.log('🔍 Unexpected disconnection during test');
        process.exit(1);
    }
});

// CS:GO Game Coordinator event handlers
csgo.on('connectedToGC', () => {
    const gcConnectDuration = Date.now() - gcConnectStartTime;
    console.log(`✅ GC Connection Successful! (${gcConnectDuration}ms)`);
    console.log('🔥 NO SOFT BAN DETECTED - Account and IP/hardware are clean');
    console.log('');
    
    // Test profile request
    console.log(`🔍 Testing profile request for ${TEST_STEAM_ID}...`);
    testProfileRequest();
});

csgo.on('disconnectedFromGC', (reason) => {
    console.log(`❌ GC Disconnected: ${reason}`);
    if (!testCompleted) {
        console.log('🔍 This may indicate a soft ban or connection issue');
        process.exit(1);
    }
});

// Test profile request function
function testProfileRequest() {
    const steamIDObj = new SteamID(TEST_STEAM_ID);
    const requestStartTime = Date.now();
    
    // Set timeout for profile request (30 seconds)
    const requestTimeout = setTimeout(() => {
        console.log('❌ Profile Request Timeout (30s)');
        console.log('🔍 Possible causes:');
        console.log('   - GC is throttling requests (soft ban)');
        console.log('   - Steam ID is invalid');
        console.log('   - Network issues');
        completeTest('TIMEOUT');
    }, 30000);
    
    csgo.requestPlayersProfile(steamIDObj, (profile) => {
        clearTimeout(requestTimeout);
        const requestDuration = Date.now() - requestStartTime;
        
        if (profile) {
            console.log(`✅ Profile Request Successful! (${requestDuration}ms)`);
            console.log(`📊 Profile Data:`);
            console.log(`   - Account ID: ${profile.account_id}`);
            console.log(`   - Total Medals: ${profile.medals?.display_items_defidx?.length || 0}`);
            console.log(`   - Commendations: ${JSON.stringify(profile.commendation || {})}`);
            console.log(`   - Level: ${profile.player_level || 'Unknown'}`);
            completeTest('SUCCESS');
        } else {
            console.log(`❌ Profile Request Failed - No data received`);
            completeTest('NO_DATA');
        }
    });
}

// Complete test function
function completeTest(result) {
    if (testCompleted) return;
    testCompleted = true;
    
    clearTimeout(testTimeout);
    const totalDuration = Date.now() - testStartTime;
    
    console.log('');
    console.log('🏁 TEST COMPLETED');
    console.log(`📊 Results:`);
    console.log(`   - Result: ${result}`);
    console.log(`   - Total Duration: ${totalDuration}ms`);
    console.log(`   - Steam Login: ✅ Success`);
    console.log(`   - GC Connection: ${result === 'TIMEOUT' ? '❌ Failed/Banned' : '✅ Success'}`);
    console.log(`   - Profile Request: ${result === 'SUCCESS' ? '✅ Success' : '❌ Failed'}`);
    
    if (result === 'SUCCESS') {
        console.log('');
        console.log('🎉 ALL TESTS PASSED!');
        console.log('✅ Account is NOT banned');
        console.log('✅ IP/Hardware is NOT banned');
        console.log('✅ GC connection is working');
        console.log('🔍 The issue in your main service might be elsewhere');
    } else if (result === 'TIMEOUT') {
        console.log('');
        console.log('🚫 SOFT BAN DETECTED');
        console.log('❌ GC is not responding to requests');
        console.log('🔍 This could be:');
        console.log('   - Account-level soft ban');
        console.log('   - IP/Hardware-level soft ban');
        console.log('   - If this test passes on Render.com but fails locally,');
        console.log('     then it\'s likely IP/Hardware ban on your local setup');
    }
    
    // Clean logout
    try {
        steamClient.logOff();
        console.log('👋 Logged off Steam');
    } catch (error) {
        console.log(`⚠️ Logout error: ${error.message}`);
    }
    
    setTimeout(() => {
        process.exit(result === 'SUCCESS' ? 0 : 1);
    }, 1000);
}

// Start the test
function startTest() {
    console.log('🔐 Generating 2FA code...');
    const authCode = generateAuthCode();
    
    console.log('🔑 Attempting Steam login...');
    steamClient.logOn({
        accountName: STEAM_USERNAME,
        password: STEAM_PASSWORD,
        twoFactorCode: authCode
    });
}

// Add GC connection timeout (2 minutes)
setTimeout(() => {
    if (!testCompleted && gcConnectStartTime) {
        console.log('❌ GC Connection Timeout (2 minutes)');
        console.log('🚫 SOFT BAN LIKELY DETECTED');
        console.log('🔍 GC is not accepting connections within reasonable time');
        completeTest('GC_TIMEOUT');
    }
}, 120000); // 2 minutes after GC connection attempt starts

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n🛑 Test interrupted by user');
    completeTest('INTERRUPTED');
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Test terminated');
    completeTest('TERMINATED');
});

// Start the test
startTest();