import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { Drawer, DrawerBody, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '../../ui/drawer';
import { useIsMobile } from '../../../hooks/use-mobile';
import { cn } from '../../../lib/utils';

/**
 * A checklist behind a button — the record trend chart's Teams and Seasons.
 *
 * The same shape as `ui/FloatingTeamFilter`: a popover on a pointer device, a
 * bottom sheet below md, which are structurally different components and so
 * the one place `useIsMobile` is the right tool. The last checked box is
 * disabled, so the chart is never emptied by a selection.
 *
 * @param {{
 *   label: string,
 *   summary: string,
 *   options: { value: string, label: string, icon?: React.ReactNode }[],
 *   selected: string[],
 *   onToggle: (value: string) => void,
 *   allOption?: { label: string, checked: boolean, onToggle: () => void },
 * }} props
 */
const TrendPicker = ({ label, summary, options, selected, onToggle, allOption }) => {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);

  const trigger = (
    <Button
      variant="outline"
      aria-label={`${label}: ${summary}`}
      className="w-full min-w-0 justify-between gap-2 sm:w-auto sm:min-w-40 sm:max-w-64"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 text-muted-foreground">{label}</span>
        <span className="truncate">{summary}</span>
      </span>
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Button>
  );

  const list = (
    <div role="group" aria-label={label}>
      {allOption && (
        <CheckRow
          id={`trend-${label}-all`}
          checked={allOption.checked}
          onCheckedChange={allOption.onToggle}
          className="mb-1 border-b border-border pb-2"
        >
          {allOption.label}
        </CheckRow>
      )}
      {options.map((option) => {
        const checked = selected.includes(option.value);
        return (
          <CheckRow
            key={option.value}
            id={`trend-${label}-${option.value}`}
            checked={checked}
            disabled={checked && selected.length === 1}
            onCheckedChange={() => onToggle(option.value)}
          >
            {option.icon}
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
          </CheckRow>
        );
      })}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{label}</DrawerTitle>
          </DrawerHeader>
          <DrawerBody className="max-h-[60dvh] overflow-y-auto px-4 pb-4">{list}</DrawerBody>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="max-h-[22rem] overflow-y-auto overscroll-contain">{list}</div>
      </PopoverContent>
    </Popover>
  );
};

const CheckRow = ({ id, checked, disabled = false, onCheckedChange, className, children }) => (
  <label
    htmlFor={id}
    // `min-h-11` on touch only: a 32px checkbox row is a coin-flip tap.
    className={cn(
      'flex w-full items-center gap-2.5 rounded p-2 text-sm transition-colors pointer-coarse:min-h-11',
      disabled ? 'cursor-default' : 'cursor-pointer hover:bg-accent',
      className
    )}
  >
    <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    {children}
  </label>
);

export default TrendPicker;
