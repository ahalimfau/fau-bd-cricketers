import { useMatches } from '../data/hooks';
import { Header, Loading, Page, pad } from '../ui/kit';
import { MatchRow } from './Home';

export function Matches() {
  const { matches, ready, error } = useMatches(200);
  return (
    <Page nav>
      <Header title="Matches" sub={ready ? `${matches.length} so far` : undefined} />
      <div className={`flex flex-1 flex-col gap-2 ${pad} pt-2 pb-4`}>
        {!ready && <Loading />}
        {error && <p className="text-sm text-red-dark">Couldn't load matches ({error}).</p>}
        {ready && matches.length === 0 && <p className="text-muted">No matches yet.</p>}
        {matches.map((m) => (
          <MatchRow key={m.id} m={m} />
        ))}
      </div>
    </Page>
  );
}
