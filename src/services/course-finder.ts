// ============================================================================
// GPS Course Finder — Find real golf courses nearby using OpenStreetMap
// ============================================================================
// Uses the Overpass API to query OpenStreetMap for golf courses within range.
// Free, no API key needed, works worldwide.

export interface NearbyCourse {
  id: string;
  name: string;
  lat: number;
  lng: number;
  distanceKm: number;
  distanceMiles: number;
  website?: string;
  phone?: string;
  holes?: number;
  operator?: string;
}

/**
 * Get user's current GPS position.
 */
export function getUserPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(`Location access denied: ${err.message}`)),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

/**
 * Find golf courses within a radius using the Overpass API (OpenStreetMap).
 */
export async function findNearbyCourses(
  lat: number,
  lng: number,
  radiusKm: number = 10,
): Promise<NearbyCourse[]> {
  const radiusMeters = radiusKm * 1000;

  // Overpass QL query: find all golf courses within radius
  const query = `
    [out:json][timeout:15];
    (
      way["leisure"="golf_course"](around:${radiusMeters},${lat},${lng});
      relation["leisure"="golf_course"](around:${radiusMeters},${lat},${lng});
      node["leisure"="golf_course"](around:${radiusMeters},${lat},${lng});
    );
    out center tags;
  `;

  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!response.ok) {
    throw new Error(`Overpass API error: ${response.status}`);
  }

  const data = await response.json();

  const courses: NearbyCourse[] = data.elements
    .map((el: any) => {
      const elLat = el.lat ?? el.center?.lat;
      const elLng = el.lon ?? el.center?.lon;
      if (!elLat || !elLng) return null;

      const name = el.tags?.name;
      if (!name) return null;

      const dist = haversineKm(lat, lng, elLat, elLng);

      return {
        id: `osm-${el.id}`,
        name,
        lat: elLat,
        lng: elLng,
        distanceKm: Math.round(dist * 10) / 10,
        distanceMiles: Math.round(dist * 0.621371 * 10) / 10,
        website: el.tags?.website ?? el.tags?.['contact:website'],
        phone: el.tags?.phone ?? el.tags?.['contact:phone'],
        holes: el.tags?.holes ? parseInt(el.tags.holes, 10) : undefined,
        operator: el.tags?.operator,
      } as NearbyCourse;
    })
    .filter(Boolean)
    .sort((a: NearbyCourse, b: NearbyCourse) => a.distanceKm - b.distanceKm);

  return courses;
}

/**
 * Haversine distance between two GPS coordinates in kilometers.
 */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
