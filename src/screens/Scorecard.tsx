import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { replay, teamOf } from '../engine/replay';
import { useApp, useMatch } from '../data/hooks';
import { Header, Loading, Page, btn, pad } from '../ui/kit';
import { ShareButton } from '../ui/ShareButton';
import { AwardList } from '../ui/AwardCards';
import { computeAwards } from '../engine/awards';
import { dismissalText, matchTitle, rate, scoreText, sr, teamName } from '../ui/cricket';

const TH = 'text-xs font-bold text-muted';

export function Scorecard() {
  const { id } = useParams();
  const app = useApp();
  const live = useMatch(id);
  const match = live.match;
  const state = useMemo(() => (match ? replay(match.meta, match.clean.events) : null), [match]);
  // Uses the admin's current title names and formula weights from Settings.
  const awards = useMemo(() => (state ? computeAwards(state, app.cfg) : []), [state, app.cfg]);
  const [tab, setTab] = useState<0 | 1 | null>(null);
  const card = useRef<HTMLDivElement>(null);

  if (!live.ready) return <Page><Loading /></Page>;
  if (!match || !state) {
    return (
      <Page>
        <Header title="Scorecard" back="/" />
        <p className={`${pad} py-6`}>{live.error ?? 'Match not found.'}</p>
      </Page>
    );
  }
  const meta = match.meta;
  const shown = tab ?? (state.current - 1);
  const inn = state.innings[shown];
  const bowlTeam = teamOf(meta, inn.bowlingTeam);
  // The captain is stored as the first player of each team.
  const batCaptain = teamOf(meta, inn.battingTeam).playerIds[0];
  const didNotBat = teamOf(meta, inn.battingTeam).playerIds.filter((pid) => !inn.batters.some((b) => b.id === pid));
  const fielders = bowlTeam.playerIds
    .map((pid) => state.fielding[pid])
    .filter((f) => f && f.drops + f.misfield4 + f.misfield6 + f.missedRunOuts + f.overthrows > 0);
  const ex = inn.extras;

  return (
    <Page>
      <Header title="Scorecard" sub={matchTitle(meta)} back={`/match/${match.id}`} right={<ShareButton target={card} fileName="fau-bd-scorecard" text={`${matchTitle(meta)} scorecard`} />} />
      <div className={`grid grid-cols-2 gap-1 ${pad} py-2`}>
        {state.innings.map((i, k) => (
          <button
            key={k}
            type="button"
            aria-pressed={shown === k}
            disabled={!i.started}
            onClick={() => setTab(k as 0 | 1)}
            className={`min-h-11 truncate rounded-xl px-2 text-sm font-extrabold disabled:opacity-40 ${shown === k ? 'bg-green text-white' : 'bg-surface text-ink'}`}
          >
            {teamName(meta, i.battingTeam)} {i.started ? `${scoreText(i)} (${i.overs})` : ''}
          </button>
        ))}
      </div>

      <div ref={card} className="flex flex-col gap-5 bg-white pt-1 pb-6">
        <section className={`flex flex-col ${pad}`}>
          {state.complete && <p className="pb-2 font-bold text-green-dark">{state.result?.text}</p>}
          <div className="grid grid-cols-[minmax(0,1fr)_32px_32px_28px_28px_44px] gap-1 border-b border-line pb-1.5">
            <span className={TH}>Batter</span>
            <span className={TH + ' text-right'}>R</span>
            <span className={TH + ' text-right'}>B</span>
            <span className={TH + ' text-right'}>4s</span>
            <span className={TH + ' text-right'}>6s</span>
            <span className={TH + ' text-right'}>SR</span>
          </div>
          {inn.batters.map((b) => (
            <div key={b.id} className="grid grid-cols-[minmax(0,1fr)_32px_32px_28px_28px_44px] items-center gap-1 border-b border-line py-1.5">
              <span className="flex min-w-0 flex-col">
                <span className={`truncate ${b.out ? 'font-semibold' : 'font-extrabold'}`}>
                  {app.name(b.id)}
                  {b.id === batCaptain ? ' (c)' : ''}
                  {!b.out && !b.retired && (b.id === inn.strikerId || b.id === inn.nonStrikerId) && !inn.complete ? '*' : ''}
                </span>
                <span className="truncate text-xs text-muted">{dismissalText(b, app.name)}</span>
              </span>
              <span className="text-right font-display font-extrabold">{b.runs}</span>
              <span className="text-right text-sm">{b.balls}</span>
              <span className="text-right text-sm">{b.fours}</span>
              <span className="text-right text-sm">{b.sixes}</span>
              <span className="text-right text-xs text-muted">{sr(b.runs, b.balls)}</span>
            </div>
          ))}
          <div className="flex justify-between border-b border-line py-2 text-sm">
            <span>
              Extras <span className="text-muted">(wd {ex.wd}, nb {ex.nb}, b {ex.b}, lb {ex.lb})</span>
            </span>
            <strong>{ex.total}</strong>
          </div>
          <div className="flex justify-between py-2">
            <strong>Total</strong>
            <strong className="font-display">
              {scoreText(inn)} ({inn.overs} ov) · RR {rate(inn.runs, inn.legalBalls)}
            </strong>
          </div>
          {didNotBat.length > 0 && inn.started && (
            <p className="text-xs text-muted">
              {inn.complete ? 'Did not bat' : 'Yet to bat'}: {didNotBat.map(app.name).join(', ')}
            </p>
          )}
          {inn.fow.length > 0 && (
            <p className="pt-1.5 text-xs leading-relaxed text-muted">
              Fall of wickets: {inn.fow.map((f) => `${f.wicketNo}-${f.runs} (${app.name(f.playerId)}, ${f.overs})`).join(' · ')}
            </p>
          )}
        </section>

        <section className={`flex flex-col ${pad}`}>
          <h2 className="pb-1.5 font-display text-lg font-extrabold">{bowlTeam.name} bowling</h2>
          <div className="grid grid-cols-[minmax(0,1fr)_30px_22px_28px_22px_24px_24px_40px] gap-1 border-b border-line pb-1.5">
            {['Bowler', 'O', 'M', 'R', 'W', 'Wd', 'Nb', 'Econ'].map((h, i) => (
              <span key={h} className={TH + (i ? ' text-right' : '')}>
                {h}
              </span>
            ))}
          </div>
          {inn.bowlers.filter((b) => b.balls > 0 || b.runs > 0).map((b) => (
            <div key={b.id} className="grid grid-cols-[minmax(0,1fr)_30px_22px_28px_22px_24px_24px_40px] items-center gap-1 border-b border-line py-2 text-sm">
              <span className="truncate font-bold">
                {app.name(b.id)}
                {b.id === bowlTeam.playerIds[0] ? ' (c)' : ''}
              </span>
              <span className="text-right">{`${Math.floor(b.balls / 6)}.${b.balls % 6}`}</span>
              <span className="text-right">{b.maidens}</span>
              <span className="text-right font-extrabold">{b.runs}</span>
              <span className="text-right font-extrabold">{b.wickets}</span>
              <span className={`text-right ${b.wides ? 'font-bold text-red-dark' : ''}`}>{b.wides}</span>
              <span className={`text-right ${b.noBalls ? 'font-bold text-red-dark' : ''}`}>{b.noBalls}</span>
              <span className="text-right text-xs text-muted">{rate(b.runs, b.balls)}</span>
            </div>
          ))}
        </section>

        {inn.overList.some((o) => o.balls.length) && (
          <section className={`flex flex-col ${pad}`}>
            <h2 className="font-display text-lg font-extrabold">Over by over leakage</h2>
            <p className="pb-1.5 text-xs text-muted">Runs charged to the bowler each over. Red means 12 or more.</p>
            <div className="grid grid-cols-[34px_minmax(0,1fr)_50px_28px_28px_24px] gap-1 border-b border-line pb-1.5">
              {['Over', 'Bowler', 'Runs', 'Wd', 'Nb', 'W'].map((h, i) => (
                <span key={h} className={TH + (i > 1 ? ' text-right' : '')}>
                  {h}
                </span>
              ))}
            </div>
            {inn.overList
              .filter((o) => o.balls.length)
              .map((o) => {
                const heat = o.bowlerRuns >= 12 ? 'bg-red text-white' : o.bowlerRuns >= 8 ? 'bg-red-tint text-red-dark' : 'bg-green-tint text-green-dark';
                const partial = o.legalBalls < 6;
                return (
                  <div key={o.number} className="grid grid-cols-[34px_minmax(0,1fr)_50px_28px_28px_24px] items-center gap-1 border-b border-line py-1.5 text-sm">
                    <span className="font-bold">
                      {o.number}
                      {partial ? '*' : ''}
                    </span>
                    <span className="truncate">{app.name(o.bowlerId)}</span>
                    <span className="text-right">
                      <span className={`inline-block min-w-8 rounded-lg px-1.5 py-0.5 text-center font-extrabold ${heat}`}>{o.bowlerRuns}</span>
                    </span>
                    <span className="text-right">{o.wides || ''}</span>
                    <span className="text-right">{o.noBalls || ''}</span>
                    <span className="text-right font-bold">{o.wickets || ''}</span>
                  </div>
                );
              })}
          </section>
        )}

        <section className={`flex flex-col ${pad}`}>
          <h2 className="pb-1.5 font-display text-lg font-extrabold">{bowlTeam.name} fielding blunders</h2>
          {fielders.length === 0 ? (
            <p className="text-sm text-muted">Clean so far. Suspicious.</p>
          ) : (
            <>
              <div className="grid grid-cols-[minmax(0,1fr)_44px_64px_52px_44px] gap-1 border-b border-line pb-1.5">
                {['Fielder', 'Drops', 'Misfld 4/6', 'Run-out', 'Other'].map((h, i) => (
                  <span key={h} className={TH + (i ? ' text-right' : '')}>
                    {h}
                  </span>
                ))}
              </div>
              {fielders.map((f) => (
                <div key={f.id} className="grid grid-cols-[minmax(0,1fr)_44px_64px_52px_44px] items-center gap-1 border-b border-line py-2 text-sm">
                  <span className="truncate font-bold">{app.name(f.id)}</span>
                  <span className={`text-right ${f.drops ? 'font-extrabold text-red-dark' : ''}`}>{f.drops}</span>
                  <span className="text-right">
                    {f.misfield4} / {f.misfield6}
                  </span>
                  <span className="text-right">{f.missedRunOuts}</span>
                  <span className="text-right">{f.overthrows}</span>
                </div>
              ))}
            </>
          )}
        </section>

        <section className={`flex flex-col gap-2 ${pad}`}>
          <h2 className="font-display text-lg font-extrabold">{state.complete ? 'Titles' : 'Titles so far'}</h2>
          <AwardList awards={awards} />
        </section>
      </div>
      <div className={`${pad} pb-[max(20px,env(safe-area-inset-bottom))]`}>
        <Link to={`/match/${match.id}/awards`} className={btn.outline}>
          See the titles
        </Link>
      </div>
    </Page>
  );
}
