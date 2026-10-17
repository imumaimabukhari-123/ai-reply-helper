// The reply panel: message box, tone/goal options, and 3 AI replies with Copy buttons.
// Shared by the extension popup and the website. Usage:
//   ARH.mount(container, { api: "https://…", message: "text", save: (prefs) => {}, prefs: {} })
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const TONES = [["professional", "💼 Professional"], ["friendly", "😊 Friendly"], ["short", "⚡ Short"], ["formal", "🎩 Formal"], ["enthusiastic", "🎉 Enthusiastic"]];
  const GOALS = [["auto", "Let AI decide"], ["yes", "Say yes / accept"], ["no", "Politely say no"], ["info", "Ask for more details"], ["thanks", "Say thank you"], ["later", "I'll get back to you"]];
  const LENGTHS = [["short", "Short"], ["medium", "Medium"], ["long", "Long"]];

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back below */ }
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy"); ta.remove(); return ok;
  }

  function mount(el, opts) {
    const prefs = { tone: "professional", goal: "auto", length: "medium", ...(opts.prefs || {}) };
    el.classList.add("arh");
    el.innerHTML = `
      <div class="field">
        <label class="lbl" for="arh-msg">Message you received</label>
        <textarea id="arh-msg" maxlength="6000" placeholder="Select a message on the page, or paste it here…">${esc(opts.message || "")}</textarea>
      </div>
      <div class="field">
        <label class="lbl">Tone</label>
        <div class="chips" data-tones>${TONES.map(([v, l]) => `<button type="button" class="chip" data-v="${v}" aria-pressed="${v === prefs.tone}">${l}</button>`).join("")}</div>
      </div>
      <div class="row field">
        <div><label class="lbl" for="arh-goal">What do you want to say?</label>
          <select id="arh-goal">${GOALS.map(([v, l]) => `<option value="${v}" ${v === prefs.goal ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div><label class="lbl" for="arh-len">Length</label>
          <select id="arh-len">${LENGTHS.map(([v, l]) => `<option value="${v}" ${v === prefs.length ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      </div>
      <div class="field">
        <label class="lbl" for="arh-note">Add a detail (optional)</label>
        <input type="text" id="arh-note" maxlength="500" placeholder="e.g. I'm free on Friday after 2pm">
        <div class="hint">The AI only uses facts you give it. It won't make up dates or prices.</div>
      </div>
      <button class="btn" type="button" data-go>✨ Write 3 replies</button>
      <div data-out></div>`;

    const $ = (s) => el.querySelector(s);
    const msg = $("#arh-msg"), out = $("[data-out]"), go = $("[data-go]");
    el.querySelectorAll("[data-tones] .chip").forEach((b) => b.addEventListener("click", () => {
      prefs.tone = b.dataset.v;
      el.querySelectorAll("[data-tones] .chip").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      opts.save?.(prefs);
    }));
    $("#arh-goal").addEventListener("change", (e) => { prefs.goal = e.target.value; opts.save?.(prefs); });
    $("#arh-len").addEventListener("change", (e) => { prefs.length = e.target.value; opts.save?.(prefs); });

    go.addEventListener("click", async () => {
      const message = msg.value.trim();
      if (message.length < 2) { out.innerHTML = `<div class="error">Select or paste the message you want to reply to first.</div>`; msg.focus(); return; }
      go.disabled = true;
      out.innerHTML = `<div class="loading"><div class="spinner"></div>Writing replies…</div>`;
      try {
        const resp = await fetch(opts.api + "/api/reply", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, tone: prefs.tone, goal: prefs.goal, length: prefs.length, note: $("#arh-note").value.trim() }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Couldn't write replies. Please try again.");
        out.innerHTML = `<div class="results">
          ${data.language ? `<div class="lang">Replying in ${esc(data.language)}</div>` : ""}
          ${data.replies.map((r, i) => `<div class="reply"><p class="text">${esc(r)}</p>
            <div class="bar"><span class="opt">Option ${i + 1}</span><button class="btn small" type="button" data-copy="${i}">Copy</button></div></div>`).join("")}
          <button class="btn ghost" type="button" data-again>↻ Try different replies</button></div>`;
        out.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
          const ok = await copy(data.replies[+b.dataset.copy]);
          b.textContent = ok ? "Copied ✓" : "Couldn't copy";
          setTimeout(() => (b.textContent = "Copy"), 1500);
        }));
        out.querySelector("[data-again]").addEventListener("click", () => go.click());
      } catch (e) {
        out.innerHTML = `<div class="error">${esc(e.message === "Failed to fetch" ? "Couldn't reach the AI. Check your internet connection." : e.message)}</div>`;
      } finally {
        go.disabled = false;
      }
    });
    if (!msg.value) msg.focus();
  }

  window.ARH = { mount };
})();
