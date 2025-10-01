import React, { useState } from 'react';
import StandingsDrawerTrigger from './StandingsDrawerTrigger';
import StandingsDrawerContent from './StandingsDrawerContent';
import DrawerStandingsTable from './DrawerStandingsTable';

const StandingsDrawer = ({ 
  teams, 
  divisions, 
  standings, 
  currentWeek, 
  loading, 
  isAuthenticated,
  onDivisionRename,
  onTeamDivisionChange,
  onCreateDivision,
  games = []
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleOpenChange = (open) => {
    setIsOpen(open);
  };

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  return (
    <>
      <StandingsDrawerTrigger 
        onClick={handleToggle}
        isOpen={isOpen}
      />
      
      <StandingsDrawerContent 
        isOpen={isOpen}
        onClose={handleClose}
        loading={loading}
      >
        <DrawerStandingsTable
          teams={teams}
          divisions={divisions}
          standings={standings}
          currentWeek={currentWeek}
          loading={loading}
          isAuthenticated={isAuthenticated}
          onDivisionRename={onDivisionRename}
          onTeamDivisionChange={onTeamDivisionChange}
          onCreateDivision={onCreateDivision}
          onClose={handleClose}
          games={games}
        />
      </StandingsDrawerContent>
    </>
  );
};

export default StandingsDrawer;