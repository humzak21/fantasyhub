import { useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { buildAdminTakePatch, draftFromTake } from './adminEdit.js';
import {
  MAX_BODY,
  MAX_WAGER,
  STATUS_LABEL,
  milestoneKey,
  milestoneLabel,
  milestoneOptions
} from './milestones.js';

const FieldLabel = ({ htmlFor, children }) => (
  <label
    htmlFor={htmlFor}
    className="mb-1 block text-[11px] uppercase tracking-[0.06em] text-muted-foreground"
  >
    {children}
  </label>
);

/**
 * Every facet of a take, editable by the admin, in place in the detail sheet.
 *
 * Nothing here is a privilege check. The `takes admin write` policy is what
 * lets this save land, and the log triggers are what sign it "Admin" — the
 * component only decides which columns go up, through `buildAdminTakePatch`,
 * so an untouched grade is never resent and re-dated.
 *
 * The draft is seeded once, at mount. The sheet mounts this fresh for each
 * editing session, so there is no effect re-seeding it from props — which
 * would also throw away the admin's typing whenever the board refetched.
 */
export function AdminTakeEditor({
  take,
  seasonConfig,
  members = [],
  nameOf,
  onSave,
  onCancel,
  saving
}) {
  const [draft, setDraft] = useState(() => draftFromTake(take));
  const [error, setError] = useState(null);

  const set = (field) => (value) => setDraft((current) => ({ ...current, [field]: value }));

  const patch = buildAdminTakePatch(take, draft);
  const dirty = Object.keys(patch).length > 0;

  // The take's own milestone and author are always selectable, even when the
  // calendar or the member list does not cover them — a Select whose value has
  // no item renders blank, which reads as "unset".
  const milestones = useMemo(() => {
    const options = milestoneOptions(seasonConfig);
    const current = milestoneKey(take);
    return options.some((option) => option.value === current)
      ? options
      : [{ value: current, label: milestoneLabel(take, seasonConfig) }, ...options];
  }, [seasonConfig, take]);

  const authors = useMemo(() => {
    const options = members.map((member) => ({ value: member.id, label: member.displayName }));
    return options.some((option) => option.value === take.userId)
      ? options
      : [{ value: take.userId, label: nameOf?.(take.userId) ?? 'Current author' }, ...options];
  }, [members, take.userId, nameOf]);

  // Reassigning a take to somebody who has faded it puts them on both sides of
  // their own bet. The database allows it — the admin may be untangling
  // exactly that — so this warns rather than refuses.
  const authorHasFaded =
    draft.userId !== take.userId &&
    (take.takeParticipants || []).some((participant) => participant.userId === draft.userId);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!draft.body.trim()) {
      setError('A take needs something to say.');
      return;
    }
    if (!dirty) return;

    setError(null);
    try {
      await onSave(patch);
    } catch (saveError) {
      setError(saveError?.message ?? 'Could not save that take.');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]"
    >
      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-primary" aria-hidden="true" />
          Editing as admin
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Every change you save is recorded in the activity log as Admin.
        </p>
      </div>

      <div>
        <FieldLabel htmlFor="admin-take-author">Posted by</FieldLabel>
        <Select value={draft.userId} onValueChange={set('userId')}>
          <SelectTrigger id="admin-take-author">
            <SelectValue placeholder="Who posted this take" />
          </SelectTrigger>
          <SelectContent>
            {authors.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {authorHasFaded && (
          <p className="mt-1 text-xs text-warning">
            They have said Hell Nah to this take, so they would be betting against themselves.
          </p>
        )}
      </div>

      <div>
        <FieldLabel htmlFor="admin-take-body">Wording</FieldLabel>
        <Textarea
          id="admin-take-body"
          value={draft.body}
          onChange={(event) => set('body')(event.target.value)}
          maxLength={MAX_BODY}
          rows={4}
          required
        />
        <p className="mt-1 text-right text-xs tabular-nums text-muted-foreground">
          {MAX_BODY - draft.body.length} left
        </p>
      </div>

      <div>
        <FieldLabel htmlFor="admin-take-wager">Stake</FieldLabel>
        <Input
          id="admin-take-wager"
          value={draft.wager}
          onChange={(event) => set('wager')(event.target.value)}
          maxLength={MAX_WAGER}
          placeholder="No stake"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Clearing the stake leaves any existing Hell Nahs in place.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="admin-take-milestone">Resolves</FieldLabel>
          <Select value={draft.milestone} onValueChange={set('milestone')}>
            <SelectTrigger id="admin-take-milestone">
              <SelectValue placeholder="When does this settle?" />
            </SelectTrigger>
            <SelectContent>
              {milestones.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <FieldLabel htmlFor="admin-take-status">Status</FieldLabel>
          <Select value={draft.status} onValueChange={set('status')}>
            <SelectTrigger id="admin-take-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}

export default AdminTakeEditor;
