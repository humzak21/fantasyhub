import { useEffect } from 'react';
import { MessagesSquare, RotateCcw, X } from 'lucide-react';

import { cn } from '../../lib/utils';
import { useIsMobile } from '../../hooks/use-mobile';
import { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '../ui/drawer';
import { useLeagueChat } from './LeagueChatContext.jsx';
import { Composer, ConversationBody, LIT } from './ChatParts.jsx';

/**
 * Ask og jits, mounted once at the app root (JITS-42).
 *
 * It has two ways in, both for approved members only: below `lg`, an ask bar
 * docked on top of the phone tab bar (`AskBar`, rendered by `MobileTabBar` as
 * its `dock`); from `lg`, a search-style field in the header
 * (`AskHeaderField`). Both lead with `ChatBadge`, the launcher's round orange
 * chat icon, so the chat looks the same wherever it is opened from.
 *
 * Below `md` the chat is a vaul drawer drawn like the Menu; from `md` it is a
 * panel down the left-hand side that leaves the page usable, and from `lg`
 * the page moves over to make room for it (`CHAT_PANEL_WIDTH`, applied by
 * `LeagueChatOffset`). Both render the same `ChatParts`, so there is no phone
 * copy of the feature.
 *
 * Rendered at the root, never inside the header: the header's backdrop-blur
 * makes it the containing block for `position: fixed` children.
 */

export const CHAT_PANEL_WIDTH = 'lg:pl-[400px]';

/**
 * How much taller the phone tab bar is with the ask bar on it. The shell's
 * bottom padding and anything sticky above the tab bar (`PickEmsSubmitBar`)
 * add `var(--tab-dock, 0px)`, so they clear the bar whether or not it is there.
 */
export const TAB_DOCK_HEIGHT = '3.25rem';

/**
 * The shell's root: moves the page over for the open panel from `lg` up, and
 * says how tall the ask bar makes the tab bar.
 */
export const LeagueChatOffset = ({ className, children }) => {
  const { available, isOpen } = useLeagueChat();
  return (
    <div className={cn(className, isOpen && CHAT_PANEL_WIDTH)} style={available ? { '--tab-dock': TAB_DOCK_HEIGHT } : undefined}>
      {children}
    </div>
  );
};

const HEADER_ICON =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors pointer-coarse:min-w-11 ' +
  'text-muted-foreground hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** The chat's mark: the round orange launcher's icon, at the size of a field's. */
export const ChatBadge = ({ className }) => (
  <span
    aria-hidden="true"
    className={cn(
      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground',
      'shadow-[0_2px_6px_rgb(0_0_0/0.45),inset_0_1px_0_rgb(255_255_255/0.12)]',
      className
    )}
  >
    <MessagesSquare className="h-3.5 w-3.5" />
  </span>
);

const ResetButton = ({ chat }) => (
  <button
    type="button"
    onClick={chat.reset}
    disabled={!chat.messages.length || chat.isPending}
    aria-label="New conversation"
    className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-accent/50 disabled:opacity-40"
  >
    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> New
  </button>
);

/** The chat: a Menu-style drawer below `md`, a panel down the left from `md`. */
const LeagueChat = () => {
  const chat = useLeagueChat();
  const isMobile = useIsMobile();

  // Escape closes the side panel; the drawer handles its own.
  useEffect(() => {
    if (!chat.isOpen || isMobile) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') chat.close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chat, isMobile]);

  if (!chat.available) return null;

  const body = (
    <ConversationBody
      messages={chat.messages}
      isPending={chat.isPending}
      onAsk={chat.send}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3"
    />
  );
  const composer = (autoFocus) => (
    <div className="border-t border-border bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3">
      <Composer onSend={chat.send} isPending={chat.isPending} autoFocus={autoFocus} />
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={chat.isOpen} onOpenChange={(open) => (open ? chat.open() : chat.close())} shouldScaleBackground={false}>
        <DrawerContent className="h-[85dvh]">
          <DrawerHeader className="flex flex-row items-center gap-2 pb-2 text-left">
            <MessagesSquare className="h-4 w-4 text-primary" aria-hidden="true" />
            <DrawerTitle className="flex-1">Ask og jits</DrawerTitle>
            <DrawerDescription className="sr-only">Ask a question about the league&apos;s history.</DrawerDescription>
            <ResetButton chat={chat} />
          </DrawerHeader>
          <DrawerBody className="flex min-h-0 flex-1 flex-col overflow-hidden p-0 pb-0">
            {body}
            {/* No autofocus: on a phone it would raise the keyboard over the topics. */}
            {composer(false)}
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    );
  }

  if (!chat.isOpen) return null;
  return (
    <aside
      aria-label="Ask og jits"
      className="fixed inset-y-0 left-0 z-[45] flex w-[400px] max-w-[calc(100vw-3rem)] flex-col border-r border-border bg-background shadow-[4px_0_16px_rgb(0_0_0/0.45)] lg:shadow-none"
    >
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <MessagesSquare className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="flex-1 text-base font-semibold text-foreground">Ask og jits</h2>
        <ResetButton chat={chat} />
        <button type="button" onClick={chat.close} aria-label="Close the chat" className={HEADER_ICON}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {body}
      {composer(true)}
    </aside>
  );
};

/**
 * The ask bar docked on top of the phone tab bar. `MobileTabBar` renders it
 * inside its own `fixed` element, so the two cannot overlap, and the tab bar
 * is `lg:hidden`, so this is too.
 */
export const AskBar = () => {
  const chat = useLeagueChat();
  if (!chat.available) return null;
  return (
    <div className="mx-auto max-w-lg px-3 pt-2">
      <button
        type="button"
        onClick={() => chat.open()}
        aria-label="Ask og jits"
        className={cn(
          'flex h-10 w-full items-center gap-2.5 rounded-xl border border-border bg-background/60 pl-1.5 pr-3.5 text-sm text-muted-foreground',
          'active:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          LIT
        )}
      >
        <ChatBadge />
        <span className="flex-1 truncate text-left">Ask og jits about the league…</span>
      </button>
    </div>
  );
};

/** From `lg`: a search-style field in the header that opens the side panel. */
export const AskHeaderField = ({ className }) => {
  const chat = useLeagueChat();
  if (!chat.available) return null;
  return (
    <button
      type="button"
      onClick={() => chat.open()}
      aria-label="Ask og jits"
      aria-expanded={chat.isOpen}
      className={cn(
        'h-9 w-40 items-center gap-2 rounded-lg border border-border bg-background/60 pl-1 pr-3 text-sm text-muted-foreground xl:w-52',
        'hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        chat.isOpen && 'border-primary/40 text-foreground',
        className
      )}
    >
      <ChatBadge />
      <span className="flex-1 truncate text-left">Ask og jits…</span>
    </button>
  );
};


export default LeagueChat;
