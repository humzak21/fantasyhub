import React, { useState, useRef, useEffect } from 'react';
import { ChevronUp, GripHorizontal, GripVertical, ChevronDownCircle, Filter } from 'lucide-react';
import { getMaskedTeamName } from '../../utils/displayNameUtils';

const FloatingTeamFilter = ({
  rankings = [],
  selectedTeams = [],
  onToggleTeam,
  onToggleAllTeams,
  user = null,
  isAdmin = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 450 }); // Position at middle left
  const [height, setHeight] = useState(400); // Initial height in pixels
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeStartHeight, setResizeStartHeight] = useState(0);
  const [resizeStartY, setResizeStartY] = useState(0);
  const [canScroll, setCanScroll] = useState(false);
  const containerRef = useRef(null);
  const handleRef = useRef(null);
  const resizeHandleRef = useRef(null);
  const scrollContainerRef = useRef(null);

  // Calculate bottom position based on viewport
  const getBottomPosition = () => {
    if (position.y !== null) {
      return null;
    }
    return 20; // Default bottom position
  };

  const getTopPosition = () => {
    if (position.y === null) {
      return null;
    }
    return position.y;
  };

  // Handle mouse down on drag handle
  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // Only left click

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setIsDragging(true);
  };

  // Handle mouse down on resize handle
  const handleResizeMouseDown = (e) => {
    if (e.button !== 0) return; // Only left click
    e.preventDefault();

    setResizeStartHeight(height);
    setResizeStartY(e.clientY);
    setIsResizing(true);
  };

  // Handle mouse move for dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;

      // Keep within viewport bounds
      const maxX = window.innerWidth - (containerRef.current?.offsetWidth || 0);
      const maxY = window.innerHeight - (containerRef.current?.offsetHeight || 0);

      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // Handle mouse move for resizing
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      const delta = e.clientY - resizeStartY;
      const newHeight = Math.max(200, Math.min(800, resizeStartHeight + delta));
      setHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeStartHeight, resizeStartY]);

  // Check if content is scrollable
  useEffect(() => {
    const checkScroll = () => {
      if (scrollContainerRef.current) {
        const hasScroll = scrollContainerRef.current.scrollHeight > scrollContainerRef.current.clientHeight;
        setCanScroll(hasScroll);
      }
    };

    checkScroll();
    window.addEventListener('resize', checkScroll);

    // Also check when content updates
    const timer = setTimeout(checkScroll, 100);

    return () => {
      window.removeEventListener('resize', checkScroll);
      clearTimeout(timer);
    };
  }, [rankings, isOpen]);

  if (!rankings || rankings.length === 0) {
    return null;
  }

  // Collapsed state - circular icon button
  if (!isOpen) {
    return (
      <button
        ref={containerRef}
        onClick={() => setIsOpen(true)}
        onMouseDown={handleMouseDown}
        className="fixed z-50 w-12 h-12 rounded-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-500 dark:hover:bg-blue-600 shadow-lg flex items-center justify-center cursor-grab active:cursor-grabbing transition-colors"
        style={{
          left: `${position.x}px`,
          top: getTopPosition() !== null ? `${getTopPosition()}px` : 'auto',
          bottom: getBottomPosition() !== null ? `${getBottomPosition()}px` : 'auto',
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
        title="Open Team Filter"
      >
        <Filter size={20} className="text-white" />
      </button>
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed z-50 w-72 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg flex flex-col"
      style={{
        left: `${position.x}px`,
        top: getTopPosition() !== null ? `${getTopPosition()}px` : 'auto',
        bottom: getBottomPosition() !== null ? `${getBottomPosition()}px` : 'auto',
        height: `${height}px`,
        cursor: isDragging ? 'grabbing' : 'default'
      }}
    >
      {/* Draggable Header */}
      <div
        ref={handleRef}
        onMouseDown={handleMouseDown}
        className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700 rounded-t-lg cursor-grab active:cursor-grabbing border-b border-gray-200 dark:border-gray-600 flex-shrink-0"
      >
        <div className="flex items-center gap-2">
          <GripHorizontal size={16} className="text-gray-500 dark:text-gray-400" />
          <h4 className="font-semibold text-sm text-gray-900 dark:text-white">
            Team Filter
          </h4>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
          aria-label="Collapse"
        >
          <ChevronUp size={16} className="text-gray-600 dark:text-gray-300" />
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-col overflow-hidden flex-1 min-w-0">
          {/* Scrollable Content */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto relative"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgb(107, 114, 128) rgb(243, 244, 246)'
            }}
          >
            <div className="p-3 space-y-2">
              {/* Select All / Deselect All Button */}
              <button
                onClick={onToggleAllTeams}
                className="w-full text-xs px-2 py-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded font-medium transition-colors"
              >
                {selectedTeams.length === rankings.length ? 'Deselect All' : 'Select All'}
              </button>

              {/* Team Checkboxes - Single Column */}
              {rankings.map(team => (
                <label
                  key={team.id}
                  className="flex w-full items-center gap-2 cursor-pointer text-sm hover:bg-gray-50 dark:hover:bg-gray-700 p-2 rounded transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedTeams.includes(team.id)}
                    onChange={() => onToggleTeam(team.id)}
                    className="rounded w-4 h-4 cursor-pointer flex-shrink-0"
                  />
                  <span className="truncate text-gray-700 dark:text-gray-300 flex-1 text-sm min-w-0">
                    {getMaskedTeamName(team, user, isAdmin)}
                  </span>
                </label>
              ))}
            </div>

            {/* Scroll Indicator - Floating at bottom */}
            {canScroll && (
              <div className="sticky bottom-0 left-0 right-0 flex justify-center py-2 bg-gradient-to-t from-white dark:from-gray-800 to-transparent pointer-events-none">
                <ChevronDownCircle size={16} className="text-gray-400 dark:text-gray-500 animate-bounce" />
              </div>
            )}
          </div>

          {/* Selection Count */}
          {selectedTeams.length > 0 && (
            <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-400 flex-shrink-0">
              {selectedTeams.length} of {rankings.length} teams selected
            </div>
          )}

          {/* Resize Handle */}
          <div
            ref={resizeHandleRef}
            onMouseDown={handleResizeMouseDown}
            className="flex items-center justify-center h-1.5 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-gray-600 dark:via-gray-700 dark:to-gray-600 cursor-ns-resize hover:from-blue-200 hover:via-blue-300 hover:to-blue-200 dark:hover:from-blue-600 dark:hover:via-blue-700 dark:hover:to-blue-600 transition-colors flex-shrink-0"
            style={{ userSelect: 'none' }}
          >
            <GripVertical size={14} className="text-gray-500 dark:text-gray-400 opacity-50" />
          </div>
        </div>
    </div>
  );
};

export default FloatingTeamFilter;
