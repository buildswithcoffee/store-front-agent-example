import { runJev } from '@/lib/jev';

export async function POST(req: Request) {
  const { text } = await req.json();
  return Response.json(await runJev(text));
}
