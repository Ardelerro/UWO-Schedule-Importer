import { BATCH_SIZE } from "./constants.js";
export async function findClassesCalendar(token, name) {
  try {
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!res.ok) return null;

    const data = await res.json();
    return data.items?.find((cal) => cal.summary === name) || null;
  } catch (err) {
    console.error("Error finding calendar:", err);
    return null;
  }
}

export async function createCalendar(token, name) {
  try {
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: name,
          description: "University class schedule",
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      },
    );

    if (!res.ok) return null;

    const calendar = await res.json();
    return calendar.id;
  } catch (err) {
    console.error("Error creating calendar:", err);
    return null;
  }
}

export async function clearCalendarEvents(token, calendarId) {
  let pageToken = undefined;

  try {
    do {
      const listRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
          calendarId,
        )}/events?maxResults=2500${pageToken ? `&pageToken=${pageToken}` : ""}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!listRes.ok) {
        console.error("Failed to list events");
        return;
      }

      const data = await listRes.json();
      const events = data.items || [];
      pageToken = data.nextPageToken;

      if (events.length === 0) continue;

      for (let i = 0; i < events.length; i += BATCH_SIZE) {
        const batch = events.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map((event) =>
            deleteEventWithRetry(token, calendarId, event.id),
          ),
        );
      }
    } while (pageToken);
  } catch (err) {
    console.error("Error clearing calendar:", err);
  }
}

async function deleteEventWithRetry(token, calendarId, eventId, attempt = 0) {
  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendarId,
      )}/events/${eventId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (res.ok) return;

    if ((res.status === 403 || res.status === 429) && attempt < 3) {
      await backoff(attempt);
      return deleteEventWithRetry(token, calendarId, eventId, attempt + 1);
    }

    console.error(`Failed to delete event ${eventId}:`, await res.text());
  } catch (err) {
    if (attempt < 3) {
      await backoff(attempt);
      return deleteEventWithRetry(token, calendarId, eventId, attempt + 1);
    }
    console.error(`Delete error for event ${eventId}:`, err);
  }
}

function backoff(attempt) {
  return new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
}

export async function createEvent(token, calendarId, event, attempt = 0) {
  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      },
    );

    if (res.ok) return { ok: true };

    const text = await res.text();

    if ((res.status === 429 || res.status === 403) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      return createEvent(token, calendarId, event, attempt + 1);
    }

    return { ok: false, error: text };
  } catch (err) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      return createEvent(token, calendarId, event, attempt + 1);
    }
    return { ok: false, error: err.message };
  }
}
