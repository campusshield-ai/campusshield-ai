/* CampusShield AI — ShieldMind interactive study-room prompt builder.
 * Uses the existing ShieldMind conversation flow. It only drafts a prompt;
 * the learner reviews it and submits it through the normal paid AI workflow.
 */
(() => {
  "use strict";

  const form = document.getElementById("shieldmind-study-room-form");
  if (!form || form.dataset.initialized === "true") return;
  form.dataset.initialized = "true";

  const byId = (id) => document.getElementById(id);
  const formats = {
    guided: {
      title: "guided interactive lesson",
      instructions: "Teach in short, clearly titled sections. Start with 3 measurable learning objectives. Explain each idea in plain language, use a relevant university-level analogy and one worked example, then ask a short understanding check. Wait for my response before moving to the next section. Correct misunderstandings kindly and adapt the next step."
    },
    quiz: {
      title: "one-question-at-a-time quiz",
      instructions: "Act as an adaptive tutor. Ask one question, then stop and wait for my answer. Do not reveal the correct answer or explanation before I respond. After my attempt, explain the reasoning, give a hint if I am stuck, and adjust the next question to my demonstrated understanding. Finish with a concise review of strengths and topics to revisit."
    },
    simulation: {
      title: "practical scenario simulation",
      instructions: "Create a realistic, safe academic scenario related to the topic. Present the context and one decision at a time. Wait for my choice before revealing consequences. Explain the concept behind each outcome, allow me to try again and end with a debrief connecting the scenario to the course."
    },
    exam: {
      title: "exam revision session",
      instructions: "Run a structured exam-revision session. Start with a quick diagnostic question, then cover the highest-value concepts and common misconceptions. Give exam-style questions one at a time and wait for my answer before showing a worked solution. Finish with a compact revision checklist and a short list of concepts I should practise again. Make clear that your questions and feedback are practice material, not official university examination content or grades."
    }
  };

  function setStatus(message, state = "info") {
    const node = byId("shieldmind-study-room-status");
    if (!node) return;
    node.textContent = message;
    node.dataset.state = state;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const topic = String(byId("shieldmind-study-topic")?.value || "").trim();
    const course = String(byId("shieldmind-study-course")?.value || "").trim();
    const level = String(byId("shieldmind-study-level")?.value || "University beginner");
    const formatKey = String(byId("shieldmind-study-format")?.value || "guided");
    const duration = String(byId("shieldmind-study-duration")?.value || "25 minutes");
    const goal = String(byId("shieldmind-study-goal")?.value || "").trim();
    const question = byId("shieldmind-question");

    if (topic.length < 2 || topic.length > 160) {
      setStatus("Enter a topic between 2 and 160 characters.", "error");
      byId("shieldmind-study-topic")?.focus();
      return;
    }
    if (!question) {
      setStatus("Ask ShieldMind is not ready. Reopen the ShieldMind page and try again.", "error");
      return;
    }

    const format = formats[formatKey] || formats.guided;
    const prompt = [
      "Build an interactive " + format.title + " for me.",
      "Course / subject: " + (course || "Not specified; ask me if needed."),
      "Topic: " + topic,
      "Study level: " + level,
      "Time available: " + duration,
      goal ? "Learning goal: " + goal : "",
      "Teaching approach: " + format.instructions,
      "Session rules: keep the pacing appropriate for the time available; use accurate, relevant examples; ask me to clarify if the topic is too broad; do not invent citations, university policies, lecturer instructions or official marking schemes. State uncertainty when necessary. Use accessible language and define technical terms.",
      "Begin now with a brief welcome, the session roadmap and the first learning step. Do not send the full lesson all at once."
    ].filter(Boolean).join("\n\n");

    if (prompt.length > 1150) {
      setStatus("This study setup is too long. Shorten the course or learning goal and try again.", "error");
      return;
    }

    question.value = prompt;
    question.dispatchEvent(new Event("input", { bubbles: true }));
    question.focus();
    question.scrollIntoView({ behavior: "smooth", block: "center" });
    setStatus("Your study-session draft is ready in Ask ShieldMind. Review it, then press “Ask ShieldMind” when you are ready. Nothing has been sent yet.", "success");
  });
})();
