import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { disruption, resolution, options, impactReport } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini is not configured' }, { status: 503 });
    }

    const fallbackOption = Array.isArray(options) ? options[0] : null;
    const selected = resolution || fallbackOption || {};
    const otherOptions = Array.isArray(options)
      ? options.slice(1).map((option) => option?.description).filter(Boolean).join('; ')
      : '';

    const prompt = `You are a senior supply chain analyst. Write a formal executive incident report in plain text (no markdown, no asterisks, no bullet symbols).

Use exactly this structure with these exact section headers on their own lines:

INCIDENT REPORT
EXECUTIVE SUMMARY
DISRUPTION DETAILS
FINANCIAL IMPACT ASSESSMENT
RESOLUTION EXECUTED
ALTERNATIVE OPTIONS CONSIDERED
RISK OUTLOOK
RECOMMENDED NEXT STEPS

Data:
- Disruption: ${disruption?.description || 'Unknown disruption'}
- Severity: ${disruption?.severity || 'high'}
- Detected: ${disruption?.detectedAt || new Date().toISOString()}
- Cargo at risk: $${((impactReport?.totalCargoValueUSD || 0) / 1e6).toFixed(1)}M across ${impactReport?.affectedCount || 0} shipments
- Resolution chosen: ${selected?.description || 'Pending'}
- Cost delta: $${Number(selected?.costDelta || 0).toLocaleString()}
- Time delta: ${selected?.timeDeltaDays || 0} days
- Carbon delta: ${Math.round(Number(selected?.carbonDeltaKg || 0) / 1000)}t CO2
- Other options: ${otherOptions || 'None'}

Write 2-3 sentences per section. Be specific, professional, and quantitative. Include today's date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1200 },
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json({ error: `Gemini request failed: ${text}` }, { status: 500 });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!text) {
      return NextResponse.json({ error: 'Gemini returned an empty report' }, { status: 502 });
    }

    return NextResponse.json({ report: text });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Failed to generate report' }, { status: 500 });
  }
}
