import { supabase, assertNoSupabaseError } from '../../shared/db/supabase.js';

/**
 * Find suppliers by region and optional capability from Supabase.
 * Falls back to top-rated global suppliers when region filter has no results.
 */
export async function findSuppliers(region, capability = null, limit = 3) {
	try {
		let query = supabase
			.from('suppliers')
			.select(`
				id,
				name,
				region,
				base_cost_per_km,
				reliability_score,
				contact_email,
				is_active,
				supplier_capabilities (
					capabilities ( name )
				)
			`)
			.eq('region', region)
			.eq('is_active', true)
			.order('reliability_score', { ascending: false })
			.limit(limit);

		if (capability) {
			query = supabase
				.from('suppliers')
				.select(`
					id,
					name,
					region,
					base_cost_per_km,
					reliability_score,
					contact_email,
					is_active,
					supplier_capabilities!inner (
						capabilities!inner ( name )
					)
				`)
				.eq('region', region)
				.eq('is_active', true)
				.eq('supplier_capabilities.capabilities.name', capability)
				.order('reliability_score', { ascending: false })
				.limit(limit);
		}

		const { data, error } = await query;
		assertNoSupabaseError(error, `findSuppliers(region=${region}, capability=${capability})`);

		const suppliers = (data || []).map((s) => ({
			id: s.id,
			name: s.name,
			region: s.region,
			baseCostPerKm: parseFloat(s.base_cost_per_km),
			reliabilityScore: s.reliability_score,
			contactEmail: s.contact_email,
		}));

		if (suppliers.length === 0) {
			console.warn(`[SupplierLookup] No suppliers for region=${region}, capability=${capability}. Using global fallback.`);
			const { data: fallback, error: fbErr } = await supabase
				.from('suppliers')
				.select('id, name, region, base_cost_per_km, reliability_score, contact_email')
				.eq('is_active', true)
				.order('reliability_score', { ascending: false })
				.limit(limit);
			assertNoSupabaseError(fbErr, 'findSuppliers fallback');
			return (fallback || []).map((s) => ({
				id: s.id,
				name: s.name,
				region: s.region,
				baseCostPerKm: parseFloat(s.base_cost_per_km),
				reliabilityScore: s.reliability_score,
				contactEmail: s.contact_email,
			}));
		}

		console.log(`[SupplierLookup] Found ${suppliers.length} suppliers for region=${region} capability=${capability || 'any'}`);
		return suppliers;
	} catch (err) {
		console.error('[SupplierLookup] Error:', err.message);
		throw err;
	}
}
