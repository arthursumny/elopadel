import { db } from '../db';
import { clubs } from '../db/schema';
import { getGripoBaseHeaders } from './gripo';

const GRIPO_API_BASE = 'https://api.gripo.com.br/app/v1';

interface GripoCity {
  id: number;
  name: string;
  name_with_state?: string;
  state?: { initials?: string; name?: string };
  country?: { name?: string };
}

interface GripoClub {
  id: number;
  name: string;
  slug: string;
  tenant_id: number;
  tenant_settings?: {
    app_schedule?: {
      contact?: {
        phone?: string;
        email?: string;
      };
    };
  };
}

async function fetchCities(): Promise<GripoCity[]> {
  const res = await fetch(`${GRIPO_API_BASE}/city/active`, {
    headers: getGripoBaseHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Falha ao buscar cidades ativas no Gripo (${res.status})`);
  }
  return res.json();
}

async function fetchClubsForCity(cityId: number): Promise<GripoClub[]> {
  try {
    const res = await fetch(`${GRIPO_API_BASE}/club/available`, {
      method: 'POST',
      headers: getGripoBaseHeaders(),
      body: JSON.stringify({ city_id: cityId }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function syncGripoClubsDatabase(): Promise<{
  totalCities: number;
  totalClubs: number;
  uniqueClubsCount: number;
}> {
  if (!db) {
    throw new Error('Banco de dados indisponível para sincronização.');
  }

  const cities = await fetchCities();

  const clubsToUpsert: Array<{
    name: string;
    city: string;
    state: string;
    country: string;
    gripoUrl: string;
    address: string | null;
  }> = [];

  const chunkSize = 15;
  for (let i = 0; i < cities.length; i += chunkSize) {
    const chunk = cities.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map(async (city) => {
        const cityClubs = await fetchClubsForCity(city.id);
        const stateInitials =
          city.state?.initials ||
          city.name_with_state?.split('/')[1] ||
          'SC';

        return cityClubs.map((club) => {
          const contact = club.tenant_settings?.app_schedule?.contact;
          const contactStr = [contact?.phone, contact?.email].filter(Boolean).join(' • ') || null;

          return {
            name: club.name.trim(),
            city: city.name.trim(),
            state: stateInitials.trim().toUpperCase(),
            country: city.country?.name || 'Brasil',
            gripoUrl: `https://gripo.app/${club.slug}`,
            address: contactStr,
          };
        });
      })
    );
    clubsToUpsert.push(...results.flat());
  }

  // Deduplicate by (name, city, state, country)
  const uniqueClubs = new Map<string, typeof clubsToUpsert[0]>();
  for (const c of clubsToUpsert) {
    const key = `${c.name}__${c.city}__${c.state}__${c.country}`.toLowerCase();
    uniqueClubs.set(key, c);
  }

  for (const club of uniqueClubs.values()) {
    await db
      .insert(clubs)
      .values({
        name: club.name,
        city: club.city,
        state: club.state,
        country: club.country,
        gripoUrl: club.gripoUrl,
        address: club.address,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [clubs.name, clubs.city, clubs.state, clubs.country],
        set: {
          gripoUrl: club.gripoUrl,
          address: club.address,
          isActive: true,
          updatedAt: new Date(),
        },
      });
  }

  return {
    totalCities: cities.length,
    totalClubs: clubsToUpsert.length,
    uniqueClubsCount: uniqueClubs.size,
  };
}
