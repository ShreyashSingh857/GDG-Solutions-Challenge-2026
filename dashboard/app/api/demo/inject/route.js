import { NextResponse } from 'next/server';

const DISRUPTION_AGENT_URL =
  process.env.DISRUPTION_AGENT_URL || 
  process.env.NEXT_PUBLIC_DISRUPTION_AGENT_URL || 
  'http://localhost:3001';

const SCENARIOS = {
  pacific_storm: {
    label: 'Super Typhoon Mawar',
    description:
      'Super Typhoon Mawar has intensified to Category 5 with sustained winds of 265 km/h and is currently tracking northwest across the Western Pacific Ocean at coordinates 15.2°N 128.5°E. The typhoon is expected to impact shipping lanes between the Philippines and Japan, affecting the primary Shanghai to Los Angeles trade route. Storm surge warnings have been issued for Taiwan Strait, Philippines Sea, and South China Sea. Port authorities in Manila, Kaohsiung, and Hong Kong have issued vessel advisories.',
  },
  suez_closure: {
    label: 'Suez Canal Emergency',
    description:
      "The Suez Canal Authority has announced an emergency closure of the Suez Canal effective 0000 UTC following a series of Houthi missile attacks on vessels in the Red Sea. The Egyptian government has declared a maritime emergency zone covering the Red Sea (15°N to 30°N) and Gulf of Aden. Forty-three vessels currently in the canal are being held pending security assessment. Lloyd's of London has suspended war risk coverage for the corridor. An estimated $12 billion in daily trade is affected. The closure is expected to last a minimum of 21 days.",
  },
  port_strike: {
    label: 'Mumbai JNPT Strike',
    description:
      "Workers at Jawaharlal Nehru Port Trust (JNPT) in Mumbai, India have initiated an indefinite strike effective immediately at 06:00 IST. The dockworkers union MSWU representing 4,800 workers is demanding a 40% wage increase following failed negotiations. JNPT handles over 5 million TEUs annually and is India's largest container port. All loading and unloading operations are suspended. Alternative ports Mundra and Nhava Sheva are already operating at 85% capacity.",
  },
};

export async function POST(req) {
  try {
    const { scenario } = await req.json();

    if (!scenario || !SCENARIOS[scenario]) {
      return NextResponse.json(
        { error: `Unknown scenario. Available: ${Object.keys(SCENARIOS).join(', ')}` },
        { status: 400 }
      );
    }

    const { description } = SCENARIOS[scenario];

    const headers = { 'Content-Type': 'application/json' };
    if (process.env.INTERNAL_TOKEN) {
      headers.Authorization = `Bearer ${process.env.INTERNAL_TOKEN}`;
    }

    const upstream = await fetch(`${DISRUPTION_AGENT_URL}/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ description }),
    });

    const result = await upstream.json().catch(() => ({ error: 'Invalid response from disruption agent' }));

    if (!upstream.ok) {
      return NextResponse.json(
        { error: result.error || `Disruption agent returned ${upstream.status}` },
        { status: upstream.status }
      );
    }

    return NextResponse.json({
      ok: true,
      disruptionId: result.data?.id,
      traceId: result.traceId,
      scenario,
      label: SCENARIOS[scenario].label,
      published: result.published ?? false,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Inject failed — is the disruption agent running?' },
      { status: 500 }
    );
  }
}