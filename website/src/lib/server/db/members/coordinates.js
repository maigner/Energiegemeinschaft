import { middlewareDbConnection } from "$lib/server/db/db";
import { MAPBOX_QUERY_TOKEN } from "$env/static/private";


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

export const updateMissingMemberCoordinates = async () => {

    let messages = [];

    const membersWithoutCoordinates = await getMembersWithoutCoordinates();

    for (const member of membersWithoutCoordinates) {
        const address = `${member.street} ${member.hnr}, ${member.zip} ${member.city}`;
        console.log(`Updating coordinates for member ${member.id} with address: ${address}`);

        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_QUERY_TOKEN}`;
        console.log({ url });

        const response = await fetch(url);
        const data = await response.json();

        console.log({ data });

        if (data.features && data.features.length > 0) {
            // msg.payload = msg.payload.features[0].geometry.coordinates;

            const [longitude, latitude] = data.features[0].center;

            messages.push(`Found coordinates for member ${member.id}: ${latitude}, ${longitude}`);

            const result = await updateMemberCoordinates(member.id, latitude, longitude);

        }
    }
    return messages;
};