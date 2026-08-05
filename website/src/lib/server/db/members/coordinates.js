import { middlewareDbConnection } from "$lib/server/db/db";


export const getMembersWithoutCoordinates = async () => {
    const sql = await middlewareDbConnection();
    const result = await sql.query(`
    SELECT
      id,
      identifier,
      email,
      name,
      first_name AS "firstName",
      last_name  AS "lastName",
      street,
      hnr,
      zip,
      city,
      latitude,
      longitude,
      TO_CHAR(member_since, 'YYYY-MM-DD') AS "memberSince"
    FROM members_member
    WHERE latitude IS NULL
       OR longitude IS NULL
    ORDER BY member_since DESC;
  `);
    sql.release();
    return result?.rows;
};

export const updateMemberCoordinates = async (id, latitude, longitude) => {
    const sql = await middlewareDbConnection();
    const result = await sql.query(`
    UPDATE members_member
    SET latitude = $1, longitude = $2
    WHERE id = $3
    RETURNING id, identifier, latitude, longitude
  `, [latitude, longitude, id]);
    sql.release();
    return result?.rows[0];
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Geokodiert Mitglieder ohne Koordinaten ueber OSM Nominatim (Betreiber:
 * OpenStreetMap Foundation, UK -- Angemessenheitsbeschluss der EU-Kommission).
 * Ersetzt das fruehere Mapbox-Geocoding (US-Anbieter). Usage Policy von
 * Nominatim: max. 1 Request pro Sekunde, aussagekraeftiger User-Agent.
 */
export const updateMissingMemberCoordinates = async () => {

    let messages = [];

    const membersWithoutCoordinates = await getMembersWithoutCoordinates();

    for (const member of membersWithoutCoordinates) {
        const address = `${member.street} ${member.hnr}, ${member.zip} ${member.city}`;

        const url = "https://nominatim.openstreetmap.org/search?" + new URLSearchParams({
            q: address,
            format: "jsonv2",
            limit: "1",
            countrycodes: "at",
        });

        const response = await fetch(url, {
            headers: {
                "User-Agent": "ischlstrom.org member map (info@ischlstrom.org)",
            },
        });

        if (!response.ok) {
            messages.push(`Geocoding failed for member ${member.id} (HTTP ${response.status})`);
            await sleep(1100);
            continue;
        }

        const data = await response.json();

        if (Array.isArray(data) && data.length > 0) {
            const latitude = parseFloat(data[0].lat);
            const longitude = parseFloat(data[0].lon);

            messages.push(`Found coordinates for member ${member.id}: ${latitude}, ${longitude}`);

            await updateMemberCoordinates(member.id, latitude, longitude);
        } else {
            messages.push(`No coordinates found for member ${member.id}`);
        }

        // Nominatim-Rate-Limit einhalten
        await sleep(1100);
    }
    return messages;
};
