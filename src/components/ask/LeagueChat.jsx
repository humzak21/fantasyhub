import { useEffect, useRef } from 'react';
import { Flame, MessagesSquare, RotateCcw, X } from 'lucide-react';

import { cn } from '../../lib/utils';
import { useIsMobile } from '../../hooks/use-mobile';
import { useKeyboardFrame } from '../../hooks/use-keyboard-frame';
import { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '../ui/drawer';
import { Switch } from '../ui/switch';
import { useLeagueChat } from './LeagueChatContext.jsx';
import { Composer, ConversationBody } from './ChatParts.jsx';

/**
 * Ask og jits, mounted once at the app root (JITS-42).
 *
 * It is opened by one icon, the round orange chat button, for approved
 * members only: floating above the phone tab bar below `lg` (`ChatLauncher`),
 * and in the header from `lg` (`AskHeaderButton`). There is no text box to
 * type into until the chat is open.
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
 * The phone Menu's motion, borrowed for the side panel: vaul moves its drawers
 * over 0.5s on cubic-bezier(0.32, 0.72, 0, 1), so the panel slides in from the
 * left, and the page eases over beside it, on the same clock. Reduced motion
 * is honoured by the global rule in globals.css.
 */
export const DRAWER_MOTION = 'duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]';

/** The shell's root: moves the page over for the open panel from `lg` up. */
export const LeagueChatOffset = ({ className, children }) => {
  const { available, isOpen } = useLeagueChat();
  return (
    <div
      className={cn(className, available && cn('transition-[padding]', DRAWER_MOTION), isOpen && CHAT_PANEL_WIDTH)}
    >
      {children}
    </div>
  );
};

const HEADER_ICON =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors pointer-coarse:min-w-11 ' +
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

/**
 * The voice switch: Normal or Unhinged. It applies from the next question on,
 * so the earlier answers keep the voice they were asked in.
 */
const VoiceToggle = ({ chat, id }) => (
  <label
    htmlFor={id}
    title={chat.unhinged ? 'Unhinged: savage, and it swears' : 'Normal: sharp, no swearing'}
    className={cn(
      'flex h-8 cursor-pointer select-none items-center gap-1.5 rounded-lg pl-2 pr-1 text-xs font-medium transition-colors',
      chat.unhinged ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
    )}
  >
    <Flame className="h-3.5 w-3.5" aria-hidden="true" />
    Unhinged
    <Switch id={id} checked={chat.unhinged} onCheckedChange={chat.setUnhinged} aria-describedby={`${id}-hint`} />
    <span id={`${id}-hint`} className="sr-only">Savage answers with swearing, from your next question</span>
  </label>
);

/** The chat: a Menu-style drawer below `md`, a panel down the left from `md`. */
const LeagueChat = () => {
  const chat = useLeagueChat();
  const isMobile = useIsMobile();
  const scrollRef = useRef(null);
  const keyboard = useKeyboardFrame(isMobile && chat.isOpen);

  // The keyboard took the bottom of the drawer: keep the latest answer in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (keyboard && el) el.scrollTop = el.scrollHeight;
  }, [keyboard]);

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
      scrollRef={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3"
    />
  );
  // With the keyboard up there is no home indicator under the field to clear.
  const composer = (focusWhen) => (
    <div
      className={cn(
        'border-t border-border bg-background px-4 pt-3 md:pb-3',
        keyboard ? 'pb-3' : 'pb-[calc(0.75rem+env(safe-area-inset-bottom))]'
      )}
    >
      <Composer onSend={chat.send} isPending={chat.isPending} focusWhen={focusWhen} />
    </div>
  );

  if (isMobile) {
    // vaul's own keyboard handling (`repositionInputs`) moves the drawer up by
    // the keyboard's height while iOS pans the page up as well, so the drawer
    // went off the top of the screen. It is off, and the drawer sits on the
    // keyboard itself, sized to the strip the keyboard leaves
    // (`useKeyboardFrame`): header, latest answer and field all in view.
    return (
      <Drawer
        open={chat.isOpen}
        onOpenChange={(open) => (open ? chat.open() : chat.close())}
        shouldScaleBackground={false}
        repositionInputs={false}
      >
        <DrawerContent
          className="h-[85dvh]"
          style={keyboard ? { bottom: keyboard.bottom, height: keyboard.height, maxHeight: 'none' } : undefined}
        >
          <DrawerHeader className="flex flex-row items-center gap-2 pb-2 text-left">
            <MessagesSquare className="h-4 w-4 text-primary" aria-hidden="true" />
            <DrawerTitle className="flex-1 whitespace-nowrap">Ask og jits</DrawerTitle>
            <DrawerDescription className="sr-only">Ask a question about the league&apos;s history.</DrawerDescription>
            <VoiceToggle chat={chat} id="chat-voice-drawer" />
            <ResetButton chat={chat} />
          </DrawerHeader>
          {/* Only the handle and header drag the drawer, as the Menu is put
              away. A swipe on the messages or the field, which is how a
              keyboard gets put away, never closes the chat. */}
          <DrawerBody data-vaul-no-drag="" className="flex min-h-0 flex-1 flex-col overflow-hidden p-0 pb-0">
            {body}
            {/* No focus on open: on a phone it would raise the keyboard over the topics. */}
            {composer(false)}
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    );
  }

  // Mounted while closed, off-screen to the left, so it can slide both ways.
  // `inert` keeps a closed panel out of the tab order and the a11y tree.
  const open = chat.isOpen;
  return (
    <aside
      aria-label="Ask og jits"
      aria-hidden={open ? undefined : true}
      {...(open ? {} : { inert: '' })}
      data-state={open ? 'open' : 'closed'}
      className={cn(
        'fixed inset-y-0 left-0 z-[45] flex w-[400px] max-w-[calc(100vw-3rem)] flex-col border-r border-border bg-background',
        'shadow-[4px_0_16px_rgb(0_0_0/0.45)] lg:shadow-none',
        DRAWER_MOTION,
        // Visible at once on the way in (an invisible element cannot take the
        // field's focus), invisible only once the slide out has finished.
        open ? 'visible translate-x-0 transition-[translate]' : 'invisible -translate-x-full transition-[translate,visibility]'
      )}
    >
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <MessagesSquare className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="flex-1 text-base font-semibold text-foreground">Ask og jits</h2>
        <VoiceToggle chat={chat} id="chat-voice-panel" />
        <ResetButton chat={chat} />
        <button type="button" onClick={chat.close} aria-label="Close the chat" className={HEADER_ICON}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {body}
      {composer(open)}
    </aside>
  );
};

