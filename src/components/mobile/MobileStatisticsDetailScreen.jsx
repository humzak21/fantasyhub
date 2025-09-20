import React, { useState } from 'react';
import MobileScreenManager from './MobileScreenManager';
import { BarChart3, TrendingUp, Award, Target, Users, Calendar } from 'lucide-react';

const MobileStatisticsDetailScreen = ({ 
  isOpen, 
  onClose, 
  statisticsData,
  currentWeek = 1
}) => {
  const [activeTab, setActiveTab] = useState('overview');

  if (!statisticsData) return null;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'scoring', label: 'Scoring', icon: Target },
    { id: 'rankings', label: 'Rankings', icon: Award },
    { id: 'trends', label: 'Trends', icon: TrendingUp }
  ];

  const renderOverviewTab = () => (
    <div className="space-y-4">
      {/* League Summary */}
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">League Summary</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {statisticsData.totalTeams || 0}
            </div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Teams</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {currentWeek}
            </div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Current Week</div>
          </div>
        </div>
      </div>

      {/* Top Performers */}
      {statisticsData.topPerformers && (
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
            <Award className="w-5 h-5 mr-2 text-yellow-600" />
            Top Performers
          </h3>
          <div className="space-y-3">
            {statisticsData.topPerformers.slice(0, 3).map((performer, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    index === 0 ? 'bg-yellow-100 text-yellow-600' :
                    index === 1 ? 'bg-gray-100 text-gray-600' :
                    'bg-orange-100 text-orange-600'
                  }`}>
                    <span className="text-sm font-bold">#{index + 1}</span>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {performer.teamName}
                    </div>
                    <div className="text-xs text-gray-500">
                      {performer.category}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">
                    {performer.value}
                  </div>
                  <div className="text-xs text-gray-500">
                    {performer.unit}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* League Averages */}
      {statisticsData.averages && (
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">League Averages</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Points/Game</span>
                <span className="text-sm font-medium">
                  {statisticsData.averages.pointsPerGame?.toFixed(1) || '0.0'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Wins</span>
                <span className="text-sm font-medium">
                  {statisticsData.averages.wins?.toFixed(1) || '0.0'}
                </span>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Total Points</span>
                <span className="text-sm font-medium">
                  {statisticsData.averages.totalPoints?.toFixed(1) || '0.0'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Losses</span>
                <span className="text-sm font-medium">
                  {statisticsData.averages.losses?.toFixed(1) || '0.0'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderScoringTab = () => (
    <div className="space-y-4">
      {/* Highest Scoring Teams */}
      {statisticsData.highestScoring && (
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
            <Target className="w-5 h-5 mr-2 text-green-600" />
            Highest Scoring Teams
          </h3>
          <div className="space-y-2">
            {statisticsData.highestScoring.map((team, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-bold text-green-600">#{index + 1}</span>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{team.name}</div>
                    <div className="text-xs text-gray-500">Week {team.week}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-green-600">
                    {team.points.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-500">points</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scoring Distribution */}
      {statisticsData.scoringDistribution && (
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Scoring Distribution</h3>
          <div className="space-y-3">
            {Object.entries(statisticsData.scoringDistribution).map(([range, count]) => (
              <div key={range} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{range} points</span>
                <div className="flex items-center space-x-2">
                  <div className="w-20 bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full" 
                      style={{ 
                        width: `${(count / Math.max(...Object.values(statisticsData.scoringDistribution))) * 100}%` 
                      }}
                    />
                  </div>
                  <span className="text-sm font-medium w-8 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderRankingsTab = () => (
    <div className="space-y-4">
      {/* Power Rankings */}
      {statisticsData.powerRankings && (
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
            <Award className="w-5 h-5 mr-2 text-purple-600" />
            Current Power Rankings
          </h3>
          <div className="space-y-2">
            {statisticsData.powerRankings.map((team, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    index < 3 ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-600'
                  }`}>
                    <span className="text-sm font-bold">#{index + 1}</span>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{team.name}</div>
                    <div className="text-xs text-gray-500">{team.record}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">
                    {team.powerScore?.toFixed(2) || 'N/A'}
                  </div>
                  <div className="text-xs text-gray-500">score</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Standings */}
      {statisticsData.standings && (
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Current Standings</h3>
          <div className="space-y-2">
            {statisticsData.standings.map((team, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-bold text-blue-600">#{index + 1}</span>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{team.name}</div>
                    <div className="text-xs text-gray-500">{team.points} pts</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-medium ${
                    team.wins > team.losses ? 'text-green-600' : 
                    team.wins < team.losses ? 'text-red-600' : 'text-gray-600'
                  }`}>
                    {team.wins}-{team.losses}
                  </div>
                  <div className="text-xs text-gray-500">record</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderTrendsTab = () => (
    <div className="space-y-4">
      {/* Weekly Trends */}
      {statisticsData.weeklyTrends && (
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
            <TrendingUp className="w-5 h-5 mr-2 text-blue-600" />
            Weekly Trends
          </h3>
          <div className="space-y-3">
            {statisticsData.weeklyTrends.map((week, index) => (
              <div key={index} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-900">Week {week.week}</span>
                  <span className="text-xs text-gray-500">{week.date}</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Avg Score:</span>
                    <span className="font-medium">{week.averageScore?.toFixed(1) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">High Score:</span>
                    <span className="font-medium">{week.highScore?.toFixed(1) || 'N/A'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Performance Trends */}
      {statisticsData.performanceTrends && (
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Performance Trends</h3>
          <div className="space-y-3">
            {statisticsData.performanceTrends.map((trend, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${
                    trend.direction === 'up' ? 'bg-green-500' :
                    trend.direction === 'down' ? 'bg-red-500' : 'bg-gray-400'
                  }`} />
                  <div>
                    <div className="text-sm font-medium text-gray-900">{trend.teamName}</div>
                    <div className="text-xs text-gray-500">{trend.metric}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-medium ${
                    trend.direction === 'up' ? 'text-green-600' :
                    trend.direction === 'down' ? 'text-red-600' : 'text-gray-600'
                  }`}>
                    {trend.change}
                  </div>
                  <div className="text-xs text-gray-500">{trend.period}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return renderOverviewTab();
      case 'scoring':
        return renderScoringTab();
      case 'rankings':
        return renderRankingsTab();
      case 'trends':
        return renderTrendsTab();
      default:
        return renderOverviewTab();
    }
  };

  return (
    <MobileScreenManager
      isOpen={isOpen}
      onClose={onClose}
      title="League Statistics"
      className="bg-gray-50"
    >
      <div className="flex flex-col h-full">
        {/* Tab Navigation */}
        <div className="bg-white border-b border-gray-200 px-4 py-2">
          <div className="flex space-x-1 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {renderTabContent()}
        </div>
      </div>
    </MobileScreenManager>
  );
};

export default MobileStatisticsDetailScreen;