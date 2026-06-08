'use client';

import { useCallback } from 'react';
import { watchDisruptionSupabase, watchImpactSupabase, watchResolutionSupabase } from '../lib/supabaseWatcher.js';
import { useAlertStore } from '../store/alertStore.js';

/**
 * Hook: useDemoInject
 * 
 * Provides reusable injection logic for triggering demo/alert flows.
 * Handles:
 * - Starting Supabase watchers
 * - Bridging data into alertStore
 * - Opening DecisionModal on resolution
 */
export function useDemoInject(onLog) {
  const setActiveDisruptionId = useAlertStore((s) => s.setActiveDisruptionId);
  const setResolutionWithOptions = useAlertStore((s) => s.setResolutionWithOptions);

  /**
   * Injects a disruption into the decision flow
   * @param {string} disruptionId - The disruption ID
   * @param {Function} onStageChange - Callback when stage changes
   * @returns {Array} Array of unsubscribe functions for cleanup
   */
  const injectDisruption = useCallback(
    (disruptionId, onStageChange) => {
      if (!disruptionId) return [];

      const unsubscribers = [];

      // Notify the store that this disruption is active
      setActiveDisruptionId(disruptionId);
      onLog?.('Injecting disruption into alert system…', 'info');

      // Watch disruption
      const unsubDisruption = watchDisruptionSupabase(disruptionId, (data) => {
        onLog?.(
          `✓ Disruption confirmed: ${data.title || data.type || disruptionId}`,
          'success'
        );
        onStageChange?.('monitoring', data);

        // Watch impact after disruption confirmed
        const unsubImpact = watchImpactSupabase(disruptionId, (impactData) => {
          onLog?.(
            `✓ Impact scored: $${Number(impactData.totalCargoAtRiskUSD || 0).toLocaleString()} at risk across ${(impactData.affectedShipments || []).length} shipments`,
            'success'
          );
          onStageChange?.('impact', impactData);

          // Watch resolution after impact available
          const unsubResolution = watchResolutionSupabase(
            disruptionId,
            ({ resolution: res, options: opts }) => {
              onLog?.(
                `✓ AI generated ${opts.length} resolution strategies`,
                'success'
              );
              onStageChange?.('resolution', { resolution: res, options: opts });

              // Bridge into alertStore — opens DecisionModal
              setResolutionWithOptions({
                ...res,
                disruptionId,
                options: opts,
                urgency: res.urgency ?? 8,
                analysisText: res.analysisText,
                impactReport: {
                  totalCargoAtRiskUSD: res.totalCargoAtRiskUSD,
                  cascadeRisk: res.cascadeRisk,
                  urgency: res.urgency,
                  analysisText: res.analysisText,
                  affectedShipments: Array.from({
                    length: res.shipmentCount || 0,
                  }),
                },
              });

              setTimeout(() => onStageChange?.('decision'), 1200);
            }
          );
          unsubscribers.push(unsubResolution);
        });
        unsubscribers.push(unsubImpact);
      });
      unsubscribers.push(unsubDisruption);

      return unsubscribers;
    },
    [setActiveDisruptionId, setResolutionWithOptions, onLog]
  );

  return { injectDisruption };
}
