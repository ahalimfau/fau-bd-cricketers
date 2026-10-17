import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TITLE_ORDER, TITLE_RULES, HERO_TITLES, type AwardsConfig } from '../engine/awards';
import { canManage } from '../config/roles';
import { signOut, useApp } from '../data/hooks';
import { saveConfig, writeErrorText } from '../data/repo';
import { cleanText } from '../data/validate';
import { Banner, Header, Loading, Page, btn, pad } from '../ui/kit';

const H2 = 'text-xs font-extrabold tracking-widest text-muted';
const NUM = 'h-12 w-full rounded-xl border-2 border-line bg-white px-3 text-base font-bold focus:border-green focus:outline-none';

export function Settings() {
  const app = useApp();
  const [cfg, setCfg] = useState<AwardsConfig>(app.cfg);
  const [overs, setOvers] = useState(app.defaultOvers);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setCfg(structuredClone(app.cfg)), [app.cfg]);
  useEffect(() => setOvers(app.defaultOvers), [app.defaultOvers]);

  if (!app.auth.ready) return <Page><Loading /></Page>;
  if (!canManage(app.auth.role)) {
    return (
      <Page>
        <Header title="Settings" back="/" />
        <div className={`${pad} flex flex-col gap-4 py-6`}>
          <p>Only the admin can change settings.</p>
          <Link to="/login" className={btn.outline}>Sign in</Link>
        </div>
      </Page>
    );
  }

  const num = (v: string, min: number, max: number, fallback: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const labelsOk = TITLE_ORDER.every((k) => cleanText(cfg.titles[k].label, 30));

  const save = () => {
    const next = structuredClone(cfg);
    for (const k of TITLE_ORDER) next.titles[k].label = cleanText(next.titles[k].label, 30) ?? app.cfg.titles[k].label;
    saveConfig(next, overs)
      .then(() => setMsg({ ok: true, text: 'Saved.' }))
      .catch((e) => setMsg({ ok: false, text: writeErrorText(e) }));
    setMsg({ ok: true, text: 'Saving…' });
  };

  return (
    <Page>
      <Header title="Settings" sub="ADMIN ONLY" back="/" />
      <div className={`flex flex-col gap-6 ${pad} pt-2 pb-8`}>
        <section className="flex flex-col gap-2">
          <h2 className={H2}>ACCOUNTS</h2>
          <div className="flex items-center gap-3 rounded-2xl bg-surface px-3.5 py-3">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-bold">Admin · you</span>
              <span className="truncate text-sm text-muted">{app.auth.email}</span>
            </span>
            <button type="button" className={btn.ghost} onClick={() => signOut()}>
              Sign out
            </button>
          </div>
          <div className="flex flex-col gap-1 rounded-2xl bg-surface px-3.5 py-3 text-sm">
            <span className="font-bold">Shared scorer login</span>
            <span className="text-muted">
              Anyone with this login can create matches and score. They can't edit players, titles or settings, and finished matches are locked for them. To cut off
              access, change its password (or disable it) in the Firebase console: Authentication → Users.
            </span>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className={H2}>TITLE NAMES</h2>
          <p className="text-sm text-muted">Shown in front of the player's name. Switch any off.</p>
          {TITLE_ORDER.map((k) => {
            const t = cfg.titles[k];
            return (
              <div key={k} className="flex items-end gap-3">
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-semibold text-muted">
                  {TITLE_RULES[k]}
                  <input
                    value={t.label}
                    maxLength={30}
                    onChange={(e) => setCfg({ ...cfg, titles: { ...cfg.titles, [k]: { ...t, label: e.target.value } } })}
                    className={`h-12 w-full rounded-xl border-2 border-line bg-white px-3 text-base font-extrabold focus:border-green focus:outline-none ${HERO_TITLES.has(k) ? 'text-green-dark' : 'text-red-dark'}`}
                  />
                </label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={t.enabled}
                  aria-label={`${t.label} ${t.enabled ? 'on' : 'off'}`}
                  onClick={() => setCfg({ ...cfg, titles: { ...cfg.titles, [k]: { ...t, enabled: !t.enabled } } })}
                  className={`relative mb-1 h-8 w-14 flex-none rounded-full transition-colors ${t.enabled ? 'bg-green' : 'bg-line'}`}
                >
                  <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${t.enabled ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
            );
          })}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className={H2}>SHAHIN FORMULA</h2>
          <p className="text-sm text-muted">Runs conceded above the match economy, plus points per fielding mistake. Must have bowled at least 1 over.</p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['drop', 'Per drop'],
                ['boundaryMisfield', 'Misfield 4/6'],
                ['otherOops', 'Other oops'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex flex-col gap-1 text-xs font-semibold text-muted">
                {label}
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={50}
                  value={cfg.shahinWeights[k]}
                  onChange={(e) => setCfg({ ...cfg, shahinWeights: { ...cfg.shahinWeights, [k]: num(e.target.value, 0, 50, cfg.shahinWeights[k]) } })}
                  className={NUM}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className={H2}>MATCH DEFAULTS</h2>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              Default overs
              <input type="number" inputMode="numeric" min={1} max={50} value={overs} onChange={(e) => setOvers(num(e.target.value, 1, 50, overs))} className={NUM} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
              Kipta min. balls
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={300}
                value={cfg.kiptaMinBalls}
                onChange={(e) => setCfg({ ...cfg, kiptaMinBalls: num(e.target.value, 0, 300, cfg.kiptaMinBalls) })}
                className={NUM}
              />
            </label>
          </div>
        </section>

        {!labelsOk && <Banner tone="red">Every title needs a name (switch it off instead of clearing it).</Banner>}
        {msg && <Banner tone={msg.ok ? 'green' : 'red'}>{msg.text}</Banner>}
        <button type="button" className={btn.primary} disabled={!labelsOk} onClick={save}>
          Save settings
        </button>
        <Link to="/check" className="text-center text-sm font-bold text-green-dark underline">
          Run the setup and security check
        </Link>
      </div>
    </Page>
  );
}
