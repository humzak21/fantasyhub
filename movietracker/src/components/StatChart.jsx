import React from 'react';
import { motion } from 'framer-motion';

const StatChart = ({ 
  title, 
  data, 
  type = 'bar', 
  color = 'blue',
  isLoading = false 
}) => {
  const getColorClasses = (color) => {
    switch (color) {
      case 'blue':
        return { bg: 'bg-blue-500', light: 'bg-blue-100', text: 'text-blue-600' };
      case 'purple':
        return { bg: 'bg-purple-500', light: 'bg-purple-100', text: 'text-purple-600' };
      case 'green':
        return { bg: 'bg-green-500', light: 'bg-green-100', text: 'text-green-600' };
      case 'orange':
        return { bg: 'bg-orange-500', light: 'bg-orange-100', text: 'text-orange-600' };
      case 'red':
        return { bg: 'bg-red-500', light: 'bg-red-100', text: 'text-red-600' };
      default:
        return { bg: 'bg-blue-500', light: 'bg-blue-100', text: 'text-blue-600' };
    }
  };

  const colors = getColorClasses(color);

  if (isLoading) {
    return (
      <div className="stat-chart-container">
        <div className="flex items-center justify-between mb-6">
          <div className="h-6 bg-gray-300 rounded animate-pulse w-32"></div>
        </div>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center space-x-3">
              <div className="h-3 bg-gray-300 rounded animate-pulse w-16"></div>
              <div className="flex-1 h-4 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-3 bg-gray-300 rounded animate-pulse w-8"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const maxValue = Math.max(...data.map(item => item.value));

  const renderBarChart = () => (
    <div className="space-y-4">
      {data.map((item, index) => (
        <motion.div
          key={item.label}
          className="flex items-center space-x-4"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: index * 0.1 }}
        >
          <div className="stat-chart-label">{item.label}</div>
          <div className="flex-1 relative">
            <div className={`stat-chart-bar-bg ${colors.light}`}></div>
            <motion.div
              className={`stat-chart-bar ${colors.bg}`}
              initial={{ width: 0 }}
              animate={{ width: `${(item.value / maxValue) * 100}%` }}
              transition={{ duration: 0.8, delay: index * 0.1 }}
            ></motion.div>
          </div>
          <div className={`stat-chart-value ${colors.text}`}>{item.value}</div>
        </motion.div>
      ))}
    </div>
  );

  const renderPieChart = () => {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    let currentAngle = 0;

    return (
      <div className="flex items-center space-x-8">
        <div className="relative">
          <svg width="200" height="200" className="transform -rotate-90">
            {data.map((item, index) => {
              const percentage = (item.value / total) * 100;
              const strokeDasharray = `${percentage} ${100 - percentage}`;
              const strokeDashoffset = -currentAngle;
              currentAngle += percentage;

              return (
                <motion.circle
                  key={item.label}
                  cx="100"
                  cy="100"
                  r="80"
                  fill="none"
                  strokeWidth="20"
                  stroke={`hsl(${(index * 360) / data.length}, 70%, 60%)`}
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  className="stat-chart-pie-segment"
                  initial={{ strokeDasharray: '0 100' }}
                  animate={{ strokeDasharray }}
                  transition={{ duration: 1, delay: index * 0.2 }}
                />
              );
            })}
          </svg>
        </div>
        <div className="space-y-3">
          {data.map((item, index) => (
            <motion.div
              key={item.label}
              className="flex items-center space-x-3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: `hsl(${(index * 360) / data.length}, 70%, 60%)` }}
              ></div>
              <span className="stat-chart-legend-label">{item.label}</span>
              <span className="stat-chart-legend-value">
                {item.value} ({((item.value / total) * 100).toFixed(1)}%)
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <motion.div
      className="stat-chart-container"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="stat-chart-title">{title}</h3>
      </div>
      
      {type === 'bar' ? renderBarChart() : renderPieChart()}
    </motion.div>
  );
};

export default StatChart; 