import {
  clearCalendarEvents,
  createCalendar,
  findClassesCalendar,
  createEvent,
} from "./googleCalendar.js";
import { BATCH_SIZE } from "./constants.js";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "CREATE_EVENTS") return true;

  (async () => {
    try {
      const token = await getAccessToken();

      if (!token) {
        sendResponse({ success: false, error: "Failed to authenticate" });
        return;
      }

      const classesCalendar = await findClassesCalendar(token, "Classes");

      let calendarId;
      let shouldClearEvents = false;

      if (classesCalendar) {
        chrome.runtime.sendMessage({
          type: "CALENDAR_EXISTS",
        });

        const choice = await waitForUserChoice();

        if (choice === "cancel") {
          sendResponse({ success: false, error: "Import cancelled by user" });
          return;
        }

        calendarId = classesCalendar.id;
        shouldClearEvents = choice === "replace";

        if (shouldClearEvents) {
          await clearCalendarEvents(token, calendarId);
        }
      } else {
        calendarId = await createCalendar(token, "Classes");
        if (!calendarId) {
          sendResponse({
            success: false,
            error: "Failed to create Classes calendar",
          });
          return;
        }
      }

      let created = 0;
      const errors = [];

      for (let i = 0; i < msg.events.length; i += BATCH_SIZE) {
        const batch = msg.events.slice(i, i + BATCH_SIZE);

        const results = await Promise.all(
          batch.map((e) => createEvent(token, calendarId, e)),
        );

        for (const r of results) {
          if (r.ok) created++;
          else errors.push(r.error);
        }
      }

      sendResponse({
        success: true,
        created,
        total: msg.events.length,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (err) {
      console.error("Auth error:", err);
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true;
});

async function getAccessToken() {
  const clientId =
    "611800740214-icn88q9bltc36cqiv0ni8456pmfio2op.apps.googleusercontent.com";
  const redirectURL = chrome.identity.getRedirectURL();
  const scopes = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar",
  ];

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "token");
  authUrl.searchParams.set("redirect_uri", redirectURL);
  authUrl.searchParams.set("scope", scopes.join(" "));

  try {
    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.href,
      interactive: true,
    });

    const params = new URLSearchParams(responseUrl.split("#")[1]);
    return params.get("access_token");
  } catch (err) {
    console.error("Auth flow error:", err);
    return null;
  }
}

function waitForUserChoice() {
  return new Promise((resolve) => {
    const listener = (msg) => {
      if (msg.type === "CALENDAR_CHOICE") {
        chrome.runtime.onMessage.removeListener(listener);
        resolve(msg.choice);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
  });
}
