// frontend/src/App.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Trophy, Skull, Target, Shield, Zap, Users, TrendingUp, Clock, RefreshCw, AlertCircle } from 'lucide-react';
import './App.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function App() {
  const [activeTab, setActiveTab] = useState('meme-stats');
  const [sortBy, setSortBy] = useState('average_deaths');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const statConfigs = {
    average_deaths: {
      title: 'Death Count',
      icon: <Skull className="w-5 h-5" />,
      suffix: ' per game',
      color: 'text-red-500',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      desc: 'Professional feeding stats',
      sortOrder: 'desc' // Higher is "better" for memes
    },
    average_kills: {
      title: 'Kill Count', 
      icon: <Target className="w-5 h-5" />,
      suffix: ' per game',
      color: 'text-orange-500',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      desc: 'Assassination attempts',
      sortOrder: 'desc'
    },
    kda_ratio: {
      title: 'KDA Ratio',
      icon: <TrendingUp className="w-5 h-5" />,
      suffix: '',
      color: 'text-purple-500',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      desc: 'Actual skill metric',
      sortOrder: 'desc'
    },
    winrate: {
      title: 'Win Rate',
      icon: <Trophy className="w-5 h-5" />,
      suffix: '%',
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
      desc: 'Carried or carrying?',
      sortOrder: 'desc'
    },
    champion_variety: {
      title: 'Champion Pool',
      icon: <Users className="w-5 h-5" />,
      suffix: ' champs',
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      desc: 'One-trick or versatile?',
      sortOrder: 'desc'
    },
    total_games: {
      title: 'Games Played',
      icon: <Clock className="w-5 h-5" />,
      suffix: ' games',
      color: 'text-green-500',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      desc: 'Time wasted in queue',
      sortOrder: 'desc'
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🔄 Fetching stats from:', `${API_BASE_URL}/api/stats`);
      const response = await axios.get(`${API_BASE_URL}/api/stats`, {
        timeout: 30000 // 30 second timeout
      });
      
      setData(response.data);
      setLastUpdate(response.data.lastUpdate);
      
      console.log('📊 Stats loaded:', response.data);
    } catch (err) {
      console.error('❌ Error fetching stats:', err);
      
      if (err.code === 'ECONNABORTED') {
        setError('Request timed out. The server might be scraping data, please wait a moment and try again.');
      } else if (err.response?.status === 429) {
        setError('Too many requests. Please wait a minute before trying again.');
      } else {
        setError(err.response?.data?.error || err.message || 'Failed to load stats');
      }
    } finally {
      setLoading(false);
    }
  };

  const forceRefresh = async () => {
    try {
      setRefreshing(true);
      setError(null);
      
      console.log('🔄 Forcing fresh scrape...');
      const response = await axios.post(`${API_BASE_URL}/api/scrape-fresh`, {}, {
        timeout: 60000 // 60 second timeout for fresh scrape
      });
      
      setData(response.data);
      setLastUpdate(response.data.lastUpdate);
      
      console.log('🔄 Fresh data loaded:', response.data);
    } catch (err) {
      console.error('❌ Error refreshing stats:', err);
      
      if (err.response?.status === 429) {
        setError('Rate limited. Please wait a minute before forcing another refresh.');
      } else {
        setError(err.response?.data?.error || 'Failed to refresh stats. Try again in a few minutes.');
      }
    } finally {
      setRefreshing(false);
    }
  };

  const getSortedPlayers = () => {
    if (!data || !data.stats || !data.stats[sortBy]) {
      return [];
    }

    const stats = data.stats[sortBy];
    const players = Object.keys(data.players || {}).map(playerName => ({
      name: playerName,
      ...data.players[playerName],
      statValue: stats[playerName] || 0
    }));

    const config = statConfigs[sortBy];
    const sortOrder = config?.sortOrder || 'desc';

    return players.sort((a, b) => {
      if (sortOrder === 'desc') {
        return b.statValue - a.statValue;
      }
      return a.statValue - b.statValue;
    });
  };

  const getRankEmoji = (index, statType) => {
    const config = statConfigs[statType];
    const isWorseFirst = config?.sortOrder === 'desc' && 
      (statType === 'average_deaths');

    if (isWorseFirst) {
      // For deaths, first place is actually worst
      const emojis = ['💀', '😵', '😔', '😐', '😊'];
      return emojis[index] || '😅';
    } else {
      // For good stats, first place is best
      const emojis = ['🥇', '🥈', '🥉', '💩', '💀'];
      return emojis[index] || '😢';
    }
  };

  const getBorderAnimation = (index) => {
    if (index === 0) return 'animate-pulse border-2 shadow-lg transform scale-[1.02]';
    return 'border';
  };

  const formatStatValue = (value, suffix) => {
    if (typeof value !== 'number') return `0${suffix}`;
    
    if (value > 100 && !suffix.includes('%')) {
      return `${Math.round(value)}${suffix}`;
    }
    return `${Math.round(value * 100) / 100}${suffix}`;
  };

  const getStatDescription = (playerName, statType) => {
    if (!data?.stats) return '';
    
    const deathCategory = data.stats.death_rate_category?.[playerName];
    const kdaCategory = data.stats.kda_category?.[playerName];
    
    if (statType === 'average_deaths' && deathCategory) {
      return deathCategory;
    }
    if (statType === 'kda_ratio' && kdaCategory) {
      return kdaCategory;
    }
    
    return statConfigs[statType]?.desc || '';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-white mx-auto"></div>
          <p className="text-white text-xl mt-4">Loading epic stats...</p>
          <p className="text-blue-200 text-sm mt-2">Scraping OP.GG for maximum roast potential</p>
          <p className="text-blue-300 text-xs mt-2">This might take up to 30 seconds...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center p-4">
        <div className="text-center bg-red-500/20 backdrop-blur-sm rounded-lg p-8 max-w-md">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-white text-2xl font-bold mb-4">Oops! Something went wrong</h2>
          <p className="text-red-200 mb-6 text-sm">{error}</p>
          <div className="space-y-3">
            <button
              onClick={fetchStats}
              disabled={loading}
              className="w-full bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Try Again'}
            </button>
            <p className="text-xs text-red-300">
              If this persists, check if the summoner names in the backend are correct and exist on OP.GG
            </p>
          </div>
        </div>
      </div>
    );
  }

  const sortedPlayers = getSortedPlayers();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 tracking-tight">
            League Leaderboard
          </h1>
          <p className="text-xl text-blue-200 mb-6">
            Where friendships go to die and egos get crushed ⚔️
          </p>
          
          {/* Update Info & Controls */}
          <div className="flex flex-col sm:flex-row justify-center items-center space-y-2 sm:space-y-0 sm:space-x-4 mb-4">
            <p className="text-sm text-blue-300">
              Last updated: {lastUpdate ? new Date(lastUpdate).toLocaleString() : 'Never'}
              {data?.cached && <span className="text-yellow-300"> (cached)</span>}
            </p>
            <button
              onClick={forceRefresh}
              disabled={refreshing}
              className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-2"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Refreshing...' : 'Force Refresh'}</span>
            </button>
          </div>

          {data?.warning && (
            <div className="bg-yellow-500/20 backdrop-blur-sm rounded-lg p-3 mb-4">
              <p className="text-yellow-200 text-sm">⚠️ {data.warning}</p>
            </div>
          )}

          {/* Player Count & Source Info */}
          <div className="text-xs text-blue-300 opacity-75">
            Tracking {data?.playerCount || 0} players • Source: {data?.source || 'OP.GG'}
          </div>
        </div>

        {/* Stat Selection */}
        <div className="mb-8">
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
            <h3 className="text-white text-lg font-semibold mb-4">Select Stat to Rank By:</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {Object.entries(statConfigs).map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  className={`p-3 rounded-lg transition-all transform hover:scale-105 ${
                    sortBy === key
                      ? `${config.bgColor} ${config.borderColor} border-2 ${config.color}`
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <div className="flex flex-col items-center space-y-2">
                    {config.icon}
                    <span className="text-sm font-medium text-center">{config.title}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Leaderboard */}
        <div className="space-y-4">
          {sortedPlayers.length === 0 ? (
            <div className="text-center text-white bg-white/10 backdrop-blur-sm rounded-lg p-8">
              <p className="text-xl mb-2">No player data available</p>
              <p className="text-blue-200 mb-4">This could mean:</p>
              <ul className="text-blue-300 text-sm space-y-1 max-w-md mx-auto">
                <li>• Summoner names in backend don't exist on OP.GG</li>
                <li>• Players have no recent match history</li>
                <li>• OP.GG scraping failed (try force refresh)</li>
                <li>• Wrong region set in backend</li>
              </ul>
              <button
                onClick={forceRefresh}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Try Force Refresh
              </button>
            </div>
          ) : (
            sortedPlayers.map((player, index) => {
              const config = statConfigs[sortBy];
              const isFirst = index === 0;
              const isLast = index === sortedPlayers.length - 1;
              
              return (
                <div
                  key={player.name}
                  className={`
                    ${config.bgColor} ${config.borderColor} ${getBorderAnimation(index)}
                    rounded-xl p-6 transition-all duration-300 hover:shadow-xl
                    ${isLast ? 'opacity-90' : ''}
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="text-3xl">{getRankEmoji(index, sortBy)}</div>
                      <div>
                        <h3 className={`text-xl font-bold ${config.color}`}>
                          {player.display_name || player.summoner_name}
                        </h3>
                        <p className="text-gray-600 text-sm">
                          {player.summoner_name} • {player.rank || 'Unranked'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {getStatDescription(player.name, sortBy)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className={`text-3xl font-bold ${config.color}`}>
                        {formatStatValue(player.statValue, config.suffix)}
                      </div>
                      <div className="text-sm text-gray-600">
                        {config.desc}
                      </div>
                      {/* Show additional stats */}
                      <div className="text-xs text-gray-500 mt-1">
                        KDA: {formatStatValue(data.stats?.kda_ratio?.[player.name] || 0, '')} • 
                        WR: {formatStatValue(data.stats?.winrate?.[player.name] || 0, '%')} • 
                        Games: {data.stats?.total_games?.[player.name] || 0}
                      </div>
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="mt-4">
                    <div className="bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full bg-gradient-to-r transition-all duration-500 ${
                          config.color.includes('red') ? 'from-red-400 to-red-600' :
                          config.color.includes('orange') ? 'from-orange-400 to-orange-600' :
                          config.color.includes('yellow') ? 'from-yellow-400 to-yellow-600' :
                          config.color.includes('green') ? 'from-green-400 to-green-600' :
                          config.color.includes('blue') ? 'from-blue-400 to-blue-600' :
                          config.color.includes('purple') ? 'from-purple-400 to-purple-600' :
                          'from-gray-400 to-gray-600'
                        }`}
                        style={{
                          width: `${Math.max(5, (player.statValue / Math.max(...sortedPlayers.map(p => p.statValue), 1)) * 100)}%`
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Debug Info (only show if there's an error or no data) */}
        {(data?.rawData || data?.error) && (
          <div className="mt-8 bg-gray-800/50 backdrop-blur-sm rounded-lg p-4">
            <details className="text-white">
              <summary className="cursor-pointer text-sm text-gray-300 hover:text-white">
                Debug Info (click to expand)
              </summary>
              <pre className="text-xs text-gray-400 mt-2 overflow-auto max-h-40">
                {JSON.stringify({
                  playerCount: data?.playerCount,
                  hasStats: !!data?.stats,
                  statsKeys: data?.stats ? Object.keys(data.stats) : [],
                  playersKeys: data?.players ? Object.keys(data.players) : [],
                  error: data?.error,
                  rawDataSample: data?.rawData?.slice(0, 1) // Just first player for debugging
                }, null, 2)}
              </pre>
            </details>
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 text-center text-blue-200">
          <p className="text-sm">
            Data sourced from OP.GG • Made with ❤️ and lots of salt
          </p>
          <p className="text-xs mt-2 opacity-75">
            Updates every 15 minutes • Force refresh available • 
            {data?.cached ? 'Currently showing cached data' : 'Live data'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;