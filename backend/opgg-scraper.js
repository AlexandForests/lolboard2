// backend/opgg-scraper.js
const axios = require('axios');
const cheerio = require('cheerio');

class OPGGScraper {
  constructor() {
    this.baseURL = 'https://www.op.gg/lol/summoners';
    this.region = 'na'; // Change to your region: na, euw, kr, etc.
  }

  async delay(ms = 2000) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getProfileURL(summonerName) {
    // Clean summoner name for URL
    return `${this.baseURL}/${this.region}/${encodeURIComponent(summonerName)}`;
  }

  async scrapePlayerStats(summonerName) {
    try {
      const url = this.getProfileURL(summonerName);
      console.log(`🔍 Scraping: ${summonerName} from ${url}`);

      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        timeout: 15000,
        maxRedirects: 5
      });

      const $ = cheerio.load(response.data);

      // Extract player basic info
      const level = $('[data-testid="summoner-level"]').text().trim() || 
                   $('.summoner-level').text().trim() || 
                   $('div:contains("Level")').next().text().trim();

      const rank = $('[data-testid="tier"]').text().trim() || 
                  $('.tier').text().trim() || 
                  $('div:contains("Rank")').parent().find('div').last().text().trim();

      const winrateText = $('[data-testid="winrate"]').text().trim() || 
                         $('.winrate').text().trim() || 
                         $('div:contains("%")').text().trim();

      // Extract match history - this is the tricky part as OP.GG structure changes
      const recentMatches = [];
      
      // Try multiple selectors for match data
      const matchSelectors = [
        '.game-item',
        '[data-testid="game-item"]',
        '.GameItemWrap',
        '.match-item'
      ];

      let matchesFound = false;
      for (const selector of matchSelectors) {
        $(selector).each((i, element) => {
          if (i >= 20) return false; // Limit to 20 matches
          
          const $match = $(element);
          
          // Try to extract champion name
          const champion = $match.find('.champion-name').text().trim() ||
                          $match.find('[data-testid="champion-name"]').text().trim() ||
                          $match.find('img').attr('alt') ||
                          '';

          // Try to extract KDA
          const kdaElement = $match.find('.kda').text().trim() ||
                            $match.find('[data-testid="kda"]').text().trim() ||
                            $match.find('div:contains("/")').text().trim();

          // Try to extract result
          const result = $match.find('.result').text().trim() ||
                        $match.find('[data-testid="result"]').text().trim() ||
                        ($match.hasClass('win') ? 'Victory' : ($match.hasClass('lose') ? 'Defeat' : ''));

          if (champion && kdaElement) {
            recentMatches.push({
              champion: champion,
              kda: kdaElement,
              result: result || 'Unknown',
              timestamp: Date.now() - (i * 1800000) // Approximate timing
            });
            matchesFound = true;
          }
        });
        
        if (matchesFound) break;
      }

      // If we couldn't find matches with selectors, try a more aggressive approach
      if (recentMatches.length === 0) {
        console.log(`⚠️  No matches found for ${summonerName}, trying fallback method`);
        
        // Look for any text that looks like KDA (e.g., "5/3/7", "12/1/8")
        const kdaRegex = /(\d+)\/(\d+)\/(\d+)/g;
        const bodyText = $.text();
        let match;
        let kdaCount = 0;
        
        while ((match = kdaRegex.exec(bodyText)) !== null && kdaCount < 10) {
          recentMatches.push({
            champion: 'Unknown',
            kda: match[0],
            result: 'Unknown',
            timestamp: Date.now() - (kdaCount * 1800000)
          });
          kdaCount++;
        }
      }

      const playerData = {
        summonerName: summonerName,
        level: level || 'Unknown',
        rank: rank || 'Unranked',
        winrate: winrateText || '0%',
        recentMatches: recentMatches,
        lastUpdate: new Date().toISOString(),
        scrapedFrom: url
      };

