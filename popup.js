import { DAY_MAP, DAY_TO_NUMBER, SEMESTER_DATES } from "./constants.js";

function to24h(time) {
  let [t, mer] = time.split(" ");
  let [h, m] = t.split(":").map(Number);
  if (mer === "PM" && h !== 12) h += 12;
  if (mer === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function getFirstOccurrence(startDate, targetDay) {
  
  const date = new Date(startDate + "T00:00:00");
  const targetDayNum = DAY_TO_NUMBER[targetDay];
  const currentDayNum = date.getDay() === 0 ? 7 : date.getDay(); 
  
  
  let daysToAdd = targetDayNum - currentDayNum;
  if (daysToAdd < 0) daysToAdd += 7;
  
  date.setDate(date.getDate() + daysToAdd);
  
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  
  return `${year}-${month}-${day}`;
}

document.getElementById("importBtn").onclick = async () => {


  const status = document.getElementById("status");

  const dates = {
    first: { start: firstStart.value, end: firstEnd.value },
    second: { start: secondStart.value, end: secondEnd.value }
  };

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });


  if (!tab.url.includes("draftmyschedule")) {
    status.textContent = "Open your UWO schedule page first.";
    status.className = "status error show";
    return;
  }

  let schedule;
  try {
    schedule = await chrome.tabs.sendMessage(tab.id, { type: "GET_SCHEDULE" });
  } catch (err) {
    console.error(err);
    status.textContent = "Schedule page not detected.";
    status.className = "status error show";
    return;
  }

  const events = [];

  for (const course of schedule) {
    const semesters =
      course.semester === "both"
        ? ["first", "second"]
        : [course.semester];

    for (const sem of semesters) {
      const range = dates[sem];
      if (!range?.start || !range?.end) continue;

      for (const m of course.meetings) {
        const byday = DAY_MAP[m.day];

        if (!byday) {
          console.warn("Skipped meeting (bad day):", m.day, m);
          continue;
        }

        const firstOccurrence = getFirstOccurrence(range.start, byday);

        events.push({
          summary: `${course.subject} ${course.courseNumber} – ${course.component}`,
          location: m.location,
          start: {
            dateTime: `${firstOccurrence}T${to24h(m.start)}`,
            timeZone: "America/Toronto"
          },
          end: {
            dateTime: `${firstOccurrence}T${to24h(m.end)}`,
            timeZone: "America/Toronto"
          },
          recurrence: [
            `RRULE:FREQ=WEEKLY;BYDAY=${byday};UNTIL=${range.end.replace(/-/g,"")}T235959Z`
          ],
          colorId: course.colorId
        });
      }
    }
  }

  chrome.runtime.sendMessage({ type: "CREATE_EVENTS", events });
  status.textContent = `Imported ${events.length} events 🎉`;
};

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("firstStart").value = SEMESTER_DATES.first.start;
  document.getElementById("firstEnd").value   = SEMESTER_DATES.first.end;
  document.getElementById("secondStart").value = SEMESTER_DATES.second.start;
  document.getElementById("secondEnd").value   = SEMESTER_DATES.second.end;
});

const modal = document.getElementById("calendarModal");

function showModal() {
  modal.classList.add("show");
}

function hideModal() {
  modal.classList.remove("show");
}

replaceBtn.onclick = () => {
  chrome.runtime.sendMessage({
    type: "CALENDAR_CHOICE",
    choice: "replace"
  });
  hideModal();
};

appendBtn.onclick = () => {
  chrome.runtime.sendMessage({
    type: "CALENDAR_CHOICE",
    choice: "append"
  });
  hideModal();
};

cancelBtn.onclick = () => {
  chrome.runtime.sendMessage({
    type: "CALENDAR_CHOICE",
    choice: "cancel"
  });
  hideModal();
};

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "CALENDAR_EXISTS") {
    showModal();
  }
});

