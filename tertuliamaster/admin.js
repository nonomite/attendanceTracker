// Auth guard: only a signed-in user with profiles.role = 'admin' may see this page.
(async function guard() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = "masterLogin.html";
    return;
  }

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    await supabaseClient.auth.signOut();
    window.location.href = "masterLogin.html";
    return;
  }

  init();
})();

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = "masterLogin.html";
}

function init() {
  setupSidebar();
  loadAttendance();
  setupMeetingForm();
  setupRosterUpload();
}

// Sidebar navigation: show the selected section, hide the rest
function setupSidebar() {
  document.querySelectorAll(".sidenav [data-section]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      document.querySelectorAll(".section-panel").forEach((panel) => {
        panel.hidden = true;
      });
      document.getElementById("section-" + link.dataset.section).hidden = false;
    });
  });
}

async function loadAttendance() {
  const rowsEl = document.getElementById("attendanceRows");

  const { data, error } = await supabaseClient
    .from("attendance")
    .select("timed_in_at, students(student_number, full_name), meetings(title)")
    .order("timed_in_at", { ascending: false })
    .limit(100);

  if (error) {
    rowsEl.innerHTML = `<tr><td colspan="4">Couldn't load attendance: ${error.message}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    rowsEl.innerHTML = `<tr><td colspan="4">No records yet</td></tr>`;
    return;
  }

  rowsEl.innerHTML = data
    .map((row) => `
      <tr>
        <td>${row.students?.student_number ?? ""}</td>
        <td>${row.students?.full_name ?? ""}</td>
        <td>${new Date(row.timed_in_at).toLocaleString()}</td>
        <td>${row.meetings?.title ?? ""}</td>
      </tr>
    `)
    .join("");
}

function setupMeetingForm() {
  const form = document.getElementById("startMeetingForm");
  const noOpenMeeting = document.getElementById("noOpenMeeting");
  const openMeeting = document.getElementById("openMeeting");
  const meetingsError = document.getElementById("meetingsError");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    meetingsError.hidden = true;

    const title = document.getElementById("meetingTitle").value.trim();
    const meetingCode = document.getElementById("meetingCode").value.trim();
    const durationMinutes = Number(document.getElementById("meetingDuration").value);

    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Starting...";

    try {
      const { data, error } = await supabaseClient.functions.invoke("start-meeting", {
        body: { title, meetingCode, expiresAt },
      });

      if (error) {
        const body = await readEdgeFunctionBody(error);
        meetingsError.textContent = body.error || "Couldn't start the meeting.";
        meetingsError.hidden = false;
        return;
      }

      showOpenMeeting(data.meeting, data.attendanceUrl);
    } catch (err) {
      meetingsError.textContent = "Couldn't start the meeting. Please try again.";
      meetingsError.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Start Meeting";
    }
  });

  function showOpenMeeting(meeting, attendanceUrl) {
    noOpenMeeting.hidden = true;
    openMeeting.hidden = false;
    document.getElementById("openMeetingTitle").textContent = meeting.title;
    document.getElementById("openMeetingExpiry").textContent =
      "Open until " + new Date(meeting.expiresAt).toLocaleString();
    renderQr(document.getElementById("qr"), attendanceUrl);
  }
}

// Parses "student_number,full_name" lines. Skips blank lines and a header
// row if present. Quoted CSV fields (commas/quotes inside a name) are
// unwrapped; this is intentionally simple, not a full CSV parser.
function parseRosterText(text) {
  const rows = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const [rawNumber, ...rest] = line.split(",");
    const studentNumber = (rawNumber ?? "").trim().replace(/^"|"$/g, "");
    const fullName = rest.join(",").trim().replace(/^"|"$/g, "");

    if (/student.?number/i.test(studentNumber) && /name/i.test(fullName)) continue; // header row
    if (!studentNumber || !fullName) continue;

    rows.push({ studentNumber, fullName });
  }
  return rows;
}

function setupRosterUpload() {
  const fileInput = document.getElementById("rosterFile");
  const textArea = document.getElementById("rosterText");
  const uploadBtn = document.getElementById("uploadRosterBtn");
  const resultEl = document.getElementById("rosterResult");

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    textArea.value = await file.text();
  });

  uploadBtn.addEventListener("click", async () => {
    resultEl.hidden = true;

    const students = parseRosterText(textArea.value);
    if (students.length === 0) {
      resultEl.textContent = "No valid rows found. Use one 'student_number,full_name' pair per line.";
      resultEl.hidden = false;
      return;
    }

    uploadBtn.disabled = true;
    uploadBtn.textContent = "Uploading...";

    try {
      const { data, error } = await supabaseClient.functions.invoke("upsert-students", {
        body: { students },
      });

      if (error) {
        const body = await readEdgeFunctionBody(error);
        resultEl.textContent = body.error || "Couldn't upload the roster.";
      } else {
        resultEl.textContent = `Added/updated ${data.upserted} student(s).`;
        textArea.value = "";
        fileInput.value = "";
      }
      resultEl.hidden = false;
    } catch {
      resultEl.textContent = "Couldn't upload the roster. Please try again.";
      resultEl.hidden = false;
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = "Add / Update Students";
    }
  });
}
