const EVENT_COLORS = [
"1",
"2",
"3",
"4",
"5",
"6",
"7",
"9",
"10",
"11",
];
function parseCell(cell) {
  const nested = cell.querySelector("table");
  if (!nested) return cell.innerText.trim();
  return { table: parseNestedTable(nested) };
}

function parseNestedTable(table) {
  const rows = Array.from(table.querySelectorAll("tr"));
  return rows.map(row => {
    const cells = Array.from(row.querySelectorAll("td"));
    return cells.map(c => c.innerText.trim());
  });
}

function parseTable(table) {
  const rows = Array.from(table.querySelectorAll("tr"));
  if (!rows.length) return [];

  const headerRow = rows.find(r => r.querySelector("th"));
  if (!headerRow) return [];
  
  const headers = Array.from(headerRow.querySelectorAll("th")).map(h =>
    h.innerText.trim()
  );

  const data = [];
  for (const row of rows) {
    if (row === headerRow) continue;
    const cells = Array.from(row.querySelectorAll("td"));
    if (cells.length === 0) continue;

    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = cells[i] ? parseCell(cells[i]) : null;
    });
    data.push(obj);
  }

  return data;
}

function parseDayString(dayStr) {
  const cleaned = dayStr.replace(/&nbsp;/g, " ").trim();
  
  const days = [];
  const dayMap = {
    'M': 'M',
    'Tu': 'Tu',
    'W': 'W',
    'Th': 'Th',
    'F': 'F'
  };
  
  let remaining = cleaned;
  while (remaining.length > 0) {
    remaining = remaining.trim();
    let matched = false;
    
    for (const [pattern, day] of Object.entries(dayMap)) {
      if (remaining.startsWith(pattern)) {
        days.push(day);
        remaining = remaining.slice(pattern.length);
        matched = true;
        break;
      }
    }
    
    if (!matched) {
      remaining = remaining.slice(1);
    }
  }
  
  return days;
}

function normalizeMeetings(dtl) {
  if (!dtl || !dtl.table) return [];

  const meetings = [];

  for (const rowData of dtl.table) {
    if (rowData.length < 2) continue;

    const dayStr = rowData[0] || "";
    const timeStr = rowData[1] || "";
    const location = (rowData[2] || "").trim();

    if (!dayStr || !timeStr) continue;

    const days = parseDayString(dayStr);
    const [start, end] = timeStr.split("-").map(s => s.trim());

    for (const day of days) {
      meetings.push({
        day,
        start,
        end,
        location
      });
    }
  }

  return meetings;
}

function interpretSection(courseNumber) {
  if (!courseNumber) return "other";
  
  const suffix = courseNumber.slice(-1).toUpperCase();
  
  if (["A", "F", "Q", "R", "W"].includes(suffix)) return "first";
  if (["B", "G", "S", "T", "X"].includes(suffix)) return "second";
  if (["E", "H", "J", "K"].includes(suffix)) return "both";
  
  return "other";
}

function extractSchedule() {
  const tables = Array.from(document.querySelectorAll("table"));
  const timetable = tables.find(t =>
    t.innerText.includes("Course Number") &&
    t.innerText.includes("Days/Times/Location")
  );

  if (!timetable) return [];

  const raw = parseTable(timetable);

  return raw.map(course => ({
    subject: course["Subject"],
    courseNumber: course["Course Number"],
    component: course["Component"],
    description: course["Description"],
    instructor: course["Instructor"],
    semester: interpretSection(course["Course Number"]),
    meetings: normalizeMeetings(course["Days/Times/Location"]),
    colorId: course["Course Number"] ? colorForCourse(course["Course Number"]) : 1,
  }));
}

chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  if (msg.type === "GET_SCHEDULE") {
    const data = extractSchedule();
    console.log("Extracted schedule:", data);
    sendResponse(data);
    return true;
  }
});

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function colorForCourse(courseCode) {
  const hash = hashString(courseCode);
  return EVENT_COLORS[1+ hash % EVENT_COLORS.length];
}