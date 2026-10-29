/** A checagem de saúde da imagem (infra/docker/staff.Dockerfile): o app respondeu. */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ ok: true });
}
