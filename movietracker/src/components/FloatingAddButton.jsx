import React from 'react';
import { Plus } from 'lucide-react';

const FloatingAddButton = ({ onClick }) => {
  const handleAddClick = () => {
    if (onClick) {
      onClick();
    } else {
      // TODO: Add functionality for adding new items
      console.log('Add button clicked');
    }
  };

  return (
    <div className="floating-add-button">
      <button 
        className="floating-add-btn"
        onClick={handleAddClick}
        aria-label="Add new item"
      >
        <Plus size={20} />
      </button>
    </div>
  );
};

export default FloatingAddButton; 