/** The launcher's face: the round orange button with the chat icon. */
const LAUNCHER =
  'flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground ' +
  'shadow-[0_4px_12px_rgb(0_0_0/0.5),inset_0_1px_0_rgb(255_255_255/0.12)] ' +
  'transition-[scale,box-shadow] duration-200 hover:scale-105 active:scale-95 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/**
 * Below `lg`: the round launcher, floating in the bottom-left corner above the
 * tab bar. It opens the drawer, which rises over it exactly as the Menu does.
 * Rendered at the root, never inside the header (see above).
 */
export const ChatLauncher = () => {
  const chat = useLeagueChat();
  if (!chat.available) return null;
  return (
    <button
      type="button"
      onClick={() => chat.open()}
      aria-label="Ask og jits"
      aria-haspopup="dialog"
      aria-expanded={chat.isOpen}
      title="Ask og jits"
      className={cn(LAUNCHER, 'fixed left-4 z-40 h-12 w-12 lg:hidden', 'bottom-[calc(4.75rem+env(safe-area-inset-bottom))]')}
    >
      <MessagesSquare className="h-5 w-5" aria-hidden="true" />
    </button>
  );
};

/**
 * From `lg`: the same button, header-sized, beside the bell. It toggles the
 * side panel, and while the panel is open it wears a ring, the way the Menu
 * button is lit while its drawer is up.
 */
export const AskHeaderButton = ({ className }) => {
  const chat = useLeagueChat();
  if (!chat.available) return null;
  return (
    <button
      type="button"
      onClick={() => (chat.isOpen ? chat.close() : chat.open())}
      aria-label={chat.isOpen ? 'Close Ask og jits' : 'Ask og jits'}
      aria-expanded={chat.isOpen}
      title="Ask og jits"
      className={cn(
        LAUNCHER,
        'h-9 w-9',
        chat.isOpen && 'ring-2 ring-primary/50 ring-offset-2 ring-offset-card',
        className
      )}
    >
      <MessagesSquare className="h-[18px] w-[18px]" aria-hidden="true" />
    </button>
  );
};

export default LeagueChat;
