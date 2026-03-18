// ============================================================================
// GPS Tracking Hook — Real-time player position
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import type { GPSCoordinate, HoleLayout } from '../models/types';

export interface GPSTrackingState {
  position: GPSCoordinate | null;
  accuracy: number | null; // meters
  status: 'idle' | 'acquiring' | 'tracking' | 'error';
  error: string | null;
  distanceToPin: number | null; // yards
  distanceToGreenFront: number | null; // yards
  distanceToGreenBack: number | null; // yards
}

function distanceYardsBetween(a: GPSCoordinate, b: GPSCoordinate): number {
  const R = 6371000; // Earth radius meters
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  const meters = R * c;
  return Math.round(meters / 0.9144);
}

export function useGPSTracking(hole: HoleLayout | null, enabled: boolean): GPSTrackingState {
  const [state, setState] = useState<GPSTrackingState>({
    position: null,
    accuracy: null,
    status: 'idle',
    error: null,
    distanceToPin: null,
    distanceToGreenFront: null,
    distanceToGreenBack: null,
  });

  const watchIdRef = useRef<number | null>(null);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled || !hole) {
      stopTracking();
      setState(prev => ({ ...prev, status: 'idle' }));
      return;
    }

    if (!navigator.geolocation) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: 'Geolocation not supported',
      }));
      return;
    }

    setState(prev => ({ ...prev, status: 'acquiring' }));

    const handlePosition = (pos: GeolocationPosition) => {
      const gps: GPSCoordinate = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        elevationMeters: pos.coords.altitude ?? undefined,
      };

      const distToPin = distanceYardsBetween(gps, hole.pinPosition);
      const distToFront = distanceYardsBetween(gps, hole.greenContour.frontEdge);
      const distToBack = distanceYardsBetween(gps, hole.greenContour.backEdge);

      setState({
        position: gps,
        accuracy: pos.coords.accuracy,
        status: 'tracking',
        error: null,
        distanceToPin: distToPin,
        distanceToGreenFront: distToFront,
        distanceToGreenBack: distToBack,
      });
    };

    const handleError = (err: GeolocationPositionError) => {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: err.code === 1 ? 'Location access denied'
          : err.code === 2 ? 'Position unavailable'
          : 'Location timeout',
      }));
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 10000,
      },
    );

    return stopTracking;
  }, [enabled, hole, stopTracking]);

  return state;
}
