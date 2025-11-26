import React from 'react';
import { Star } from 'lucide-react';

const StarDisplay = ({ rating, size = 14, showValue = false, className = "" }) => {
  const numRating = parseFloat(rating) || 0;
  const isFiveStar = numRating === 5;
  
  const renderStars = () => {
    const stars = [];
    
    for (let i = 1; i <= 5; i++) {
      const isFullStar = numRating >= i;
      const isHalfStar = numRating >= i - 0.5 && numRating < i;
      
      stars.push(
        <div key={i} className="star-display-container">
          {/* Background star (always gray/empty) */}
          <Star 
            size={size} 
            fill="none" 
            color="var(--border)"
            className="star-display-background"
          />
          
          {/* Foreground star (colored, clipped for half stars) */}
          {(isFullStar || isHalfStar) && (
            <div className={`star-display-foreground ${isHalfStar ? 'half-star' : 'full-star'}`}>
              <Star 
                size={size} 
                fill={isFiveStar ? "#FFD700" : "var(--primary-blue)"} 
                color={isFiveStar ? "#FFD700" : "var(--primary-blue)"}
              />
            </div>
          )}
        </div>
      );
    }
    return stars;
  };

  return (
    <div className={`star-display ${className}`}>
      <div className="star-display-stars">
        {renderStars()}
      </div>
      {showValue && (
        <span className="star-display-value">
          {numRating > 0 ? `${numRating}/5` : 'No rating'}
        </span>
      )}
    </div>
  );
};

export default StarDisplay; 