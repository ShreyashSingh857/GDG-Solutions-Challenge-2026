import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import '../../../../lib/firebase-admin.js';
import { getSupabaseAdmin, hashKey } from '../../v1/_auth.js';

function getBearerToken(req) {
  const authHeader = req.headers.get('authorization') || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
}

async function resolveOrgContext(req) {
  const defaultOrgId = process.env.DEFAULT_ORG_ID || 'demo-org';
  const headerOrg = (req.headers.get('x-org-id') || '').trim();
  const bearer = getBearerToken(req);

  if (!bearer) {
    return { orgId: headerOrg || defaultOrgId };
  }

  try {
    const decoded = await getAuth().verifyIdToken(bearer);
    const claimedOrg = String(decoded.orgId || '').trim();
    return { orgId: claimedOrg || headerOrg || defaultOrgId, uid: decoded.uid };
  } catch {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
}

export async function GET(req) {
  const context = await resolveOrgContext(req);
  if (context.error) return context.error;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, label, created_at, last_used')
    .eq('org_id', context.orgId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data || [] });
}

export async function POST(req) {
  const context = await resolveOrgContext(req);
  if (context.error) return context.error;

  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const label = String(body.label || 'My API Key').slice(0, 64);
  const rawKey = `ot-${crypto.randomBytes(24).toString('hex')}`;
  const keyHash = hashKey(rawKey);

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  const { data, error } = await supabase
    .from('api_keys')
    .insert({ org_id: context.orgId, label, key_hash: keyHash })
    .select('id, label, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: { ...data, key: rawKey } }, { status: 201 });
}

export async function DELETE(req) {
  const context = await resolveOrgContext(req);
  if (context.error) return context.error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  const { error } = await supabase
    .from('api_keys')
    .delete()
    .eq('id', id)
    .eq('org_id', context.orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
