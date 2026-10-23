import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Medal } from 'lucide-react';

import HomeWidget from '../HomeWidget';
import { Skeleton } from '../../ui/skeleton';
import { cn } from '../../../lib/utils';
import { useViewer } from '../../../contexts/ViewerContext.jsx';
import { useNearViewport } from '../../../hooks/use-near-viewport.js';
import { useScrollEdges } from '../../../hooks/use-scroll-edges.js';
import { useHistoryFranchises, useHomeRecordBooks } from '../../../../hooks/queries/index.js';
import { buildRecordIdentity } from '../../history/records/recordIdentity';
import { dateKeyOf, homeRecordCards } from '../../../../utils/home/records.js';
import { franchiseIdOf } from '../../../../utils/viewerTeam.js';
import { RecordCardMini } from './RecordCardMini';

const NONE = [];

/**
 * Records worth a look today: what the latest week put into a top five, the
 * record of the day, and the viewer's own best place — `homeRecordCards`, over
 * the record book the History tab builds.
 *
 * A horizontal scroller that snaps a card to the gutter. On a phone a card is
 * 85% of the row, so the next one peeks — that peek is the swipe affordance.
 * From `sm` two fit, from `lg` three. Previous / next buttons sit at the edges
 * only while there is more that way (`useScrollEdges`, as the nav's chevrons),
 * and the dots follow the scroll. Nothing auto-advances.
 *
 * The record book is the heaviest read on the page, so it waits until the card
 * is near the viewport — on a desktop that is at once, on a phone one screen
 * down — and it is the same cache entry Records and Compare stats read.
 */
export default function RecordsCarousel({ ctx }) {
  const { viewerTeam, canOpenTab } = ctx;
  const { user, isAdmin, teamOwnerNames } = useViewer();

  const anchorRef = useRef(null);
  const near = useNearViewport(anchorRef);
  const { data, isPending, isError, refetch } = useHomeRecordBooks({ enabled: near });
  const { data: franchises = NONE } = useHistoryFranchises();

  // The date is part of the answer (the record of the day), so it is read
  // once per mount: a member who leaves the page open past midnight sees
  // yesterday's pick until they come back, rather than a card swapping under
  // them.
  const [dateKey] = useState(() => dateKeyOf());

  const cards = useMemo(
    () =>
      data
        ? homeRecordCards({
            book: data.book,
            before: data.before,
            franchiseId: franchiseIdOf(viewerTeam),
            dateKey
          })
        : NONE,
    [data, viewerTeam, dateKey]
  );

  const identity = useMemo(
    () => buildRecordIdentity({ franchises, book: data?.book, user, isAdmin, teamOwnerNames }),
    [franchises, data, user, isAdmin, teamOwnerNames]
  );

  const linkable = canOpenTab ? canOpenTab('history') : true;

  return (
    <div ref={anchorRef}>
      <HomeWidget
        id="records"
        icon={Medal}
        title="Records"
        aside={data?.latest ? <span className="tabular">After week {data.latest.week}</span> : null}
        to={linkable ? '/history?tab=records' : undefined}
        toLabel="Open the record book"
        loading={!near || isPending}
        skeleton={<CarouselSkeleton />}
        error={isError}
        onRetry={() => refetch()}
        empty={!isPending && cards.length === 0 && <p className="text-sm text-muted-foreground">No records yet.</p>}
      >
        <Carousel cards={cards} identity={identity} linkable={linkable} />
      </HomeWidget>
    </div>
  );
}

function Carousel({ cards, identity, linkable }) {
  const scrollerRef = useRef(null);
  const edges = useScrollEdges(scrollerRef, cards.length);
  const [active, setActive] = useState(0);

  // Which card is at the start of the row, from the scroll position itself —
  // never a counter the buttons keep, which a swipe would leave behind. At the
  // end of the row the last card is the one in view, however wide the row.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const items = [...el.children];
        if (items.length === 0) return;
        if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 1) {
          setActive(items.length - 1);
          return;
        }
        const origin = items[0].offsetLeft;
        let nearest = 0;
        items.forEach((item, index) => {
          if (Math.abs(item.offsetLeft - origin - el.scrollLeft) < Math.abs(items[nearest].offsetLeft - origin - el.scrollLeft)) {
            nearest = index;
          }
        });
        setActive(nearest);
      });
    };
    el.addEventListener('scroll', measure, { passive: true });
    return () => {
      el.removeEventListener('scroll', measure);
      cancelAnimationFrame(frame);
    };
  }, []);

  const go = useCallback((index) => {
    const el = scrollerRef.current;
    const item = el?.children[index];
    if (!el || !item) return;
    el.scrollTo({ left: item.offsetLeft - el.firstElementChild.offsetLeft, behavior: 'smooth' });
  }, []);

  const step = (direction) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: 'smooth' });
  };

  const overflows = edges.start || edges.end;

  return (
    <div className="relative">
      <ul
        ref={scrollerRef}
        aria-label="Records"
        className={cn(
          // Bleeds to the card's edges (-mx-4 px-4) so a card snaps to the
          // gutter and the next one peeks from the edge, not from inside it.
          '-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1',
          '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        )}
      >
        {cards.map((card) => (
          <li
            key={`${card.kind}:${card.key}`}
            className="w-[85%] shrink-0 snap-start sm:w-[calc(50%-0.375rem)] lg:w-[calc((100%-1.5rem)/3)]"
          >
            <RecordCardMini card={card} identity={identity} linkable={linkable} />
          </li>
        ))}
      </ul>

      {edges.start && (
        <EdgeButton side="left" label="Previous records" onClick={() => step(-1)} />
      )}
      {edges.end && <EdgeButton side="right" label="More records" onClick={() => step(1)} />}

      {overflows && cards.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5" aria-hidden="true">
          {cards.map((card, index) => (
            <button
              key={`${card.kind}:${card.key}`}
              type="button"
              tabIndex={-1}
              onClick={() => go(index)}
              className={cn(
                'h-1.5 rounded-full transition-all',
                index === active ? 'w-4 bg-foreground/70' : 'w-1.5 bg-foreground/20'
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A chevron at the row's edge. Hidden from assistive technology like the
 * nav's: every card is already a link, and focusing one scrolls it into view.
 */
function EdgeButton({ side, label, onClick }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      title={label}
      onClick={onClick}
      className={cn(
        'absolute top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-popover/95 text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.4)] backdrop-blur-sm transition-colors hover:bg-accent sm:flex',
        side === 'left' ? '-left-2' : '-right-2'
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function CarouselSkeleton() {
  return (
    <div role="status" aria-label="Loading records" className="flex gap-3 overflow-hidden">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="w-[85%] shrink-0 space-y-3 rounded-lg border border-border p-3.5 sm:w-[calc(50%-0.375rem)] lg:w-[calc((100%-1.5rem)/3)]"
        >
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <div className="flex items-end justify-between">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-7 w-14" />
          </div>
        </div>
      ))}
    </div>
  );
}