      console.log(`✅ Successfully scraped ${summonerName}: ${recentMatches.length} matches found`);
      return playerData;

    } catch (error) {
      console.error(`❌ Error scraping ${summonerName}:`, error.message);
      
      // Return basic structure even on error
      return {
        summonerName: summonerName,
        level: 'Error',
        rank: 'Error',
        winrate: '0%',
        recentMatches: [],
        lastUpdate: new Date().toISOString(),
        error: error.message
      };
    }
  }

  async scrapeMultiplePlayers(summonerNames) {
    console.log(`🎯 Starting to scrape ${summonerNames.length} players...`);
    const results = [];
    
    for (let i = 0; i < summonerNames.length; i++) {
      const name = summonerNames[i];
      console.log(`📊 Progress: ${i + 1}/${summonerNames.length} - Scraping ${name}`);
      
      try {
        const playerData = await this.scrapePlayerStats(name);
        results.push(playerData);
        
        // Be respectful - wait between requests
        if (i < summonerNames.length - 1) {
          console.log('⏱️  Waiting 3 seconds before next request...');
          await this.delay(3000);
        }
      } catch (error) {
        console.error(`💥 Failed to scrape ${name}:`, error.message);
        results.push({
          summonerName: name,
          error: error.message,
          lastUpdate: new Date().toISOString()
        });
      }
    }

    console.log(`🎉 Scraping complete! ${results.length} players processed.`);
    return results;
  }

  calculateMemeStats(playersData) {
    console.log('🧮 Calculating meme stats...');
    
    const stats = {
      players: {},
      memeStats: {}
    };

    playersData.forEach(player => {
      if (player.error) {
        console.log(`⚠️  Skipping ${player.summonerName} due to error: ${player.error}`);
        return;
      }

      const playerId = player.summonerName;
      
      // Extract winrate percentage
      const winrateMatch = player.winrate.match(/(\d+)%/);
      const winrateNum = winrateMatch ? parseInt(winrateMatch[1]) : 0;

      stats.players[playerId] = {
        display_name: playerId,
        summoner_name: playerId,
        rank: player.rank,
        level: player.level,
        winrate: winrateNum
      };

      // Calculate stats from recent matches
      const matches = player.recentMatches || [];
      console.log(`📈 Processing ${matches.length} matches for ${playerId}`);

      if (matches.length > 0) {
        // Parse KDA from matches
        const kdas = matches.map(match => {
          const kdaMatch = match.kda.match(/(\d+)\/(\d+)\/(\d+)/);
          if (kdaMatch) {
            return {
              kills: parseInt(kdaMatch[1]),
              deaths: parseInt(kdaMatch[2]),
              assists: parseInt(kdaMatch[3])
            };
          }
          return null;
        }).filter(kda => kda !== null);

        if (kdas.length > 0) {
          const avgKills = kdas.reduce((sum, kda) => sum + kda.kills, 0) / kdas.length;
          const avgDeaths = kdas.reduce((sum, kda) => sum + kda.deaths, 0) / kdas.length;
          const avgAssists = kdas.reduce((sum, kda) => sum + kda.assists, 0) / kdas.length;

          // Count wins/losses from results
          const wins = matches.filter(m => 
            m.result.toLowerCase().includes('victory') || 
            m.result.toLowerCase().includes('win')
          ).length;

          const matchWinrate = matches.length > 0 ? (wins / matches.length) * 100 : winrateNum;

          stats.memeStats[playerId] = {
            average_deaths: Math.round(avgDeaths * 100) / 100,
            average_kills: Math.round(avgKills * 100) / 100,
            average_assists: Math.round(avgAssists * 100) / 100,
            kda_ratio: Math.round(((avgKills + avgAssists) / Math.max(avgDeaths, 0.1)) * 100) / 100,
            winrate: Math.round(matchWinrate * 100) / 100,
            total_games: matches.length,
            champion_variety: new Set(matches.map(m => m.champion).filter(c => c !== 'Unknown')).size,
            recent_matches: matches.length
          };
        } else {
          // No valid KDA data, use defaults
          stats.memeStats[playerId] = {
            average_deaths: 0,
            average_kills: 0,
            average_assists: 0,
            kda_ratio: 0,
            winrate: winrateNum,
            total_games: 0,
            champion_variety: 0,
            recent_matches: matches.length
          };
        }
      } else {
        // No matches found
        stats.memeStats[playerId] = {
          average_deaths: 0,
          average_kills: 0,
          average_assists: 0,
          kda_ratio: 0,
          winrate: winrateNum,
          total_games: 0,
          champion_variety: 0,
          recent_matches: 0
        };
      }
    });

    console.log('✨ Meme stats calculation complete!');
    return stats;
  }
}

module.exports = OPGGScraper;