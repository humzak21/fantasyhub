import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '../ui/drawer';
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

  .awards-glow {
    animation: pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
`;

/**
 * ResponsiveNavigation Component
 *
 * Intelligently renders navigation buttons that progressively collapse:
 * - Large screens: Full buttons with labels and icons
 * - Medium screens: Icons only (no labels)
 * - Small screens: a bottom drawer
 *
 * The small tier used to be a dropdown menu: 48px-tall rows in a 192px-wide
 * popover anchored to the top-right corner — the far end of the screen from a
 * thumb, with the eight destinations of an entire site crammed into it. It is
 * a bottom drawer now, which lands where the hand already is, is dismissed by
 * flicking down, and has room to say what each destination is.
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
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Filter tabs based on visibility rules
  const visibleTabs = tabs.filter(shouldShowTab);

  // The trigger is the only thing visible below sm, so it has to carry the
  // notification that individual tabs would otherwise show.
  const hasAnyNotification = visibleTabs.some(tab => tab.showNotification);

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

      {/* Drawer Navigation - Small screens (below sm) */}
      <div className="sm:hidden">
        <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
          <DrawerTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open navigation"
              className="relative"
            >
              <Menu className="h-5 w-5" />
              {hasAnyNotification && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-600" />
              )}
            </Button>
          </DrawerTrigger>

          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Go to</DrawerTitle>
            </DrawerHeader>

            <DrawerBody>
              <nav className="grid gap-1 px-2 pb-4">
                {visibleTabs.map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  const isDisabled = tab.isDisabled || false;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => {
                        onTabChange(tab.id);
                        setIsDrawerOpen(false);
                      }}
                      className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-base transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                        isActive
                          ? 'bg-accent font-semibold text-accent-foreground'
                          : 'hover:bg-accent/50'
                      }`}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                      {tab.showNotification && (
                        <Badge
                          variant="destructive"
                          className="shrink-0 border-red-600 bg-red-600 px-1.5 py-0 text-[10px] hover:bg-red-700"
                        >
                          !
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </nav>
            </DrawerBody>
          </DrawerContent>
        </Drawer>
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
          : ''
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
