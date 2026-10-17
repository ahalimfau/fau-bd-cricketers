import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DEFAULT_AWARDS_CONFIG, HERO_TITLES, TITLE_ORDER, TITLE_RULES, titleName, type AwardsConfig, type ShahinWeights } from '../engine/awards';
import { canManage } from '../config/roles';
import { signOut, useApp } from '../data/hooks';
import { saveConfig, writeErrorText } from '../data/repo';
import { MAX_WEIGHT, cleanText } from '../data/validate';
import { Banner, Header, Loading, NumberField, Page, btn, pad } from '../ui/kit';

const H2 = 'text-xs font-extrabold tracking-widest text-muted';

const WEIGHTS: { key: keyof ShahinWeights; label: string }[] = [
  { key: 'drop', label: 'Per dropped catch' },
  { key: 'boundaryMisfield', label: 'Per boundary leaked' },
  { key: 'otherOops', label: 'Per other oops' },
  { key: 'wicket', label: 'Taken off per wicket' },
  { key: 'batPar', label: 'Batting par (runs)' },
];

export function Settings() {
  const app = useApp();
  const [cfg, setCfg] = useState<AwardsConfig>(() => structuredClone(app.cfg));
  const [overs, setOvers] = useState(app.defaultOvers);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Follow the saved settings until the admin starts editing, so a background
  // update never wipes what's being typed.
  useEffect(() => {
    if (!dirty) setCfg(structuredClone(app.cfg));
  }, [app.cfg, dirty]);
  useEffect(() => {
    if (!dirty) setOvers(app.defaultOvers);
  }, [app.defaultOvers, dirty]);

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

  const edit = (next: AwardsConfig) => {
    setCfg(next);
    setDirty(true);
    setMsg(null);
  };
  const labelsOk = TITLE_ORDER.every((k) => cleanText(cfg.titles[k].label, 30));
  const renamed = TITLE_ORDER.some((k) => cfg.titles[k].label !== DEFAULT_AWARDS_CONFIG.titles[k].label);

  const save = () => {
    const next = structuredClone(cfg);
    for (const k of TITLE_ORDER) next.titles[k].label = cleanText(next.titles[k].label, 30) ?? app.cfg.titles[k].label;
    setMsg({ ok: true, text: 'Saving…' });
    saveConfig(next, overs)
      .then(() => {
        setDirty(false);
        setMsg({ ok: true, text: 'Saved. Titles and formulas update everywhere, including past matches.' });
      })
      .catch((e) => setMsg({ ok: false, text: writeErrorText(e) }));
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

        <section className="flex flex-col gap-2.5">
          <h2 className={H2}>TITLE NAMES</h2>
          <p className="text-sm text-muted">
            Heroes show as the name (e.g. "Fatakeshto"). Hall of Shame titles show as "<em>name</em> of the day" (e.g. "Ashraful of the day"). Switch any off.
          </p>
          {renamed && (
            <button
              type="button"
              className={btn.outline + ' text-sm'}
              onClick={() =>
                edit({
                  ...cfg,
                  titles: Object.fromEntries(TITLE_ORDER.map((k) => [k, { ...cfg.titles[k], label: DEFAULT_AWARDS_CONFIG.titles[k].label }])) as AwardsConfig['titles'],
                })
              }
            >
              Use the standard names (Ashraful, Mr. Wide, Mr. No Ball, Baje Fielder, Golden Duck…)
            </button>
          )}
          {TITLE_ORDER.map((k) => {
            const t = cfg.titles[k];
            return (
              <div key={k} className="flex items-end gap-3">
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-semibold text-muted">
                  {TITLE_RULES[k]}
                  <input
                    value={t.label}
                    maxLength={30}
                    onChange={(e) => edit({ ...cfg, titles: { ...cfg.titles, [k]: { ...t, label: e.target.value } } })}
                    className={`h-12 w-full rounded-xl border-2 border-line bg-white px-3 text-base font-extrabold focus:border-green focus:outline-none ${HERO_TITLES.has(k) ? 'text-green-dark' : 'text-red-dark'}`}
                  />
                  <span className="text-[11px] font-normal">Shows as: {titleName(k, t.label.trim() || '…')}</span>
                </label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={t.enabled}
                  aria-label={`${t.label} ${t.enabled ? 'on' : 'off'}`}
                  onClick={() => edit({ ...cfg, titles: { ...cfg.titles, [k]: { ...t, enabled: !t.enabled } } })}
                  className={`relative mb-6 h-8 w-14 flex-none rounded-full transition-colors ${t.enabled ? 'bg-green' : 'bg-line'}`}
                >
                  <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${t.enabled ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
            );
          })}
        </section>

        <section className="flex flex-col gap-2.5">
          <h2 className={H2}>SHAHIN OF THE DAY FORMULA</h2>
          <p className="text-sm text-muted">
            Points for a bad day, across both teams. Highest total wins:
            <br />+ runs conceded above the match's average economy
            <br />+ (batting par − runs) if out below par
            <br />+ points per dropped catch, boundary leaked and other oops
            <br />− points per wicket taken
          </p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            {WEIGHTS.map(({ key, label }) => (
              <NumberField
                key={key}
                label={label}
                value={cfg.shahinWeights[key]}
                min={0}
                max={MAX_WEIGHT}
                onChange={(n) => edit({ ...cfg, shahinWeights: { ...cfg.shahinWeights, [key]: n } })}
              />
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2.5">
          <h2 className={H2}>MATCH DEFAULTS</h2>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            <NumberField
              label="Default overs"
              value={overs}
              min={1}
              max={50}
              integer
              onChange={(n) => {
                setOvers(n);
                setDirty(true);
                setMsg(null);
              }}
            />
            <NumberField
              label="Kipta min. balls bowled"
              value={cfg.kiptaMinBalls}
              min={0}
              max={300}
              integer
              onChange={(n) => edit({ ...cfg, kiptaMinBalls: n })}
            />
          </div>
        </section>

        {!labelsOk && <Banner tone="red">Every title needs a name (switch it off instead of clearing it).</Banner>}
        {msg && <Banner tone={msg.ok ? 'green' : 'red'}>{msg.text}</Banner>}
        <div className="sticky bottom-0 -mx-[clamp(12px,4vw,20px)] border-t border-line bg-white px-[clamp(12px,4vw,20px)] pt-2.5 pb-[max(14px,env(safe-area-inset-bottom))]">
          <button type="button" className={btn.primary} disabled={!labelsOk || !dirty} onClick={save}>
            {dirty ? 'Save settings' : 'All changes saved'}
          </button>
        </div>
        <Link to="/check" className="text-center text-sm font-bold text-green-dark underline">
          Run the setup and security check
        </Link>
      </div>
    </Page>
  );
}
