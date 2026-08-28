import React, { useState, useRef, useEffect } from 'react';
import { ChevronUp, GripHorizontal, GripVertical, ChevronDownCircle, Filter } from 'lucide-react';
import { getMaskedTeamName } from '../../utils/displayNameUtils';
import { useIsMobile } from '../../hooks/use-mobile';
import { Button } from './button';
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from './drawer';

/**
 * Pick which teams a chart shows.
 *
 * Two presentations, one list.
 *
 * On a pointer device it is a floating panel you can drag around the chart and
 * resize — genuinely useful when you are comparing a filter against the plot
 * behind it. On a touch device that same panel is a 288px box permanently
 * covering most of a 375px screen, dragged with `mousedown`/`mousemove`
 * listeners that a finger never fires. It could be opened and then neither
 * moved nor, in practice, seen past. Below md: it is a bottom drawer instead.
 *
 * `useIsMobile` (matchMedia, 768px) rather than a CSS branch, because the two
 * presentations are structurally different components — a drawer with its own
 * focus trap versus a free-floating panel — not two skins of one tree.
 */
const FloatingTeamFilter = ({
  rankings = [],
  selectedTeams = [],
  onToggleTeam,
  onToggleAllTeams,
  user = null,
  isAdmin = false,
  teamOwnerNames = []
}) => {
  const isMobile = useIsMobile();

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

  /*
   * Pointer events, not mouse events.
   *
   * `mousedown`/`mousemove` are only synthesised for touch in narrow cases and
   * never during a drag, so the drag handles here did nothing at all on a
   * touch screen — and a trackpad on a touch-capable laptop is inconsistent
   * about them too. Pointer events cover mouse, touch and pen with one path.
   */
  const handlePointerDown = (e) => {
    if (e.button !== 0) return; // primary button / first touch only

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setIsDragging(true);
  };

  const handleResizePointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();

    setResizeStartHeight(height);
    setResizeStartY(e.clientY);
    setIsResizing(true);
  };

  // Drag
  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e) => {
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

    const handlePointerUp = () => setIsDragging(false);

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerUp);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDragging, dragOffset]);

  // Resize
  useEffect(() => {
    if (!isResizing) return;

    const handlePointerMove = (e) => {
      const delta = e.clientY - resizeStartY;
      setHeight(Math.max(200, Math.min(800, resizeStartHeight + delta)));
    };

    const handlePointerUp = () => setIsResizing(false);

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerUp);

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerUp);
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

  const selectionSummary =
    selectedTeams.length > 0
      ? `${selectedTeams.length} of ${rankings.length} teams selected`
      : null;

  const teamList = (
    <TeamCheckboxList
      rankings={rankings}
      selectedTeams={selectedTeams}
      onToggleTeam={onToggleTeam}
      onToggleAllTeams={onToggleAllTeams}
      user={user}
      isAdmin={isAdmin}
      teamOwnerNames={teamOwnerNames}
    />
  );

  // ---------- Touch / small screens: a bottom drawer ----------
  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        <DrawerTrigger asChild>
          <Button variant="outline" size="sm" className="w-full gap-2">
            <Filter className="h-4 w-4" />
            Filter teams
            {selectedTeams.length > 0 && selectedTeams.length < rankings.length && (
              <span className="text-xs text-muted-foreground">
                ({selectedTeams.length}/{rankings.length})
              </span>
            )}
          </Button>
        </DrawerTrigger>

        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Team Filter</DrawerTitle>
            {selectionSummary && (
              <p className="text-sm text-muted-foreground">{selectionSummary}</p>
            )}
          </DrawerHeader>
          <DrawerBody className="px-4 pb-4">{teamList}</DrawerBody>
        </DrawerContent>
      </Drawer>
    );
  }

  // ---------- Pointer devices: the draggable, resizable panel ----------
  if (!isOpen) {
    return (
      <button
        ref={containerRef}
        onClick={() => setIsOpen(true)}
        onPointerDown={handlePointerDown}
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
        onPointerDown={handlePointerDown}
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
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto relative"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgb(107, 114, 128) rgb(243, 244, 246)'
          }}
        >
          <div className="p-3">{teamList}</div>

          {/* Scroll Indicator - Floating at bottom */}
          {canScroll && (
            <div className="sticky bottom-0 left-0 right-0 flex justify-center py-2 bg-gradient-to-t from-white dark:from-gray-800 to-transparent pointer-events-none">
              <ChevronDownCircle size={16} className="text-gray-400 dark:text-gray-500 animate-bounce" />
            </div>
          )}
        </div>

        {/* Selection Count */}
        {selectionSummary && (
          <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-400 flex-shrink-0">
            {selectionSummary}
          </div>
        )}

        {/* Resize Handle */}
        <div
          ref={resizeHandleRef}
          onPointerDown={handleResizePointerDown}
          className="flex items-center justify-center h-1.5 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-gray-600 dark:via-gray-700 dark:to-gray-600 cursor-ns-resize hover:from-blue-200 hover:via-blue-300 hover:to-blue-200 dark:hover:from-blue-600 dark:hover:via-blue-700 dark:hover:to-blue-600 transition-colors flex-shrink-0"
          style={{ userSelect: 'none' }}
        >
          <GripVertical size={14} className="text-gray-500 dark:text-gray-400 opacity-50" />
        </div>
      </div>
    </div>
  );
};

/** The list itself — identical in both presentations, so it lives in one place. */
const TeamCheckboxList = ({
  rankings,
  selectedTeams,
  onToggleTeam,
  onToggleAllTeams,
  user,
  isAdmin,
  teamOwnerNames,
}) => (
  <div className="space-y-2">
    <button
      onClick={onToggleAllTeams}
      className="w-full rounded px-2 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-900/20"
    >
      {selectedTeams.length === rankings.length ? 'Deselect All' : 'Select All'}
    </button>

    {rankings.map(team => (
      <label
        key={team.id}
        // `min-h-11` on touch only: a 32px checkbox row is a coin-flip tap.
        className="flex w-full cursor-pointer items-center gap-2 rounded p-2 text-sm transition-colors hover:bg-gray-50 pointer-coarse:min-h-11 dark:hover:bg-gray-700"
      >
        <input
          type="checkbox"
          checked={selectedTeams.includes(team.id)}
          onChange={() => onToggleTeam(team.id)}
          className="h-4 w-4 flex-shrink-0 cursor-pointer rounded"
        />
        <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-300">
          {getMaskedTeamName(team, user, isAdmin, teamOwnerNames)}
        </span>
      </label>
    ))}
  </div>
);

export default FloatingTeamFilter;
