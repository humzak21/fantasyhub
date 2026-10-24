import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bell, Check, CheckCheck, ListChecks, MessageSquare, Swords, Trash2 } from 'lucide-react';

import PageHeader from '../layout/PageHeader.jsx';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { formatDateTime, cn } from '../../lib/utils';
import {
  countUnread,
  useInboxMutations,
  useMyTaunts,
  useNotificationInbox,
  useSendTaunt
} from '../../../hooks/queries/index.js';
import { tauntIdFromUrl, tauntState } from '../../utils/taunts.js';
import TauntSheet from './TauntSheet.jsx';
import { useLeagueChat } from '../ask/LeagueChatContext.jsx';

/**
 * Alerts (`/alerts`): every push notification this member was sent, newest
 * first, with what is unread marked. The bell in the header, beside the cog,
 * is the way here — one tap from anywhere, with the unread count on it.
 *
 * It exists because a push is gone the moment it is tapped, and its title is
 * cut to one line on the lock screen — a member who opened one had no way to
 * read it again. The sender keeps a row per member for every send
 * (`notification_inbox`), so this is the same list on the phone app and the
 * website, and on every device the member signs in on.
 *
 * Tapping an alert marks it read and goes where the push would have; "Mark
 * all read" clears the rest. The bell's badge counts the same rows.
 *
 * A matchup fact links back here (`?taunt=<id>`), because iOS shows no
 * buttons on a web notification: the link opens `TauntSheet`, which sends the
 * fact to the opponent. In the list, a fact that can still be sent carries a
 * "Taunt <opponent>" button and a sent one says "Taunted".
 */

const KIND_ICON = [
  [/^pickems/, ListChecks],
  [/^take/, MessageSquare],
  [/^matchup_facts/, Swords],
  [/^taunts/, Swords]
];

function alertIcon(kind = '') {
  return KIND_ICON.find(([pattern]) => pattern.test(kind))?.[1] ?? Bell;
}

const RowSkeleton = () => (
  <ul className="divide-y divide-border" aria-hidden="true">
    {[0, 1, 2].map((i) => (
      <li key={i} className="space-y-2 px-4 py-3">
        <div className="h-4 w-48 max-w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-72 max-w-full animate-pulse rounded bg-muted" />
      </li>
    ))}
  </ul>
);

const AlertsPage = () => {
  const navigate = useNavigate();
  const { data: alerts = [], isLoading, error } = useNotificationInbox();
  const { markRead, remove } = useInboxMutations();
  const unread = countUnread(alerts);
  const [params, setParams] = useSearchParams();
  const tauntParam = params.get('taunt');
  const { data: taunts = [], isLoading: tauntsLoading } = useMyTaunts();
  const sendTaunt = useSendTaunt();
  const tauntsById = useMemo(() => new Map(taunts.map((taunt) => [taunt.id, taunt])), [taunts]);
  const chat = useLeagueChat();

  // Arriving from the push is reading it.
  useEffect(() => {
    if (!tauntParam) return;
    const ids = alerts.filter((a) => !a.readAt && tauntIdFromUrl(a.url) === tauntParam).map((a) => a.id);
    if (ids.length) markRead.mutate(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tauntParam, alerts]);

  const openTaunt = (id) => setParams({ taunt: id });
  const closeTaunt = () => setParams({}, { replace: true });

  const open = (alert) => {
    if (!alert.readAt) markRead.mutate([alert.id]);
    // Only the app's own pages; a push never carries anything else.
    if (alert.url?.startsWith('/')) navigate(alert.url);
  };

  return (
    <div>
      <PageHeader
        icon={Bell}
        title="Alerts"
        description="Every notification you have been sent, newest first. They stay here after you tap them on your phone."
        actions={(
          <Button
            variant="outline"
            size="sm"
            disabled={unread === 0 || markRead.isPending}
            onClick={() => markRead.mutate(null)}
          >
            <CheckCheck className="mr-2 h-4 w-4" aria-hidden="true" />
            Mark all read
          </Button>
        )}
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <RowSkeleton />
          ) : error ? (
            <p className="p-4 text-sm text-destructive">Alerts could not be loaded: {error.message}</p>
          ) : alerts.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="No alerts yet"
              description="Pick'em reminders, takes and daily matchup facts will be kept here once they are sent to you."
            />
          ) : (
            <ul className="divide-y divide-border">
              {alerts.map((alert) => {
                const Icon = alertIcon(alert.kind);
                const isUnread = !alert.readAt;
                const taunt = tauntsById.get(tauntIdFromUrl(alert.url));
                const tauntStatus = tauntState(taunt);
                return (
                  <li key={alert.id} className={cn('flex items-start gap-1 pr-2', isUnread && 'bg-primary/5')}>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => open(alert)}
                        className="flex w-full min-w-0 items-start gap-3 px-4 py-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="relative mt-0.5 shrink-0">
                          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          {isUnread && (
                            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-card" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn('block text-sm text-foreground', isUnread ? 'font-semibold' : 'font-medium')}>
                            {alert.title}
                            {isUnread && <span className="sr-only"> (unread)</span>}
                          </span>
                          {alert.body && (
                            <span className="mt-0.5 block whitespace-pre-line break-words text-sm text-muted-foreground">
                              {alert.body}
                            </span>
                          )}
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {formatDateTime(alert.createdAt)}
                          </span>
                        </span>
                      </button>
                      {tauntStatus === 'open' && (
                        <div className="pb-3 pl-11 pr-4">
                          <Button variant="outline" size="sm" onClick={() => openTaunt(taunt.id)}>
                            <Swords className="mr-2 h-4 w-4" aria-hidden="true" />
                            Taunt {taunt.opponentName}
                          </Button>
                        </div>
                      )}
                      {tauntStatus === 'sent' && (
                        <p className="flex items-center gap-1 pb-3 pl-11 pr-4 text-xs text-muted-foreground">
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          Taunted {taunt.opponentName}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mt-2 shrink-0 text-muted-foreground"
                      aria-label={`Delete alert: ${alert.title}`}
                      onClick={() => remove.mutate(alert.id)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {tauntParam && (
        <TauntSheet
          key={tauntParam}
          taunt={tauntsById.get(tauntParam)}
          isLoading={tauntsLoading}
          autoSend={params.get('send') === '1'}
          onSend={(id) => sendTaunt.mutateAsync(id)}
          isSending={sendTaunt.isPending}
          onClose={closeTaunt}
          onAskAbout={chat.available ? (opponent) => {
            closeTaunt();
            chat.open(`What's my record against ${opponent}?`);
          } : null}
        />
      )}
    </div>
  );
};

export default AlertsPage;
