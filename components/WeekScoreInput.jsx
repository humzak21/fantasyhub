import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, Calendar, Users, Plus, Trash2 } from 'lucide-react';

const WeekScoreInput = ({ 
  week, 
  teams = [], 
  existingGames = [], 
  onSaveWeek, 
  loading = false,
  isAuthenticated = false // This now represents isAdmin from parent
}) => {
  const [matchups, setMatchups] = useState([]);
  const [weekLoading, setWeekLoading] = useState(false);

  useEffect(() => {
    initializeMatchups();
  }, [week, teams, existingGames]);

  const initializeMatchups = () => {
    if (existingGames.length > 0) {
      // Load existing games
      const gameMatchups = existingGames.map(game => ({
        id: game.id || `${game.team1Id}-${game.team2Id}`,
        team1Id: game.team1Id,
        team2Id: game.team2Id,
        team1Score: game.team1Score || '',
        team2Score: game.team2Score || ''
      }));
      setMatchups(gameMatchups);
    } else {
      // Create empty matchups for manual input
      setMatchups([createEmptyMatchup()]);
    }
  };

  const createEmptyMatchup = () => ({
    id: Date.now() + Math.random(),
    team1Id: '',
    team2Id: '',
    team1Score: '',
    team2Score: ''
  });

  const generateRandomMatchups = () => {
    if (teams.length < 2) return;
    
    const availableTeams = [...teams];
    const newMatchups = [];
    
    // Shuffle teams
    for (let i = availableTeams.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [availableTeams[i], availableTeams[j]] = [availableTeams[j], availableTeams[i]];
    }
    
    // Create matchups
    for (let i = 0; i < availableTeams.length - 1; i += 2) {
      if (availableTeams[i + 1]) {
        newMatchups.push({
          id: `${availableTeams[i].id}-${availableTeams[i + 1].id}`,
          team1Id: availableTeams[i].id,
          team2Id: availableTeams[i + 1].id,
          team1Score: '',
          team2Score: ''
        });
      }
    }
    
    setMatchups(newMatchups);
  };

  const updateMatchup = (index, field, value) => {
    setMatchups(prev => prev.map((matchup, i) => 
      i === index ? { ...matchup, [field]: value } : matchup
    ));
  };

  const addMatchup = () => {
    setMatchups(prev => [...prev, createEmptyMatchup()]);
  };

  const removeMatchup = (index) => {
    setMatchups(prev => prev.filter((_, i) => i !== index));
  };

  const getAvailableTeams = (currentMatchupIndex) => {
    const usedTeamIds = new Set();
    
    matchups.forEach((matchup, index) => {
      if (index !== currentMatchupIndex) {
        if (matchup.team1Id) usedTeamIds.add(matchup.team1Id);
        if (matchup.team2Id) usedTeamIds.add(matchup.team2Id);
      }
    });
    
    return teams.filter(team => !usedTeamIds.has(team.id));
  };

  const validateMatchups = () => {
    for (const matchup of matchups) {
      if (!matchup.team1Id || !matchup.team2Id) {
        return 'All matchups must have both teams selected.';
      }
      if (matchup.team1Id === matchup.team2Id) {
        return 'A team cannot play against itself.';
      }
      if (matchup.team1Score === '' || matchup.team2Score === '') {
        return 'All scores must be entered.';
      }
      if (isNaN(matchup.team1Score) || isNaN(matchup.team2Score)) {
        return 'All scores must be valid numbers.';
      }
      if (matchup.team1Score < 0 || matchup.team2Score < 0) {
        return 'Scores cannot be negative.';
      }
    }
    return null;
  };

  const handleSave = async () => {
    const error = validateMatchups();
    if (error) {
      alert(error);
      return;
    }

    setWeekLoading(true);
    try {
      const scores = {};
      matchups.forEach((matchup, index) => {
        scores[index] = {
          team1Id: matchup.team1Id,
          team2Id: matchup.team2Id,
          team1Score: parseFloat(matchup.team1Score),
          team2Score: parseFloat(matchup.team2Score)
        };
      });

      await onSaveWeek(week, scores);
    } catch (error) {
      alert('Error saving week scores. Please try again.');
    } finally {
      setWeekLoading(false);
    }
  };

  const getTeamName = (teamId) => {
    const team = teams.find(t => t.id === teamId);
    return team ? team.name : 'Select Team';
  };

  const isComplete = matchups.length > 0 && matchups.every(m => 
    m.team1Id && m.team2Id && m.team1Score !== '' && m.team2Score !== ''
  );

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Calendar className="text-blue-600" size={20} />
          <h3 className="text-lg font-semibold">Week {week} Matchups</h3>
        </div>
        
        {isAuthenticated && (
          <div className="flex gap-2">
            <button
              onClick={generateRandomMatchups}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              disabled={teams.length < 2}
            >
              <RefreshCw size={16} />
              Generate Random
            </button>
            
            <button
              onClick={handleSave}
              disabled={!isComplete || weekLoading}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg transition-colors ${
                isComplete && !weekLoading
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {weekLoading ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              {weekLoading ? 'Saving...' : 'Save Week'}
            </button>
          </div>
        )}
      </div>

      {teams.length < 2 ? (
        <div className="text-center py-8 text-gray-500">
          <Users size={48} className="mx-auto mb-4 text-gray-300" />
          <p>You need at least 2 teams to create matchups.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {matchups.map((matchup, index) => (
            <div key={matchup.id} className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-4">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
                  {/* Team 1 */}
                  <div>
                    <label className="block text-sm font-medium mb-1">Team 1</label>
                    <select
                      value={matchup.team1Id}
                      onChange={(e) => updateMatchup(index, 'team1Id', e.target.value)}
                      className="w-full p-2 border rounded-lg"
                      disabled={!isAuthenticated}
                    >
                      <option value="">Select Team</option>
                      {getAvailableTeams(index).map(team => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                      {matchup.team1Id && !getAvailableTeams(index).find(t => t.id === matchup.team1Id) && (
                        <option value={matchup.team1Id}>
                          {getTeamName(matchup.team1Id)}
                        </option>
                      )}
                    </select>
                  </div>

                  {/* Team 1 Score */}
                  <div>
                    <label className="block text-sm font-medium mb-1">Score</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={matchup.team1Score}
                      onChange={(e) => updateMatchup(index, 'team1Score', e.target.value)}
                      className="w-full p-2 border rounded-lg text-center font-mono"
                      placeholder="0"
                      disabled={!isAuthenticated}
                    />
                  </div>

                  {/* VS */}
                  <div className="text-center text-gray-500 font-semibold">
                    VS
                  </div>

                  {/* Team 2 Score */}
                  <div>
                    <label className="block text-sm font-medium mb-1">Score</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={matchup.team2Score}
                      onChange={(e) => updateMatchup(index, 'team2Score', e.target.value)}
                      className="w-full p-2 border rounded-lg text-center font-mono"
                      placeholder="0"
                      disabled={!isAuthenticated}
                    />
                  </div>

                  {/* Team 2 */}
                  <div>
                    <label className="block text-sm font-medium mb-1">Team 2</label>
                    <select
                      value={matchup.team2Id}
                      onChange={(e) => updateMatchup(index, 'team2Id', e.target.value)}
                      className="w-full p-2 border rounded-lg"
                      disabled={!isAuthenticated}
                    >
                      <option value="">Select Team</option>
                      {getAvailableTeams(index)
                        .filter(team => team.id !== matchup.team1Id)
                        .map(team => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      {matchup.team2Id && 
                       !getAvailableTeams(index).find(t => t.id === matchup.team2Id) &&
                       matchup.team2Id !== matchup.team1Id && (
                        <option value={matchup.team2Id}>
                          {getTeamName(matchup.team2Id)}
                        </option>
                      )}
                    </select>
                  </div>
                </div>

                {/* Remove button */}
                {isAuthenticated && (
                  <button
                    onClick={() => removeMatchup(index)}
                    className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors"
                    title="Remove matchup"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              
              {/* Matchup summary */}
              {matchup.team1Id && matchup.team2Id && matchup.team1Score !== '' && matchup.team2Score !== '' && (
                <div className="mt-2 text-sm text-gray-600 text-center">
                  {getTeamName(matchup.team1Id)} {matchup.team1Score} - {matchup.team2Score} {getTeamName(matchup.team2Id)}
                  {matchup.team1Score !== matchup.team2Score && (
                    <span className="ml-2 font-medium">
                      (Winner: {getTeamName(parseFloat(matchup.team1Score) > parseFloat(matchup.team2Score) ? matchup.team1Id : matchup.team2Id)})
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Add matchup button */}
          {isAuthenticated && (
            <button
              onClick={addMatchup}
              className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-gray-400 hover:text-gray-800 transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={20} />
              Add Another Matchup
            </button>
          )}

          {/* Summary */}
          {matchups.length > 0 && (
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-semibold text-blue-900 mb-2">Week {week} Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-blue-700 font-medium">Matchups:</span>
                  <span className="ml-2">{matchups.length}</span>
                </div>
                <div>
                  <span className="text-blue-700 font-medium">Teams Playing:</span>
                  <span className="ml-2">{new Set([...matchups.map(m => m.team1Id), ...matchups.map(m => m.team2Id)]).size}</span>
                </div>
                <div>
                  <span className="text-blue-700 font-medium">Completed:</span>
                  <span className="ml-2">{matchups.filter(m => m.team1Score !== '' && m.team2Score !== '').length}/{matchups.length}</span>
                </div>
                <div>
                  <span className="text-blue-700 font-medium">Status:</span>
                  <span className={`ml-2 font-medium ${isComplete ? 'text-green-600' : 'text-orange-600'}`}>
                    {isComplete ? 'Ready to Save' : 'Incomplete'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WeekScoreInput;