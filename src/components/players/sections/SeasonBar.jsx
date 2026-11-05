import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select.jsx';
import { ALL_SEASONS, seasonCaption } from './sectionFormat.js';

/**
 * The season picker and its one-line caption. Owns nothing else: the body
 * holds the choice and hands it to every section.
 */
export default function SeasonBar({ profile, value, season, onChange }) {
  const seasons = profile.seasons ?? [];
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <Select value={String(value)} onValueChange={onChange} disabled={seasons.length === 0}>
        <SelectTrigger aria-label="Season" className="h-9 w-auto min-w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_SEASONS}>All seasons</SelectItem>
          {seasons.map((s) => (
            <SelectItem key={s.seasonId} value={String(s.seasonId)}>
              {s.year}{s.isCurrent ? ' (this season)' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="min-w-0 text-[13px] text-muted-foreground tabular">{seasonCaption(profile, season)}</p>
    </div>
  );
}
