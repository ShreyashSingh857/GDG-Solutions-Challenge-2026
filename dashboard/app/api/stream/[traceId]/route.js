import { NextResponse } from 'next/server';

const RESOLUTION_AGENT_URL =
	process.env.RESOLUTION_AGENT_URL ||
	process.env.NEXT_PUBLIC_RESOLUTION_AGENT_URL ||
	'http://localhost:3003';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req, context) {
	const { traceId } = await context.params;
	if (!traceId) {
		return NextResponse.json({ error: 'traceId is required' }, { status: 400 });
	}

	const headers = {};
	if (process.env.INTERNAL_TOKEN) {
		headers.Authorization = `Bearer ${process.env.INTERNAL_TOKEN}`;
	}

	let upstream;
	try {
		upstream = await fetch(`${RESOLUTION_AGENT_URL}/stream/${encodeURIComponent(traceId)}`, {
			headers,
			cache: 'no-store',
		});
	} catch (err) {
		return NextResponse.json({ error: `Unable to reach resolution stream: ${err.message}` }, { status: 502 });
	}

	if (!upstream.ok || !upstream.body) {
		const detail = await upstream.text().catch(() => 'Upstream stream unavailable');
		return NextResponse.json({ error: detail || 'Upstream stream unavailable' }, { status: upstream.status || 502 });
	}

	let reader;
	const stream = new ReadableStream({
		async start(controller) {
			reader = upstream.body.getReader();
			let didError = false;
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					controller.enqueue(value);
				}
			} catch (err) {
				didError = true;
				controller.error(err);
			} finally {
				if (!didError) {
					controller.close();
				}
				reader.releaseLock();
			}
		},
		cancel() {
			if (reader) {
				reader.cancel();
			}
		},
	});

	return new Response(stream, {
		status: 200,
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no',
		},
	});
}
