/**
 * Runs of consecutive items that satisfy a predicate.
 *
 * `continues(previous, item)` says whether two neighbouring items are
 * consecutive at all. That is where the league's calendar comes in: a win in
 * the last week of 2021 and a win in week 1 of 2022 are one streak, while a
 * franchise that sat out 2023 has broken its playoff-appearance streak even if
 * it made the playoffs either side of the gap.
 *
 * @param {object[]} items in order
 * @param {(item: object) => boolean} predicate
 * @param {(previous: object, item: object) => boolean} [continues]
 * @returns {{ start: object, end: object, length: number, startIndex: number, endIndex: number }[]}
 */
export function streakRuns(items = [], predicate, continues = () => true) {
  const runs = [];
  let run = null;

  items.forEach((item, index) => {
    if (!predicate(item)) {
      run = null;
      return;
    }

    // `run` is only ever non-null when the previous item satisfied the
    // predicate, so the only question left is whether the two are adjacent.
    if (run && continues(items[index - 1], item)) {
      run.end = item;
      run.endIndex = index;
      run.length += 1;
    } else {
      run = { start: item, end: item, length: 1, startIndex: index, endIndex: index };
      runs.push(run);
    }
  });

  return runs;
}

export default streakRuns;
