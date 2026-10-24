import { NavLink } from 'react-router-dom';
import { ChevronRight, MessagesSquare, RotateCcw, Search, X } from 'lucide-react';

import { cn } from '../../../lib/utils';
import { useIsMobile } from '../../../hooks/use-mobile';
import { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '../../ui/drawer';
import { PageHeader } from '../../layout/PageHeader';
import { useLeagueChat } from '../LeagueChatContext.jsx';
import { Composer, ConversationBody, LIT } from './ChatParts.jsx';

/**
 * PROTOTYPE (not for merge): three homes for the chat, picked by
 * `localStorage['ogjits:chat-ui']` so one build can be shot three ways.
 *   drawer — a tile in the Menu opens a Menu-style drawer
 *   page   — a page at /ask, reached from the header and the Menu
 *   bar    — an ask bar docked above the tab bar opens the drawer
 */
export const CHAT_UI_KEY = 'ogjits:chat-ui';
export const chatUiVariant = () => {
  try { return localStorage.getItem(CHAT_UI_KEY) || 'current'; } catch { return 'current'; }
};

const HEADER_ICON = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors pointer-coarse:min-w-11 ' +
  'text-muted-foreground hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

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

/** The chat as the Menu is drawn: a vaul drawer on a phone, a panel down the left from md. */
export function ChatDrawer() {
  const chat = useLeagueChat();
  const isMobile = useIsMobile();
  if (!chat.available) return null;

  const body = (
    <ConversationBody messages={chat.messages} isPending={chat.isPending} onAsk={chat.send} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3" />
  );
  const composer = (
    <div className="border-t border-border bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3">
      <Composer onSend={chat.send} isPending={chat.isPending} />
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={chat.isOpen} onOpenChange={(o) => (o ? chat.open() : chat.close())} shouldScaleBackground={false}>
        <DrawerContent className="h-[85dvh]">
          <DrawerHeader className="flex flex-row items-center gap-2 pb-2 text-left">
            <MessagesSquare className="h-4 w-4 text-primary" aria-hidden="true" />
            <DrawerTitle className="flex-1">Ask og jits</DrawerTitle>
            <DrawerDescription className="sr-only">Ask a question about the league&apos;s history.</DrawerDescription>
            <ResetButton chat={chat} />
          </DrawerHeader>
          <DrawerBody className="flex min-h-0 flex-1 flex-col overflow-hidden p-0 pb-0">
            {body}
            {composer}
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    );
  }

  if (!chat.isOpen) return null;
  return (
    <aside aria-label="Ask og jits" className="fixed inset-y-0 left-0 z-[45] flex w-[400px] max-w-[calc(100vw-3rem)] flex-col border-r border-border bg-background shadow-[4px_0_16px_rgb(0_0_0/0.45)] lg:shadow-none">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <MessagesSquare className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="flex-1 text-base font-semibold text-foreground">Ask og jits</h2>
        <ResetButton chat={chat} />
        <button type="button" onClick={chat.close} aria-label="Close the chat" className={HEADER_ICON}><X className="h-4 w-4" aria-hidden="true" /></button>
      </div>
      {body}
      {composer}
    </aside>
  );
}

/** Option B: the chat is a page, like Alerts. */
export function AskPage() {
  const chat = useLeagueChat();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        icon={MessagesSquare}
        title="Ask og jits"
        description="Opinions with their reasons, from the league's own data."
        actions={chat.messages.length > 0 ? <ResetButton chat={chat} /> : null}
      />
      <ConversationBody messages={chat.messages} isPending={chat.isPending} onAsk={chat.send} pickerColumns="grid-cols-3 md:grid-cols-6" intro={false} />
      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] mt-4 bg-gradient-to-t from-background via-background to-transparent pt-4 lg:bottom-6">
        <Composer onSend={chat.send} isPending={chat.isPending} />
      </div>
    </div>
  );
}

/** Options A and B: the header's icon, beside the bell. */
export const AskHeaderLink = ({ variant, active, className }) => {
  const chat = useLeagueChat();
  if (!chat.available) return null;
  const icon = <MessagesSquare className="h-[18px] w-[18px]" aria-hidden="true" />;
  return variant === 'page' ? (
    <NavLink to="/ask" aria-label="Ask og jits" title="Ask og jits" className={cn(HEADER_ICON, active && 'bg-accent text-accent-foreground', className)}>{icon}</NavLink>
  ) : (
    <button type="button" onClick={() => chat.open()} aria-label="Ask og jits" title="Ask og jits" className={cn(HEADER_ICON, className)}>{icon}</button>
  );
};

/** Option C on a desktop: a search-style field in the header that opens the panel. */
export const AskHeaderField = ({ className }) => {
  const chat = useLeagueChat();
  if (!chat.available) return null;
  return (
    <button
      type="button"
      onClick={() => chat.open()}
      className={cn('h-9 w-40 xl:w-52 items-center gap-2 rounded-lg border border-border bg-background/60 px-3 text-sm text-muted-foreground hover:bg-accent/40', className)}
    >
      <Search className="h-4 w-4" aria-hidden="true" />
      <span className="flex-1 text-left">Ask og jits…</span>
    </button>
  );
};

/** Option C on a phone: an ask bar docked above the tab bar. */
export const AskDock = () => {
  const chat = useLeagueChat();
  if (!chat.available || chat.isOpen) return null;
  return (
    <button
      type="button"
      onClick={() => chat.open()}
      className={cn(
        'fixed inset-x-3 z-40 flex h-11 items-center gap-2.5 rounded-xl border border-border bg-card/95 px-3.5 text-sm text-muted-foreground backdrop-blur lg:hidden',
        LIT,
        'bottom-[calc(4.5rem+env(safe-area-inset-bottom))]'
      )}
    >
      <MessagesSquare className="h-4 w-4 text-primary" aria-hidden="true" />
      <span className="flex-1 text-left">Ask og jits about the league…</span>
    </button>
  );
};

/** Options A and B: the entry at the top of the Menu drawer, a lit card like its profile card. */
export const MenuAskEntry = ({ onSelect, to, onNavigate }) => {
  const inner = (
    <>
      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <MessagesSquare className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">Ask og jits</span>
        <span className="block truncate text-xs text-muted-foreground">Opinions on the league, with receipts</span>
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
    </>
  );
  const cls = cn('flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-card p-3 text-left active:bg-accent/60', LIT);
  return to ? (
    <NavLink to={to} onClick={onNavigate} className={cls}>{inner}</NavLink>
  ) : (
    <button type="button" onClick={onSelect} className={cls}>{inner}</button>
  );
};
