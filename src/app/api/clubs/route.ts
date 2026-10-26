import { NextResponse } from 'next/server';
import { loadClubs } from '@/lib/db/queries';

export async function GET() {
  const clubs = await loadClubs();
  const cityMap = new Map<string, { city: string; state: string; country: string; clubCount: number }>();
  for (const c of clubs) {
    const key = `${c.city} - ${c.state}`;
    const existing = cityMap.get(key);
    if (existing) {
      existing.clubCount++;
    } else {
      cityMap.set(key, { city: c.city, state: c.state, country: c.country, clubCount: 1 });
    }
  }
  const cities = Array.from(cityMap.values()).sort((a, b) => {
    if (a.state !== b.state) return a.state.localeCompare(b.state);
    return a.city.localeCompare(b.city);
  });
  return NextResponse.json({ clubs, cities });
}
