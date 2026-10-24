import { cn } from '@/lib/utils';

export type CollectingKind = 'heatmap' | 'radar' | 'sessions';

/**
 * Cena quieta de um bloco que ainda não tem dado: um esboço apagado do que vai ser (mapa de calor, radar, lista
 * de sessões) e a explicação. Os números de atividade por dia, de abates por arma e lado e das Sessões ainda não
 * são guardados (S12b); aqui não há nenhum valor, só o desenho do lugar onde eles vão aparecer.
 */
export function CollectingCard({
  kind,
  title,
  status,
  body,
  className,
}: {
  kind: CollectingKind;
  title: string;
  /** A etiqueta curta ("Coletando"). */
  status: string;
  body: string;
  className?: string;
}) {
  return (
    <section
      data-testid={`collecting-${kind}`}
      className={cn('v-panel v-panel-lg grid content-start gap-4 p-5 max-md:p-4', className)}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
        <span className="rounded-full bg-(--fill-rest) px-2.5 py-1 text-caption font-semibold text-muted-foreground">
          {status}
        </span>
      </header>
      <Sketch kind={kind} />
      <p className="max-w-[56ch] text-body-sm text-muted-foreground">{body}</p>
    </section>
  );
}

/** O esboço apagado: decorativo, sem texto nem número. */
function Sketch({ kind }: { kind: CollectingKind }) {
  if (kind === 'heatmap') {
    return (
      <div aria-hidden="true" className="pf-heat mx-auto w-full max-w-[560px] opacity-80">
        {Array.from({ length: 20 * 7 }, (_, index) => (
          <i
            // biome-ignore lint/suspicious/noArrayIndexKey: células fixas e decorativas
            key={index}
            style={{ '--l': 1 + ((index * 7 + Math.floor(index / 7)) % 3) } as React.CSSProperties}
          />
        ))}
      </div>
    );
  }
  if (kind === 'radar') {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 200 160"
        className="mx-auto h-[150px] w-full max-w-[240px] text-foreground"
      >
        <title>Esboço de radar</title>
        <g fill="none" stroke="currentColor" strokeWidth="1" opacity="0.16">
          <polygon points="100,12 168,50 168,110 100,148 32,110 32,50" />
          <polygon points="100,36 147,62 147,98 100,124 53,98 53,62" />
          <polygon points="100,60 126,74 126,86 100,100 74,86 74,74" />
          <path d="M100 80V12M100 80l68-30M100 80l68 30M100 80v68M100 80l-68 30M100 80l-68-30" />
        </g>
        <polygon
          points="100,30 150,56 140,104 100,120 62,96 56,60"
          fill="currentColor"
          opacity="0.07"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeDasharray="3 4"
        />
      </svg>
    );
  }
  return (
    <ul aria-hidden="true" className="grid gap-2">
      {[0.12, 0.09, 0.06].map((alpha) => (
        <li key={alpha} className="flex items-center justify-between gap-3 rounded-lg p-3">
          <span className="grid w-1/2 gap-1.5">
            <span className="h-3 rounded-full bg-foreground" style={{ opacity: alpha + 0.04 }} />
            <span className="h-2 w-2/3 rounded-full bg-foreground" style={{ opacity: alpha }} />
          </span>
          <span className="h-3 w-1/5 rounded-full bg-foreground" style={{ opacity: alpha }} />
        </li>
      ))}
    </ul>
  );
}
