import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import { useAskLeague } from '../../../hooks/queries/index.js';

/**
 * The league chat's conversation, held above the routes so it survives
 * navigating between tabs. One provider in the shell; `useLeagueChat()` from
 * anywhere opens it, optionally with a question to ask (a taunt's "Ask og jits
 * about this rivalry").
 *
 * Outside the provider — a signed-out or unapproved viewer, or a test that
 * does not mount it — `useLeagueChat()` returns `available: false` and no-ops,
 * so a caller never has to check whether the chat exists before offering it.
 */

const LeagueChatContext = createContext(null);

const UNAVAILABLE = Object.freeze({
  available: false,
  isOpen: false,
  messages: [],
  isPending: false,
  open: () => {},
  close: () => {},
  send: () => {},
  reset: () => {}
});

let nextId = 0;
const id = () => `m${(nextId += 1)}`;

/** Earlier turns as the model reads them: what was asked and what was said. */
export const historyOf = (messages) =>
  messages
    .filter((m) => !m.error && m.content)
    .map((m) => ({ role: m.role, content: m.content }));

/** `enabled` is the viewer being an approved member; without it the chat does not exist. */
export function LeagueChatProvider({ enabled = true, children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const ask = useAskLeague();
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const send = useCallback((question) => {
    const text = String(question ?? '').trim();
    if (!text || ask.isPending) return;
    const history = historyOf(messagesRef.current);
    setMessages((prev) => [...prev, { id: id(), role: 'user', content: text }]);
    ask.mutate({ question: text, history }, {
      onSuccess: (reply) => setMessages((prev) => [...prev, {
        id: id(),
        role: 'assistant',
        content: reply.text,
        kind: reply.kind,
        queries: reply.queries,
        asOf: reply.asOf
      }]),
      onError: (error) => setMessages((prev) => [...prev, {
        id: id(),
        role: 'assistant',
        content: error?.message || 'Something went wrong. Try again in a minute.',
        error: true
      }])
    });
  }, [ask]);

  const open = useCallback((question) => {
    setIsOpen(true);
    if (question) send(question);
  }, [send]);

  const value = useMemo(() => ({
    available: true,
    isOpen,
    messages,
    isPending: ask.isPending,
    open,
    close: () => setIsOpen(false),
    send,
    reset: () => setMessages([])
  }), [isOpen, messages, ask.isPending, open, send]);

  return <LeagueChatContext.Provider value={enabled ? value : UNAVAILABLE}>{children}</LeagueChatContext.Provider>;
}

export function useLeagueChat() {
  return useContext(LeagueChatContext) ?? UNAVAILABLE;
}
