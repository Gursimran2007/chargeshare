/** Chennai localities used for search and approximate pins. Expand per city as ChargeShare launches. */
export const CITY_CENTER = { lat: 13.0475, lng: 80.2209 };

export const LOCALITIES: { name: string; lat: number; lng: number }[] = [
  { name: "Adyar", lat: 13.0012, lng: 80.2565 },
  { name: "Alwarpet", lat: 13.0336, lng: 80.255 },
  { name: "Ambattur", lat: 13.1143, lng: 80.1548 },
  { name: "Anna Nagar", lat: 13.085, lng: 80.2101 },
  { name: "Ashok Nagar", lat: 13.0373, lng: 80.2123 },
  { name: "Besant Nagar", lat: 12.9986, lng: 80.2668 },
  { name: "Chromepet", lat: 12.9516, lng: 80.1462 },
  { name: "Egmore", lat: 13.0732, lng: 80.2609 },
  { name: "Guindy", lat: 13.0067, lng: 80.2206 },
  { name: "K. K. Nagar", lat: 13.041, lng: 80.199 },
  { name: "Kilpauk", lat: 13.0839, lng: 80.2422 },
  { name: "Kotturpuram", lat: 13.0186, lng: 80.2414 },
  { name: "Medavakkam", lat: 12.9171, lng: 80.1923 },
  { name: "Mylapore", lat: 13.0339, lng: 80.2619 },
  { name: "Navalur", lat: 12.8459, lng: 80.2265 },
  { name: "Nungambakkam", lat: 13.0569, lng: 80.2425 },
  { name: "Pallikaranai", lat: 12.9349, lng: 80.2137 },
  { name: "Perungudi", lat: 12.9654, lng: 80.2461 },
  { name: "Porur", lat: 13.0382, lng: 80.1565 },
  { name: "Royapettah", lat: 13.0544, lng: 80.264 },
  { name: "Sholinganallur", lat: 12.901, lng: 80.2279 },
  { name: "Siruseri", lat: 12.8236, lng: 80.2195 },
  { name: "T. Nagar", lat: 13.0418, lng: 80.2341 },
  { name: "Tambaram", lat: 12.9249, lng: 80.1 },
  { name: "Teynampet", lat: 13.0405, lng: 80.2503 },
  { name: "Thiruvanmiyur", lat: 12.983, lng: 80.2594 },
  { name: "Thoraipakkam", lat: 12.9416, lng: 80.2362 },
  { name: "Vadapalani", lat: 13.05, lng: 80.2121 },
  { name: "Velachery", lat: 12.9815, lng: 80.218 },
];

export function findLocality(q: string) {
  const s = q.trim().toLowerCase().replace(/[.\s]+/g, " ");
  if (!s) return null;
  return (
    LOCALITIES.find((l) => l.name.toLowerCase().replace(/[.\s]+/g, " ") === s) ??
    LOCALITIES.find((l) => l.name.toLowerCase().replace(/[.\s]+/g, " ").includes(s)) ??
    LOCALITIES.find((l) => s.includes(l.name.toLowerCase().replace(/[.\s]+/g, " "))) ??
    null
  );
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/**
 * Public pin: a deterministic offset of roughly 250–450 m from the real
 * location, so the exact address is not revealed before booking.
 */
export function approximate(lat: number, lng: number, seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const angle = ((h >>> 0) % 360) * (Math.PI / 180);
  const dist = 0.25 + (((h >>> 9) % 200) / 1000); // km
  const dLat = (dist / 111) * Math.cos(angle);
  const dLng = (dist / (111 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);
  return { lat: Math.round((lat + dLat) * 1e5) / 1e5, lng: Math.round((lng + dLng) * 1e5) / 1e5 };
}
