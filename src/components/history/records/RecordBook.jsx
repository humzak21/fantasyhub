import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, Dices, Flame, ListChecks, Medal, Sigma, Sparkles, Target, Trophy, Zap } from 'lucide-react';
import { Card } from '../../ui/card';
import { EmptyState } from '../../ui/empty-state';
import { SectionHeading } from '../../ui/section-heading';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { useRecordBook } from '../../../../hooks/queries/index.js';
import { rankRows, recordRows } from '../../../../utils/recordBook/index.js';
import { canViewFullData, getMaskedFranchiseName } from '../utils/privacyHelpers';
import { RecordCard } from './RecordCard';
import { RECORDS, SECTIONS, hidesZero } from './recordCatalog';

const SECTION_ICONS = {
  winning: Trophy,
  scoring: Zap,
  games: Target,
  league: Sigma,
  playoffs: Medal,
  luck: Dices,
  lineups: ListChecks,
  streaks: Flame,
  transactions: ArrowLeftRight
};

const SCOPES = [
  { id: 'career', label: 'All-Time' },
  { id: 'season', label: 'Single Season' }
];

function RecordSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
      aria-busy="true"
      aria-label="Loading records"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="h-72 animate-pulse rounded-xl border border-border bg-card" />
      ))}
    </div>
  );
}

/**
 * The league record book: every record as a leaderboard.
 *
 * Two scopes, one set of sections. All-Time is careers and streaks that cross
 * seasons; Single Season is team-seasons, single games and in-season streaks,
 * with a picker that narrows every card to one year. Each section groups a
 * subject — winning, scoring, the playoffs — with opposite records side by
 * side, rather than splitting the book into best and worst.
 *
 * The numbers come from `useRecordBook` (`utils/recordBook`); the names,
 * order and formatting from `recordCatalog.js`. This component lays the two
 * out and masks identities, and nothing else.
 */
const RecordBook = ({
  franchises = [],
  user = null,
  isAdmin = false,
  teamOwnerNames = [],
  onViewFranchise = () => {}
}) => {
  const { data: book, isLoading, error } = useRecordBook();
  const [scope, setScope] = useState('career');
  const [yearValue, setYearValue] = useState('all');

  const year = scope === 'season' && yearValue !== 'all' ? Number(yearValue) : null;
  const selectedSeason = year == null ? null : book?.years.find((entry) => entry.year === year);
  const inProgress = Boolean(selectedSeason && !selectedSeason.isCompleted);

  const identity = useMemo(() => {
    const byId = new Map(franchises.map((franchise) => [franchise.id, franchise]));
    const fullData = canViewFullData(user, isAdmin, teamOwnerNames);
    const franchiseName = (id) =>
      getMaskedFranchiseName(byId.get(id) ?? (id ? { id } : null), user, isAdmin, teamOwnerNames);

    return {
      franchiseName,
      teamName: (teamId) => {
        const team = book?.teams?.[teamId];
        if (!team) return null;
        return fullData ? team.name : `Team ${String(team.id).substring(0, 8)}`;
      },
      // Initials come from the owner, so a masked viewer's avatar is keyed on
      // the masked name instead: the colour still tells franchises apart.
      avatar: (id) => {
        const franchise = byId.get(id);
        return fullData && franchise
          ? { franchiseId: id, owner_name: franchise.owner_name }
          : { franchiseId: id, name: franchiseName(id) };
      }
    };
  }, [franchises, user, isAdmin, teamOwnerNames, book]);

  // With a season picked, a card with nothing for that season is left out —
  // an in-progress year has games and streaks but no season totals yet — and
  // so is a league-wide season record, which would be a list of one.
  const sections = useMemo(() => {
    if (!book) return [];
    return SECTIONS
      .map((section) => ({
        ...section,
        records: RECORDS.filter((record) => record.scope === scope && record.section === section.id)
          .filter((record) =>
            year == null ||
            !record.perSeason &&
            rankRows(recordRows(book, record.scope, record.data, { year }), {
              hideZero: hidesZero(record),
              limit: 1
            }).length > 0
          )
      }))
      .filter((section) => section.records.length > 0);
  }, [book, scope, year]);

  const content = () => {
    if (isLoading) return <RecordSkeleton />;

    if (error) {
      return (
        <Card>
          <EmptyState icon={Medal} title="The record book did not load" description={error.message} />
        </Card>
      );
    }

    return (
      <div className="space-y-8">
        {inProgress && (
          <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            {year} is still being played. Season totals join the record book once the season is
            finalized; the games and streaks so far are below.
          </p>
        )}

        {year == null && book?.recentYears?.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
            New record: a #1 set in {[...book.recentYears].sort((a, b) => a - b).join(' or ')}.
          </p>
        )}

        {sections.length === 0 ? (
          <Card>
            <EmptyState
              icon={Medal}
              title="No records yet"
              description="A record appears once a game that sets it has been played."
            />
          </Card>
        ) : (
          sections.map((section) => {
            const Icon = SECTION_ICONS[section.id] ?? Medal;
            const headingId = `records-${scope}-${section.id}`;
            return (
              <section key={section.id} aria-labelledby={headingId}>
                <SectionHeading as="h3" id={headingId} icon={Icon} className="mb-4">
                  {section.label}
                </SectionHeading>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {section.records.map((record) => (
                    <RecordCard
                      // Keyed on the season too, so opening a card for one year
                      // does not leave it open when the picker changes.
                      key={`${record.id}-${year ?? 'all'}`}
                      record={record}
                      book={book}
                      year={year}
                      identity={identity}
                      onViewFranchise={onViewFranchise}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    );
  };

  return (
    <Tabs value={scope} onValueChange={setScope} className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TabsList className="w-full sm:w-auto">
          {SCOPES.map((option) => (
            <TabsTrigger key={option.id} value={option.id}>
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {scope === 'season' && book && (
          <Select value={yearValue} onValueChange={setYearValue}>
            <SelectTrigger className="w-full sm:w-48" aria-label="Season">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All seasons</SelectItem>
              {book.years.map((entry) => (
                <SelectItem key={entry.year} value={String(entry.year)}>
                  {entry.isCompleted ? entry.year : `${entry.year} (in progress)`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {SCOPES.map((option) => (
        <TabsContent key={option.id} value={option.id}>
          {scope === option.id && content()}
        </TabsContent>
      ))}
    </Tabs>
  );
};

export default RecordBook;
