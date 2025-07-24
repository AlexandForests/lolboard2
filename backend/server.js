// backend/server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const OPGGScraper = require('./opgg-scraper');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration for production
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [process.env.FRONTEND_URL, 'https://your-app-name.netlify.app']
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));

app.use(express.json());

const scraper = new OPGGScraper();

// 🎯 YOUR FRIEND GROUP - UPDATE THESE WITH REAL SUMMONER NAMES!
const FRIEND_GROUP = [
{ "summoner_name": "sugarandolive128-NA1", "display_name": "las begas" },
{ "summoner_name": "TheRat-Na11", "display_name": "Smelliest Clown" },
{ "summoner_name": "SchmoneSchwolf-7324", "display_name": "Death Factory CEO" },
{ "summoner_name": "Saladsensei-NA1", "display_name": "Elite500 of NA" },
{ "summoner_name": "Pablo-CEO", "display_name": "Raptors for Breakfast" },
{ "summoner_name": "GROWYRHAIROUT-FUNNY", "display_name": "Chime Minister" },
{ "summoner_name": "Crane-C9LOL", "display_name": "Mixed Bobby Fischer" },
{ "summoner_name": "Salverz-NA1", "display_name": "Throwing Krugs" },
{ "summoner_name": "Willow-flwrs", "display_name": "Mid lane FREAK" }
  // 👆 REPLACE THESE WITH YOUR ACTUAL FRIENDS' SUMMONER NAMES!
];

// Simple in-memory cache
let cachedData = null;
let lastUpdate = null;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

// Rate limiting to prevent abuse
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10;

function checkRateLimit(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, []);
  }
  
  const requests = rateLimitMap.get(ip).filter(time => time > windowStart);
  
  if (requests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  requests.push(now);
  rateLimitMap.set(ip, requests);
  return true;
}

// Middleware for rate limiting
function rateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ 
      error: 'Too many requests. Please wait a minute before trying again.',
      retryAfter: 60
    });
  }
  
  next();
}

// Routes

app.get('/', (req, res) => {
  res.json({ 
    message: '🎮 League of Legends Friend Group Leaderboard API',
    version: '1.0.0',
    status: 'Ready to roast your friends!',
    endpoints: {
      '/api/stats': 'Get leaderboard stats (cached)',
      '/api/scrape-fresh': 'Force fresh scrape (rate limited)',
      '/api/players': 'Get player list',
      '/health': 'Health check'
    }
  });
});

app.get('/api/test', (req, res) => {
  res.json({ 
    message: '🚀 Backend is working!', 
    timestamp: new Date().toISOString(),
    mode: 'OP.GG Scraping',
    friendCount: FRIEND_GROUP.length,
    cacheStatus: cachedData ? 'Available' : 'Empty'
  });
});

// Get player list
app.get('/api/players', (req, res) => {
  res.json({
    players: FRIEND_GROUP,
    totalPlayers: FRIEND_GROUP.length,
    lastUpdate: lastUpdate ? new Date(lastUpdate).toISOString() : null
  });
});

