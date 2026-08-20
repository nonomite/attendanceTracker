const params = new URLSearchParams(window.location.search);
const meetingToken = params.get("t");

const noMeetingMessage = document.getElementById("noMeetingMessage");
const timeInForm = document.getElementById("timeInForm");
const timeInBtn = document.getElementById("timeInBtn");
const resultMessage = document.getElementById("resultMessage");

const STATUS_TEXT = {
  recorded: "You're checked in. See you at the meeting!",
  already_checked_in: "You've already timed in for this meeting.",
  meeting_closed: "This meeting is no longer accepting time-ins.",
  invalid_token: "This QR code isn't valid. Ask your admin for the current one.",
  student_not_recognized: "We couldn't find that Student ID. Double-check and try again.",
  invalid_request: "Please enter your Student ID.",
  error: "Something went wrong. Please try again.",
};

function showResult(text) {
  resultMessage.textContent = text;
  resultMessage.hidden = false;
}

if (!meetingToken) {
  timeInForm.hidden = true;
  noMeetingMessage.hidden = false;
} else {
  timeInForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const studentNumber = document.getElementById("studentID").value.trim();
    if (!studentNumber) return;

    timeInBtn.disabled = true;
    timeInBtn.textContent = "Submitting...";
    resultMessage.hidden = true;

    try {
      const { data, error } = await supabaseClient.functions.invoke("time-in", {
        body: { token: meetingToken, studentNumber },
      });

      if (error) {
        showResult(STATUS_TEXT.error);
      } else {
        showResult(STATUS_TEXT[data.status] ?? STATUS_TEXT.error);
        if (data.status === "recorded" || data.status === "already_checked_in") {
          timeInForm.hidden = true;
        }
      }
    } catch {
      showResult(STATUS_TEXT.error);
    } finally {
      timeInBtn.disabled = false;
      timeInBtn.textContent = "Time In";
    }
  });
}
