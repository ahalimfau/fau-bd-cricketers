// Title cards shared by the Hall of Shame page, the scorecard and the finish
// sheet, so a title renamed in Settings looks the same everywhere.

import { HERO_TITLES, TITLE_RULES, titleName, type Award } from '../engine/awards';
import { useApp } from '../data/hooks';
import { Avatar } from './kit';

export function AwardCard({ a, big }: { a: Award; big?: boolean }) {
  const app = useApp();
  const hero = HERO_TITLES.has(a.key);
  const names = a.playerIds.map(app.name).join(' & ');
  const p = app.byId.get(a.playerIds[0]);
  const title = titleName(a.key, a.label);
  if (big) {
    return (
      <div className="flex flex-col gap-2 rounded-[20px] bg-red p-4 text-white">
        <div className="flex items-center gap-3">
          <Avatar player={p} name={names} size={56} tone="B" ring="ring-2 ring-white bg-white!" />
          <span className="flex min-w-0 flex-col">
            <span className="text-xs font-extrabold tracking-widest text-white/90 uppercase">{title}</span>
            <span className="font-display text-[clamp(22px,7vw,28px)] leading-tight font-extrabold">{names}</span>
          </span>
        </div>
        <span className="text-[15px] font-semibold">{a.stat}</span>
        {a.detail && <span className="text-xs text-white/90">{a.detail}</span>}
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-3 rounded-2xl p-3 ${hero ? 'bg-green-tint' : 'bg-red-tint'}`}>
      {a.playerIds.length === 1 ? (
        <Avatar player={p} name={names} size={48} tone={hero ? 'A' : 'B'} ring="bg-white!" />
      ) : (
        <span className={`flex h-12 w-12 flex-none items-center justify-center rounded-full bg-white font-display text-lg font-extrabold ${hero ? 'text-green-dark' : 'text-red-dark'}`}>
          ×{a.playerIds.length}
        </span>
      )}
      <span className="flex min-w-0 flex-col">
        <span className={`text-[11px] font-extrabold tracking-widest uppercase ${hero ? 'text-green-dark' : 'text-red-dark'}`}>{title}</span>
        <span className="font-display text-lg leading-tight font-extrabold">{names}</span>
        <span className="text-sm">{a.stat}</span>
        <span className="text-xs text-muted">
          {TITLE_RULES[a.key]}
          {a.key === 'kipta' && a.detail ? ` (${a.detail.toLowerCase()})` : ''}
        </span>
      </span>
    </div>
  );
}

/** Heroes, then Shahin of the day (big), then the rest of the Hall of Shame. */
export function AwardList({ awards }: { awards: Award[] }) {
  const heroes = awards.filter((a) => HERO_TITLES.has(a.key));
  const shahin = awards.find((a) => a.key === 'shahin');
  const rest = awards.filter((a) => !HERO_TITLES.has(a.key) && a.key !== 'shahin');
  if (awards.length === 0) return <p className="text-muted">No titles yet. Play some cricket.</p>;
  return (
    <div className="flex flex-col gap-5">
      {heroes.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-xs font-extrabold tracking-widest text-green-dark">THE HEROES</h2>
          {heroes.map((a) => (
            <AwardCard key={a.key} a={a} />
          ))}
        </section>
      )}
      {(shahin || rest.length > 0) && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-xs font-extrabold tracking-widest text-red-dark">THE HALL OF SHAME</h2>
          {shahin && <AwardCard a={shahin} big />}
          {rest.map((a) => (
            <AwardCard key={a.key} a={a} />
          ))}
        </section>
      )}
    </div>
  );
}

/** One line per title, e.g. "Ashraful of the day: Rakib (2 dropped catches)". */
export function awardLine(a: Award, name: (id: string) => string): string {
  return `${titleName(a.key, a.label)}: ${a.playerIds.map(name).join(' & ')} (${a.stat})`;
}
