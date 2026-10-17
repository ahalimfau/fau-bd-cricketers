// Season stats table for everyone (no login): batting, bowling and fielding,
// rebuilt from every finished match.

import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { battingAverage, bestText, careers, economyText, highestText, oversText, strikeRate, type Career } from '../engine/career';
import { useApp, usePlayedMatches } from '../data/hooks';
import { Choice, Header, Loading, Page, pad } from '../ui/kit';
import { ShareButton } from '../ui/ShareButton';

type Tab = 'bat' | 'bowl' | 'field';

interface Col {
  h: string;
  w: string;
  v: (c: Career) => string | number;
  strong?: boolean;
  red?: boolean;
}

const COLS: Record<Tab, Col[]> = {
  bat: [
    { h: 'M', w: '26px', v: (c) => c.matches },
    { h: 'Runs', w: '38px', v: (c) => c.runs, strong: true },
    { h: 'HS', w: '34px', v: highestText },
    { h: 'Avg', w: '38px', v: battingAverage },
    { h: 'SR', w: '34px', v: strikeRate },
  ],
  bowl: [
    { h: 'O', w: '36px', v: (c) => oversText(c.bowlBalls) },
    { h: 'W', w: '26px', v: (c) => c.wickets, strong: true },
    { h: 'Best', w: '38px', v: bestText },
    { h: 'Econ', w: '40px', v: economyText },
    { h: 'Wd', w: '28px', v: (c) => c.wides, red: true },
  ],
  field: [
    { h: 'Ct', w: '28px', v: (c) => c.catches, strong: true },
    { h: 'RO', w: '28px', v: (c) => c.runOuts + c.stumpings },
    { h: 'Drops', w: '44px', v: (c) => c.drops, red: true },
    { h: 'Leaks', w: '44px', v: (c) => c.boundariesLeaked, red: true },
  ],
};

const SORT: Record<Tab, (a: Career, b: Career) => number> = {
  bat: (a, b) => b.runs - a.runs || b.highest - a.highest,
  bowl: (a, b) =>
    b.wickets - a.wickets || (a.bowlBalls && b.bowlBalls ? a.bowlRuns / a.bowlBalls - b.bowlRuns / b.bowlBalls : b.bowlBalls - a.bowlBalls),
  field: (a, b) => b.catches - a.catches || b.drops - a.drops,
};

const KEEP: Record<Tab, (c: Career) => boolean> = {
  bat: (c) => c.innings > 0,
  bowl: (c) => c.bowlBalls > 0,
  field: (c) => c.catches + c.runOuts + c.stumpings + c.drops + c.boundariesLeaked + c.missedRunOuts + c.overthrows > 0,
};

export function Stats() {
  const app = useApp();
  const { list, ready, error } = usePlayedMatches();
  const [tab, setTab] = useState<Tab>('bat');
  const card = useRef<HTMLDivElement>(null);
  const all = useMemo(() => [...careers(list).values()], [list]);
  const rows = all.filter(KEEP[tab]).sort(SORT[tab]);
  const cols = COLS[tab];
  const grid = { gridTemplateColumns: `22px minmax(0,1fr) ${cols.map((c) => c.w).join(' ')}` };

  return (
    <Page nav>
      <Header
        title="Season stats"
        sub={ready ? `${list.length} finished ${list.length === 1 ? 'match' : 'matches'} · tap a player for more` : undefined}
        right={<ShareButton target={card} fileName="fau-bd-season-stats" text="FAU BD Cricketers season stats" />}
      />
      <div className={`${pad} py-2`}>
        <Choice
          value={tab}
          onChange={setTab}
          options={[
            { value: 'bat', label: 'Batting' },
            { value: 'bowl', label: 'Bowling' },
            { value: 'field', label: 'Fielding' },
          ]}
        />
      </div>
      <div ref={card} className={`flex-1 bg-white ${pad} pt-1 pb-6`}>
        {!ready ? (
          <Loading />
        ) : error ? (
          <p className="text-sm text-red-dark">Couldn't load matches ({error}).</p>
        ) : rows.length === 0 ? (
          <p className="text-muted">No finished matches yet. Stats count once a match is finished.</p>
        ) : (
          <div className="flex flex-col">
            <div className="grid items-end gap-1 border-b border-line pb-1.5 text-xs font-bold text-muted" style={grid}>
              <span>#</span>
              <span>Player</span>
              {cols.map((c) => (
                <span key={c.h} className="text-right">
                  {c.h}
                </span>
              ))}
            </div>
            {rows.map((c, i) => (
              <Link key={c.id} to={`/players/${c.id}`} className="grid min-h-11 items-center gap-1 border-b border-line text-sm" style={grid}>
                <span className="text-xs font-bold text-muted">{i + 1}</span>
                <span className="truncate font-bold">{app.name(c.id)}</span>
                {cols.map((col) => {
                  const v = col.v(c);
                  return (
                    <span key={col.h} className={`text-right ${col.strong ? 'font-display font-extrabold' : ''} ${col.red && Number(v) > 0 ? 'font-bold text-red-dark' : ''}`}>
                      {v}
                    </span>
                  );
                })}
              </Link>
            ))}
            <p className="pt-2 text-xs text-muted">
              {tab === 'bat' && 'HS = highest score (* = not out). Avg = runs per dismissal. SR = runs per 100 balls.'}
              {tab === 'bowl' && 'Best = most wickets in a match (then fewest runs). Econ = runs per over.'}
              {tab === 'field' && 'RO = run-outs and stumpings. Leaks = misfields that went for 4 or 6.'}
            </p>
          </div>
        )}
      </div>
    </Page>
  );
}
