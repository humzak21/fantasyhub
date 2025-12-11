import React from 'react';
import { motion } from 'framer-motion';

const StatCard = ({ 
  title, 
  value, 
  subtitle, 
  icon, 
  trend, 
  color = 'blue',
  size = 'medium',
  isLoading = false 
}) => {
  const getColorClasses = (color) => {
    switch (color) {
      case 'blue':
        return 'from-blue-500 to-blue-600';
      case 'purple':
        return 'from-purple-500 to-purple-600';
      case 'green':
        return 'from-green-500 to-green-600';
      case 'orange':
        return 'from-orange-500 to-orange-600';
      case 'red':
        return 'from-red-500 to-red-600';
      case 'indigo':
        return 'from-indigo-500 to-indigo-600';
      default:
        return 'from-blue-500 to-blue-600';
    }
  };

  const getSizeClasses = (size) => {
    switch (size) {
      case 'small':
        return 'p-4';
      case 'large':
        return 'p-8';
      default:
        return 'p-6';
    }
  };

  if (isLoading) {
    return (
      <div className={`stat-card-modern ${getSizeClasses(size)}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 bg-gray-300 rounded animate-pulse w-20"></div>
          <div className="h-5 w-5 bg-gray-300 rounded animate-pulse"></div>
        </div>
        <div className="h-8 bg-gray-300 rounded animate-pulse w-16 mb-2"></div>
        <div className="h-3 bg-gray-300 rounded animate-pulse w-24"></div>
      </div>
    );
  }

  return (
    <motion.div
      className={`stat-card-modern ${getSizeClasses(size)}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      whileHover={{ 
        y: -4,
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
        transition: { duration: 0.3 }
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="stat-card-title">{title}</h3>
        {icon && (
          <div className={`stat-card-icon bg-gradient-to-r ${getColorClasses(color)}`}>
            {icon}
          </div>
        )}
      </div>
      
      <div className="stat-card-value">{value}</div>
      
      {subtitle && (
        <div className="stat-card-subtitle">
          {subtitle}
          {trend && (
            <span className={`stat-card-trend ${trend.type === 'up' ? 'positive' : trend.type === 'down' ? 'negative' : 'neutral'}`}>
              {trend.value}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
};

export default StatCard; 