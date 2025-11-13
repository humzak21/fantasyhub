import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Menu } from 'lucide-react';

// Custom styles for pulsing glow effect
const glowStyles = `
  @keyframes pulse-glow {
    0%, 100% {
      box-shadow: 0 10px 15px -3px rgba(234, 179, 8, 0.5), 0 0 0 2px rgba(234, 179, 8, 0.3);
    }
    50% {
      box-shadow: 0 10px 15px -3px rgba(234, 179, 8, 0.8), 0 0 0 2px rgba(234, 179, 8, 0.6);
    }
  }

  @keyframes pulse-glow-sm {
    0%, 100% {
      box-shadow: 0 4px 6px -1px rgba(234, 179, 8, 0.5), 0 0 0 1px rgba(234, 179, 8, 0.3);
    }
    50% {
      box-shadow: 0 4px 6px -1px rgba(234, 179, 8, 0.8), 0 0 0 1px rgba(234, 179, 8, 0.6);
    }
  }

  .awards-glow {
    animation: pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  .awards-glow-sm {
    animation: pulse-glow-sm 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
`;

/**
 * ResponsiveNavigation Component
 *
 * Intelligently renders navigation buttons that progressively collapse:
 * - Large screens: Full buttons with labels and icons
 * - Medium screens: Icons only (no labels)
 * - Small screens: Dropdown menu
 *
 * @param {Array} tabs - Navigation tab configuration
 * @param {string} activeTab - Currently active tab ID
 * @param {Function} onTabChange - Callback when tab is clicked
 * @param {Function} shouldShowTab - Function to determine if tab should be shown
 */
const ResponsiveNavigation = ({
  tabs,
  activeTab,
  onTabChange,
  shouldShowTab = () => true,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Filter tabs based on visibility rules
  const visibleTabs = tabs.filter(shouldShowTab);

  if (visibleTabs.length === 0) {
    return null;
  }

  return (
    <>
      {/* Inject custom glow animation styles */}
      <style>{glowStyles}</style>

      {/* Full Navigation - Large screens (1536px and up) */}
      <nav className="hidden 2xl:flex items-center space-x-1">
        {visibleTabs.map(tab => (
          <NavButton
            key={tab.id}
            tab={tab}
            isActive={activeTab === tab.id}
            showLabel={true}
            onClick={() => onTabChange(tab.id)}
          />
        ))}
      </nav>

      {/* Icon-only Navigation - Medium screens (640px to 1536px) */}
      <nav className="hidden sm:flex 2xl:hidden items-center space-x-1">
        {visibleTabs.map(tab => (
          <NavButton
            key={tab.id}
            tab={tab}
            isActive={activeTab === tab.id}
            showLabel={false}
            onClick={() => onTabChange(tab.id)}
          />
        ))}
      </nav>

      {/* Dropdown Navigation - Small screens (below sm) */}
      <div className="sm:hidden">
        <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="dark:hover:bg-slate-700 dark:text-slate-200">
              <Menu className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {visibleTabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const isDisabled = tab.isDisabled || false;
              const isAwards = tab.id === 'awards';

              return (
                <DropdownMenuItem
                  key={tab.id}
                  onClick={() => {
                    onTabChange(tab.id);
                    setIsDropdownOpen(false);
                  }}
                  disabled={isDisabled}
                  className={`${isActive ? 'bg-accent' : ''} ${
                    isAwards ? 'awards-glow-sm' : ''
                  }`}
                >
                  <Icon className={`h-4 w-4 mr-2 ${isAwards ? 'hover:fill-yellow-500 transition-colors' : ''}`} />
                  <span>{tab.label}</span>
                  {tab.showNotification && (
                    <Badge variant="destructive" className="ml-auto text-[10px] px-1.5 py-0 bg-red-600 hover:bg-red-700 border-red-600">
                      !
                    </Badge>
                  )}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
};

/**
 * Individual Navigation Button
 */
const NavButton = ({ tab, isActive, showLabel, onClick }) => {
  const Icon = tab.icon;
  const isDisabled = tab.isDisabled || false;
  const isAwards = tab.id === 'awards';

  return (
    <Button
      variant={isActive ? 'default' : 'ghost'}
      size="sm"
      disabled={isDisabled}
      onClick={onClick}
      title={!showLabel ? tab.label : undefined}
      className={`flex items-center ${showLabel ? 'space-x-1' : 'space-x-0'} h-9 ${
        isActive
          ? 'bg-[hsl(217,32.6%,17.5%)] text-white hover:bg-[hsl(217,32.6%,20%)] border-[hsl(217,32.6%,17.5%)]'
          : 'dark:hover:bg-slate-700 dark:text-slate-200'
      } ${
        isAwards ? 'awards-glow' : ''
      }`}
    >
      <Icon className={`h-4 w-4 flex-shrink-0 ${isAwards ? 'hover:fill-yellow-500 transition-colors' : ''}`} />
      {showLabel && <span>{tab.label}</span>}
      {tab.showNotification && (
        <Badge variant="destructive" className="ml-1 text-[10px] px-1.5 py-0 bg-red-600 hover:bg-red-700 border-red-600">
          !
        </Badge>
      )}
    </Button>
  );
};

export default ResponsiveNavigation;