// Main stats endpoint with caching
app.get('/api/stats', async (req, res) => {
  try {
    // Check if we have fresh cached data
    if (cachedData && lastUpdate && (Date.now() - lastUpdate) < CACHE_DURATION) {
      console.log('📦 Returning cached data');
      return res.json({
        ...cachedData,
        cached: true,
        cacheAge: Math.round((Date.now() - lastUpdate) / 1000 / 60) // minutes
      });
    }

    console.log('🔄 Cache is stale or empty, fetching fresh data...');
    await fetchFreshData();
    
    res.json({
      ...cachedData,
      cached: false,
      cacheAge: 0
    });

  } catch (error) {
    console.error('💥 Stats error:', error);
    
    // Return cached data if available, even if stale
    if (cachedData) {
      return res.json({
        ...cachedData,
        warning: 'Using stale data due to scraping error',
        cached: true,
        error: error.message
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch stats',
      details: error.message,
      suggestion: 'Try again in a few minutes'
    });
  }
});

// Force fresh scrape (rate limited)
app.post('/api/scrape-fresh', rateLimitMiddleware, async (req, res) => {
  try {
    console.log('🔄 Forcing fresh scrape...');
    await fetchFreshData();
    
    res.json({
      ...cachedData,
      message: 'Fresh data scraped successfully!',
      cached: false
    });

  } catch (error) {
    console.error('💥 Fresh scrape error:', error);
    res.status(500).json({ 
      error: 'Failed to scrape fresh data',
      details: error.message
    });
  }
});

// Get individual player details
app.get('/api/player/:summonerName', rateLimitMiddleware, async (req, res) => {
  try {
    const { summonerName } = req.params;
    console.log(`🔍 Fetching individual data for ${summonerName}`);
    
    const playerData = await scraper.scrapePlayerStats(summonerName);
    res.json(playerData);
  } catch (error) {
    console.error(`💥 Error fetching ${req.params.summonerName}:`, error);
    res.status(500).json({ 
      error: 'Failed to fetch player data',
      player: req.params.summonerName,
      details: error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cacheStatus: cachedData ? 'Available' : 'Empty',
    lastUpdate: lastUpdate ? new Date(lastUpdate).toISOString() : 'Never',
    playerCount: FRIEND_GROUP.length
  });
});

// Fetch fresh data function
async function fetchFreshData() {
  const summonerNames = FRIEND_GROUP.map(friend => friend.summoner_name);
  
  const scrapedData = await scraper.scrapeMultiplePlayers(summonerNames);
  const processedStats = scraper.calculateMemeStats(scrapedData);
  
  // Add display names
  Object.keys(processedStats.players).forEach(playerName => {
    const friend = FRIEND_GROUP.find(f => f.summoner_name === playerName);
    if (friend) {
      processedStats.players[playerName].display_name = friend.display_name;
    }
  });

  // Enhanced meme stats calculations
  const memeStats = calculateEnhancedMemeStats(processedStats);

  cachedData = {
    players: processedStats.players,
    stats: memeStats,
    rawData: scrapedData, // Include raw data for debugging
    lastUpdate: new Date().toISOString(),
    source: 'OP.GG Scraping',
    playerCount: Object.keys(processedStats.players).length
  };
  
  lastUpdate = Date.now();
  console.log('✅ Fresh data cached successfully!');
}

// Calculate enhanced meme stats
function calculateEnhancedMemeStats(processedStats) {
  const players = Object.keys(processedStats.memeStats);
  const stats = {};

  // Core stats
  const statTypes = [
    'average_deaths',
    'average_kills', 
    'average_assists',
    'kda_ratio',
    'winrate',
    'champion_variety',
    'total_games'
  ];

  statTypes.forEach(statType => {
    stats[statType] = {};
    players.forEach(player => {
      stats[statType][player] = processedStats.memeStats[player]?.[statType] || 0;
    });
  });

  // Meme categories
  stats.player_categories = {};
  stats.death_rate_category = {};
  stats.kda_category = {};
  
  players.forEach(player => {
    const playerStats = processedStats.memeStats[player];
    if (playerStats) {
      // Death rate categories
      const avgDeaths = playerStats.average_deaths || 0;
      if (avgDeaths > 8) {
        stats.death_rate_category[player] = 'Professional Feeder 💀';
      } else if (avgDeaths > 6) {
        stats.death_rate_category[player] = 'Casual Inter 😵';
      } else if (avgDeaths > 4) {
        stats.death_rate_category[player] = 'Risky Player ⚡';
      } else if (avgDeaths > 2) {
        stats.death_rate_category[player] = 'Decent Human 😐';
      } else {
        stats.death_rate_category[player] = 'KDA Player 😎';
      }

      // KDA categories
      const kda = playerStats.kda_ratio || 0;
      if (kda > 3) {
        stats.kda_category[player] = 'Smurf Alert 🚨';
      } else if (kda > 2) {
        stats.kda_category[player] = 'Actually Good 👍';
      } else if (kda > 1.5) {
        stats.kda_category[player] = 'Decent Player 👌';
      } else if (kda > 1) {
        stats.kda_category[player] = 'Needs Improvement 📈';
      } else {
        stats.kda_category[player] = 'Questionable Choices 🤔';
      }
    }
  });

  return stats;
}

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('💥 Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: error.message,
    timestamp: new Date().toISOString()
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Tracking ${FRIEND_GROUP.length} players`);
  console.log(`🎯 Mode: OP.GG Scraping with ${CACHE_DURATION/1000/60} minute cache`);
  console.log(`🌐 CORS enabled for: ${process.env.NODE_ENV === 'production' ? 'Production domains' : 'localhost:3000'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('💤 Server closed');
    process.exit(0);
  });
});

module.exports = app;