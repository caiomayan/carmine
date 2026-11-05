import type { ProfileSession, ProfileSessions } from '@carmine/contracts';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SessionsCard } from '@/components/profile/sessions-card';

// Como as outras vitrines: só existe com CARMINE_UI_GALLERY=1 (dev e E2E).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sessões de jogo (vitrine)',
  robots: { index: false },
};

const session = (id: number, over: Partial<ProfileSession>): ProfileSession => ({
  id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
  mode: 'retake',
  map: 'de_mirage',
  maps: ['de_mirage'],
  day: '2026-11-03',
  startedAt: null,
  endedAt: null,
  seconds: 5_400,
  live: false,
  server: null,
  ...over,
});

const live = session(1, {
  day: '2026-11-05',
  seconds: null,
  live: true,
  server: { id: '00000000-0000-4000-8000-0000000000aa', name: 'Retake · Rotação', code: 'SP·2' },
});
const [pastA, pastB, pastC] = [
  session(2, { day: '2026-11-04', seconds: 2_640 }),
  session(3, {
    mode: 'deathmatch',
    map: 'de_dust2',
    maps: ['de_dust2', 'de_inferno'],
    day: '2026-11-03',
    seconds: 1_080,
  }),
  session(4, { map: null, maps: [], day: '2026-10-30', seconds: null }),
] as [ProfileSession, ProfileSession, ProfileSession];
// A própria Conta também recebe a hora do relógio.
const own = (s: ProfileSession, start: string, end: string | null): ProfileSession => ({
  ...s,
  startedAt: start,
  endedAt: end,
});

const SCENARIOS: Record<string, ProfileSessions | null> = {
  visitante: { visible: true, since: '2026-10-30', sessions: [live, pastA, pastB, pastC] },
  dono: {
    visible: true,
    since: '2026-10-30',
    sessions: [
      own(live, '2026-11-05T21:30:00-03:00', null),
      own(pastA, '2026-11-04T20:00:00-03:00', '2026-11-04T20:44:00-03:00'),
      own(pastB, '2026-11-03T22:10:00-03:00', '2026-11-03T22:28:00-03:00'),
      own(pastC, '2026-10-30T19:00:00-03:00', null),
    ],
  },
  passadas: { visible: true, since: '2026-10-30', sessions: [pastA, pastB, pastC] },
  vazio: { visible: true, since: null, sessions: [] },
  fora: null,
};

export default async function SessionsGalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  if (process.env.CARMINE_UI_GALLERY !== '1') notFound();
  const { estado } = await searchParams;
  const key = estado && estado in SCENARIOS ? estado : 'visitante';
  return (
    <div className="container-page grid max-w-[420px] gap-4 py-10" data-vida="on">
      <p className="label-caps text-muted-foreground">?estado={Object.keys(SCENARIOS).join('|')}</p>
      <SessionsCard sessions={SCENARIOS[key] ?? null} />
    </div>
  );
}
