import { useEffect } from 'react';
import { MessagesSquare } from 'lucide-react';

import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../ui/sheet';
import { useIsMobile } from '../../hooks/use-mobile';
import { cn } from '../../lib/utils';
import ChatConversation from './ChatConversation.jsx';
import { useLeagueChat } from './LeagueChatContext.jsx';
import { AskDock, ChatDrawer, chatUiVariant } from './redesign/variants.jsx';

/**
 * Ask og jits, mounted once at the app root (JITS-42).
 *
 * The launcher sits in the bottom-left corner on every page: above the phone
 * tab bar below `lg`, in the corner itself above it. On a phone the chat opens
 * as a bottom sheet; from `md` up it is a panel down the left-hand side that
 * leaves the page usable, and from `lg` the page moves over to make room for
 * it (`CHAT_PANEL_WIDTH`, applied by the shell). Both render the one
 * `ChatConversation`, so there is no phone copy of the feature.
 *
 * Rendered at the root, never inside the header: the header's backdrop-blur
 * makes it the containing block for `position: fixed` children.
 */

export const CHAT_PANEL_WIDTH = 'lg:pl-[400px]';

/** The shell's root: moves the page over for the open panel from `lg` up. */
export const LeagueChatOffset = ({ className, children }) => {
  const { isOpen } = useLeagueChat();
  return <div className={cn(className, isOpen && CHAT_PANEL_WIDTH)}>{children}</div>;
};

const LeagueChat = () => {
  const variant = chatUiVariant();
  if (variant === 'drawer') return <ChatDrawer />;
  if (variant === 'bar') return <><AskDock /><ChatDrawer /></>;
  if (variant === 'page') return null;
  return <CurrentLeagueChat />;
};

const CurrentLeagueChat = () => {
  const chat = useLeagueChat();
  const isMobile = useIsMobile();

  // Escape closes the side panel; the sheet handles its own.
  useEffect(() => {
    if (!chat.isOpen || isMobile) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') chat.close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chat, isMobile]);

  if (!chat.available) return null;

  const conversation = (Title) => (
    <ChatConversation
      Title={Title}
      messages={chat.messages}
      isPending={chat.isPending}
      onSend={chat.send}
      onReset={chat.reset}
      onClose={chat.close}
    />
  );

  return (
    <>
      {!chat.isOpen && (
        <button
          type="button"
          onClick={() => chat.open()}
          aria-label="Ask og jits"
          title="Ask og jits"
          className={cn(
            'fixed left-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground',
            'shadow-[0_4px_12px_rgb(0_0_0/0.5),inset_0_1px_0_rgb(255_255_255/0.12)] transition-transform hover:scale-105',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-6 lg:left-6'
          )}
        >
          <MessagesSquare className="h-5 w-5" aria-hidden="true" />
        </button>
      )}

      {isMobile ? (
        <Sheet open={chat.isOpen} onOpenChange={(open) => (open ? chat.open() : chat.close())}>
          <SheetContent side="bottom" hideClose className="h-[90dvh] max-h-[90dvh] gap-0 overflow-hidden p-0 sm:p-0">
            <SheetDescription className="sr-only">Ask a question about the league&apos;s history.</SheetDescription>
            {conversation(SheetTitle)}
          </SheetContent>
        </Sheet>
      ) : chat.isOpen && (
        <aside
          aria-label="Ask og jits"
          className="fixed inset-y-0 left-0 z-[45] w-[400px] max-w-[calc(100vw-3rem)] border-r border-border bg-background shadow-[4px_0_16px_rgb(0_0_0/0.45)] lg:shadow-none"
        >
          {conversation('h2')}
        </aside>
      )}
    </>
  );
};

export default LeagueChat;
