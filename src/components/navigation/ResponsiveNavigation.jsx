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

              return (
                <DropdownMenuItem
                  key={tab.id}
                  onClick={() => {
                    onTabChange(tab.id);
                    setIsDropdownOpen(false);
                  }}
                  disabled={isDisabled}
                  className={isActive ? 'bg-accent' : ''}
                >
                  <Icon className="h-4 w-4 mr-2" />
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

  return (
    <Button
      variant={isActive ? 'default' : 'ghost'}
      size="sm"
      disabled={isDisabled}
      onClick={onClick}
      title={!showLabel ? tab.label : undefined}
      className={`flex items-center ${showLabel ? 'space-x-2' : 'space-x-0'} h-9 ${
        isActive
          ? 'bg-[hsl(217,32.6%,17.5%)] text-white hover:bg-[hsl(217,32.6%,20%)] border-[hsl(217,32.6%,17.5%)]'
          : 'dark:hover:bg-slate-700 dark:text-slate-200'
      }`}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
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
