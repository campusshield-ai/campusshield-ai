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
      instructions: "Teach in short titled sections. Give 3 learning objectives, explain plainly, add one university-level analogy and a worked example. Ask one understanding-check question and wait for my reply before continuing; adapt to my answer."
    },
    quiz: {
      title: "one-question-at-a-time quiz",
      instructions: "Ask one question at a time and wait. Do not reveal the answer early. After my response, explain the reasoning, offer a hint when useful, adapt difficulty and recap topics to revisit."
    },
    simulation: {
      title: "practical scenario simulation",
      instructions: "Present a realistic academic scenario, one decision at a time. Wait for my choice, explain the consequence and concept, allow a retry, and finish with a debrief."
    },
    exam: {
      title: "exam revision session",
      instructions: "Start with a diagnostic question; review key concepts and common errors. Ask one exam-style question at a time, wait for my answer, then explain with a worked solution. Finish with a revision checklist and label practice questions as unofficial."
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
      "Session rules: use accurate examples and plain language. Define technical terms; clarify ambiguity. Never invent citations, campus policies or lecturer instructions.",
      "Begin now: welcome me, show a roadmap and start with one step. Keep the session interactive."
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
