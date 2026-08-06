import React from 'react';
import { Trophy, Award, Star, Target, TrendingUp, Crown, Zap } from 'lucide-react';

const MobileAwards = ({
  season,
  currentWeek,
  loading = false,
  isAuthenticated = false,
  isAdmin = false,
  user = null
}) => {
  // Placeholder for awards data - to be implemented
  const awards = [
    {
      id: 'champion',
      title: 'League Champion',
      icon: Crown,
      description: 'Season 5 Fantasy Football Champion',
      recipient: null,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-100'
    },
    {
      id: 'runner-up',
      title: 'Runner-Up',
      icon: Trophy,
      description: 'Second Place Finish',
      recipient: null,
      color: 'text-gray-500',
      bgColor: 'bg-gray-100'
    },
    {
      id: 'highest-scorer',
      title: 'Highest Scorer',
      icon: Zap,
      description: 'Most Total Points Scored',
      recipient: null,
      color: 'text-orange-500',
      bgColor: 'bg-orange-100'
    },
    {
      id: 'most-wins',
      title: 'Most Wins',
      icon: Star,
      description: 'Best Regular Season Record',
      recipient: null,
      color: 'text-blue-500',
      bgColor: 'bg-blue-100'
    },
    {
      id: 'pickems-champion',
      title: 'Pick\'ems Champion',
      icon: Target,
      description: 'Season-Long Pick\'ems Winner',
      recipient: null,
      color: 'text-green-500',
      bgColor: 'bg-green-100'
    },
    {
      id: 'power-ranking',
      title: 'Power Ranking #1',
      icon: TrendingUp,
      description: 'Highest End-of-Season Power Ranking',
      recipient: null,
      color: 'text-purple-500',
      bgColor: 'bg-purple-100'
    }
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Trophy className="h-5 w-5 text-yellow-600" />
          <h2 className="text-lg font-semibold text-gray-900">Season {season?.year} Awards</h2>
        </div>
        <p className="text-gray-600 text-sm">
          Celebrating the achievements and standout performances from this season
        </p>
      </div>

      {/* Awards List */}
      <div className="space-y-3">
        {awards.map((award) => {
          const Icon = award.icon;
          return (
            <div key={award.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className={`p-2 rounded-lg ${award.bgColor} ${award.color} flex-shrink-0`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 text-base">{award.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {award.description}
                    </p>
                  </div>
                </div>
                {award.recipient ? (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200 rounded-full">
                      <span className="text-sm font-medium text-blue-900">
                        {award.recipient}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <span className="text-sm text-gray-500 italic">
                      To be announced
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Additional Info for Admin */}
      {isAdmin && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <h3 className="font-semibold text-blue-900 mb-2 text-sm">Admin Note</h3>
          <p className="text-sm text-blue-800">
            Award winners will be automatically calculated and displayed here once the season concludes. 
            This section is currently in preview mode.
          </p>
        </div>
      )}
    </div>
  );
};

export default MobileAwards;

