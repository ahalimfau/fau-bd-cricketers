// Hall of Shame: titles for one match, and title counts plus leaderboards for
// the season. Season numbers are recomputed from the ball-by-ball lists of
// finished matches (never from a stored summary), so they can't be faked.

import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { replay } from '../engine/replay';
import { HERO_TITLES, computeAwards, fmtEcon, playerMatchStats, seasonTitleCounts, sumStats, type AwardsConfig } from '../engine/awards';
import { useApp, useMatch, useMatches } from '../data/hooks';
import type { MatchDoc } from '../data/validate';
import { Header, Loading, Page, fmtDate, pad } from '../ui/kit';
import { AwardList } from '../ui/AwardCards';
import { ShareButton } from '../ui/ShareButton';
import { matchTitle } from '../ui/cricket';

function MatchAwards({ m, cfg }: { m: MatchDoc; cfg: AwardsConfig }) {
  const state = useMemo(() => replay(m.meta, m.clean.events), [m]);
  const awards = useMemo(() => computeAwards(state, cfg), [state, cfg]);
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">
        {matchTitle(m.meta)} · {fmtDate(m.createdAt)} · {state.result?.text ?? 'in progress, titles so far'}
      </p>
      <AwardList awards={awards} />
    </div>
  );
}

function Season({ matches, cfg }: { matches: MatchDoc[]; cfg: AwardsConfig }) {
  const app = useApp();
  const data = useMemo(() => {
    const states = matches.map((m) => replay(m.meta, m.clean.events));
    const titles = seasonTitleCounts(states.map((s) => computeAwards(s, cfg)));
    const totals = Object.values(sumStats(states.map(playerMatchStats)));
    return { titles, totals };
  }, [matches, cfg]);

  if (matches.length === 0) return <p className="text-muted">No finished matches yet. Titles count once a match is finished.</p>;

  const top = <K extends keyof (typeof data.totals)[number]>(k: K, n = 5) =>
    [...data.totals].filter((t) => (t[k] as number) > 0).sort((a, b) => (b[k] as number) - (a[k] as number)).slice(0, n);
  const boards: { title: string; rows: { id: string; v: string }[]; shame?: boolean }[] = [
    { title: 'Most runs', rows: top('batRuns').map((t) => ({ id: t.id, v: `${t.batRuns}` })) },
    { title: 'Most wickets', rows: top('wickets').map((t) => ({ id: t.id, v: `${t.wickets}` })) },
    {
      title: 'Best economy (min 4 overs)',
      rows: [...data.totals]
        .filter((t) => t.bowlBalls >= 24)
        .sort((a, b) => a.bowlRuns / a.bowlBalls - b.bowlRuns / b.bowlBalls)
        .slice(0, 5)
        .map((t) => ({ id: t.id, v: fmtEcon(t.bowlRuns, t.bowlBalls) })),
    },
    { title: 'Most dropped catches', rows: top('drops').map((t) => ({ id: t.id, v: `${t.drops}` })), shame: true },
    { title: 'Most wides', rows: top('wides').map((t) => ({ id: t.id, v: `${t.wides}` })), shame: true },
    { title: 'Most ducks', rows: top('ducks').map((t) => ({ id: t.id, v: `${t.ducks}` })), shame: true },
  ];

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">{matches.length} finished {matches.length === 1 ? 'match' : 'matches'}.</p>
      <section className="flex flex-col gap-1.5">
        <h2 className="text-xs font-extrabold tracking-widest text-muted">SEASON TITLE COUNT</h2>
        {data.titles.slice(0, 15).map((t) => {
          const hero = HERO_TITLES.has(t.key);
          return (
            <Link key={`${t.key}-${t.playerId}`} to={`/players/${t.playerId}`} className="flex min-h-14 items-center justify-between gap-2 border-b border-line py-1">
              <span className="flex min-w-0 flex-col">
                <span className={`text-[11px] font-extrabold tracking-widest uppercase ${hero ? 'text-green-dark' : 'text-red-dark'}`}>{cfg.titles[t.key].label}</span>
                <span className="truncate font-display text-base font-extrabold">{app.name(t.playerId)}</span>
              </span>
              <span className="font-display text-xl font-extrabold">×{t.count}</span>
            </Link>
          );
        })}
      </section>
      {boards.map((b) =>
        b.rows.length === 0 ? null : (
          <section key={b.title} className="flex flex-col gap-1">
            <h2 className={`text-xs font-extrabold tracking-widest ${b.shame ? 'text-red-dark' : 'text-green-dark'}`}>{b.title.toUpperCase()}</h2>
            {b.rows.map((r, i) => (
              <Link key={r.id} to={`/players/${r.id}`} className="flex min-h-11 items-center gap-2.5 border-b border-line">
                <span className="w-5 text-sm font-bold text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{app.name(r.id)}</span>
                <span className="font-display text-lg font-extrabold">{r.v}</span>
              </Link>
            ))}
          </section>
        ),
      )}
    </div>
  );
}

/** /shame (season, plus the latest match) and /match/:id/awards (that match). */
export function Awards() {
  const { id } = useParams();
  const app = useApp();
  const list = useMatches(200);
  const one = useMatch(id);
  const done = list.matches.filter((m) => m.status === 'done');
  const matchDoc = id ? one.match : done[0];
  const [tab, setTab] = useState<'match' | 'season'>(id ? 'match' : 'season');
  const card = useRef<HTMLDivElement>(null);

  const loading = id ? !one.ready : !list.ready;
  return (
    <Page nav={!id}>
      <Header
        title="Hall of Shame"
        back={id ? `/match/${id}` : undefined}
        right={<ShareButton target={card} fileName="fau-bd-hall-of-shame" text="FAU BD Cricketers Hall of Shame" label="Share" />}
      />
      <div className={`grid grid-cols-2 gap-1 ${pad} py-2`}>
        {(['match', 'season'] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-11 rounded-xl text-sm font-extrabold ${tab === t ? 'bg-green text-white' : 'bg-surface text-ink'}`}
          >
            {t === 'match' ? (id ? 'This match' : 'Latest match') : 'Whole season'}
          </button>
        ))}
      </div>
      <div ref={card} className={`bg-white ${pad} pt-2 pb-6`}>
        <p className="pb-3 font-display text-base font-extrabold">
          <span className="text-green">FAU BD</span> Cricketers
        </p>
        {loading ? (
          <Loading />
        ) : tab === 'match' ? (
          matchDoc ? <MatchAwards m={matchDoc} cfg={app.cfg} /> : <p className="text-muted">No finished match yet.</p>
        ) : (
          <Season matches={done} cfg={app.cfg} />
        )}
      </div>
      <div className="flex-1" />
    </Page>
  );
}
