import React from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Star, 
  Shield, 
  AlertTriangle,
  Target,
  Zap,
  Activity
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';

/**
 * TrendingPlayerIndicators Component
 * 
 * Displays trending player indicators and analytics-influenced factors
 * for individual teams in the power rankings table.
 * 
 * Requirements addressed:
 * - Show trending player indicators in power rankings
 * - Display analytics-influenced ranking factors
 * - Provide visual cues for player performance trends
 */
const TrendingPlayerIndicators = ({ 
  team, 
  analyticsData = null, 
  compact = false,
  showTooltips = true 
}) => {
  if (!analyticsData) {
    return compact ? null : (
      // <div className="text-xs text-muted-foreground italic">
      //   No analytics data
      // </div>
      null
    );
  }

  const {
    trendingUpPlayers = 0,
    trendingDownPlayers = 0,
    avgPlayerRank = null,
    avgTrendScore = 0,
    consistencyRating = 0,
    analyticsStrengthScore = 0,
    playerAnalytics = []
  } = analyticsData;

  // Calculate key indicators
  const topTierPlayers = playerAnalytics.filter(p => p.weeklyRank && p.weeklyRank <= 12).length;
  const consistentPlayers = playerAnalytics.filter(p => p.consistencyRating > 0.7).length;
  const strugglingPlayers = playerAnalytics.filter(p => p.trendScore < -0.2).length;
  const hasElitePlayers = topTierPlayers > 0;
  const hasStrongTrend = Math.abs(avgTrendScore) > 0.15;
  const isConsistent = consistencyRating > 0.6;
  const hasRisks = strugglingPlayers > 1;

  // Create indicator components
  const indicators = [];

  // Trending indicators
  if (trendingUpPlayers > 0) {
    indicators.push({
      key: 'trending-up',
      icon: TrendingUp,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      count: trendingUpPlayers,
      label: `${trendingUpPlayers} player${trendingUpPlayers > 1 ? 's' : ''} trending up`,
      priority: 1
    });
  }

  if (trendingDownPlayers > 0) {
    indicators.push({
      key: 'trending-down',
      icon: TrendingDown,
      color: 'text-red-600',
      bgColor: 'bg-red-100',
      count: trendingDownPlayers,
      label: `${trendingDownPlayers} player${trendingDownPlayers > 1 ? 's' : ''} trending down`,
      priority: 2
    });
  }

  // Elite players indicator
  if (hasElitePlayers) {
    indicators.push({
      key: 'elite-players',
      icon: Star,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100',
      count: topTierPlayers,
      label: `${topTierPlayers} top-12 ranked player${topTierPlayers > 1 ? 's' : ''}`,
      priority: 3
    });
  }

  // Consistency indicator
  if (isConsistent) {
    indicators.push({
      key: 'consistent',
      icon: Shield,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      count: Math.round(consistencyRating * 100),
      label: `${Math.round(consistencyRating * 100)}% consistency rating`,
      priority: 4
    });
  }

  // Risk indicator
  if (hasRisks) {
    indicators.push({
      key: 'risk',
      icon: AlertTriangle,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
      count: strugglingPlayers,
      label: `${strugglingPlayers} player${strugglingPlayers > 1 ? 's' : ''} struggling`,
      priority: 5
    });
  }

  // Strong trend indicator
  if (hasStrongTrend) {
    const isPositive = avgTrendScore > 0;
    indicators.push({
      key: 'strong-trend',
      icon: isPositive ? Zap : Activity,
      color: isPositive ? 'text-purple-600' : 'text-gray-600',
      bgColor: isPositive ? 'bg-purple-100' : 'bg-gray-100',
      count: Math.round(Math.abs(avgTrendScore) * 100),
      label: `${isPositive ? 'Strong positive' : 'Notable'} team trend (${avgTrendScore > 0 ? '+' : ''}${Math.round(avgTrendScore * 100)}%)`,
      priority: 6
    });
  }

  // Sort indicators by priority and limit for compact view
  const sortedIndicators = indicators
    .sort((a, b) => a.priority - b.priority)
    .slice(0, compact ? 3 : 6);

  if (sortedIndicators.length === 0) {
    return compact ? null : (
      // <div className="text-xs text-muted-foreground">
      //   No significant trends
      // </div>
      null
    );
  }

  const IndicatorBadge = ({ indicator }) => {
    const { icon: Icon, color, bgColor, count, label } = indicator;
    
    const badge = (
      <Badge 
        variant="secondary" 
        className={`${bgColor} ${color} hover:${bgColor} border-0 text-xs flex items-center gap-1 px-2 py-1`}
      >
        <Icon className="h-3 w-3" />
        {compact ? count : `${count}`}
      </Badge>
    );

    if (showTooltips) {
      return (
        <Tooltip key={indicator.key}>
          <TooltipTrigger asChild>
            {badge}
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{label}</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    return <div key={indicator.key}>{badge}</div>;
  };

  if (compact) {
    return (
      <TooltipProvider>
        <div className="flex items-center gap-1 flex-wrap">
          {sortedIndicators.map(indicator => (
            <IndicatorBadge key={indicator.key} indicator={indicator} />
          ))}
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {sortedIndicators.map(indicator => (
            <IndicatorBadge key={indicator.key} indicator={indicator} />
          ))}
        </div>
      
      {/* Analytics strength score */}
      {analyticsStrengthScore > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <Target className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">Analytics Strength:</span>
          <span className={`font-mono font-semibold ${
            analyticsStrengthScore >= 75 ? 'text-green-600' :
            analyticsStrengthScore >= 50 ? 'text-blue-600' :
            analyticsStrengthScore >= 25 ? 'text-orange-600' : 'text-red-600'
          }`}>
            {Math.round(analyticsStrengthScore)}
          </span>
        </div>
      )}
      
      {/* Average player rank */}
      {avgPlayerRank && (
        <div className="flex items-center gap-2 text-xs">
          <Target className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">Avg Player Rank:</span>
          <span className={`font-mono font-semibold ${
            avgPlayerRank <= 20 ? 'text-green-600' :
            avgPlayerRank <= 40 ? 'text-blue-600' :
            avgPlayerRank <= 60 ? 'text-orange-600' : 'text-red-600'
          }`}>
            {Math.round(avgPlayerRank)}
          </span>
        </div>
      )}
      </div>
    </TooltipProvider>
  );
};

export default TrendingPlayerIndicators;