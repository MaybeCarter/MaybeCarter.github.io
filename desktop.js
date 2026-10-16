(() => {
  const desktop = document.getElementById("desktop");
  const narrow = matchMedia("(max-width: 640px)");
  const coarse = matchMedia("(pointer: coarse)");
  const calm = matchMedia("(prefers-reduced-motion: reduce)");
  const STORE = "cs-desktop-v1";

  // Where each window opens the first time, as fractions of the desktop.
  const defaults = {
    readme:   { x: 0.08, y: 0.06 },
    about:    { x: 0.42, y: 0.10 },
    projects: { x: 0.22, y: 0.24 },
    contact:  { x: 0.50, y: 0.40 },
    trash:    { x: 0.36, y: 0.30 },
    oldsite:  { x: 0.18, y: 0.08 },
    site:     { x: 0.30, y: 0.16 },
  };

  const wins = {};
  document.querySelectorAll(".win").forEach((el) => (wins[el.dataset.win] = el));

  document.documentElement.classList.add("js");

  let state = { pos: {}, open: ["readme"], icons: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE));
    if (saved && saved.pos && Array.isArray(saved.open)) state = { icons: {}, ...saved };
  } catch {}
  const save = () => {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {}
  };

  let topZ = 10;

  /* ---------- Placement ---------- */

  function clamp(el, x, y) {
    const d = desktop.getBoundingClientRect();
    const w = el.offsetWidth;
    const maxX = d.width - Math.min(w, 120);
    const minX = Math.min(0, -(w - 120));
    return {
      x: Math.round(Math.max(minX, Math.min(x, maxX))),
      y: Math.round(Math.max(0, Math.min(y, d.height - 30))),
    };
  }

  function place(id) {
    const el = wins[id];
    if (narrow.matches) return;
    const d = desktop.getBoundingClientRect();
    const saved = state.pos[id];
    const def = defaults[id] || { x: 0.2, y: 0.1 };
    const p = clamp(el, saved ? saved.x : def.x * d.width, saved ? saved.y : def.y * d.height);
    el.style.left = p.x + "px";
    el.style.top = p.y + "px";
  }

  /* ---------- Zoom rectangles ---------- */

  function zoom(from, to) {
    if (calm.matches || !from || !to) return Promise.resolve();
    const steps = 7;
    const rects = [];
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const r = document.createElement("div");
      r.className = "zoom-rect";
      r.style.left = from.left + (to.left - from.left) * t + "px";
      r.style.top = from.top + (to.top - from.top) * t + "px";
      r.style.width = from.width + (to.width - from.width) * t + "px";
      r.style.height = from.height + (to.height - from.height) * t + "px";
      r.style.opacity = 0;
      document.body.appendChild(r);
      rects.push(r);
    }
    return new Promise((done) => {
      rects.forEach((r, i) => {
        setTimeout(() => (r.style.opacity = 1), i * 22);
        setTimeout(() => r.remove(), i * 22 + 70);
      });
      setTimeout(done, steps * 22 + 20);
    });
  }

  function sourceRect(id) {
    const icon = document.querySelector(`.icon[data-open="${id}"]`);
    const img = icon && icon.querySelector("img");
    return img ? img.getBoundingClientRect() : null;
  }

  /* ---------- Window lifecycle ---------- */

  function focusWin(id) {
    const el = wins[id];
    if (!el) return;
    el.style.zIndex = ++topZ;
    Object.values(wins).forEach((w) => w.classList.toggle("active", w === el));
  }

  function topmost() {
    return Object.values(wins)
      .filter((w) => !w.hidden)
      .sort((a, b) => (+b.style.zIndex || 0) - (+a.style.zIndex || 0))[0];
  }

  async function openWin(id, fromRect, { animate = true } = {}) {
    const el = wins[id];
    if (!el) return;
    if (!el.hidden) {
      focusWin(id);
      el.querySelector(".body").focus({ preventScroll: true });
      return;
    }
    el.style.visibility = "hidden";
    el.hidden = false;
    place(id);
    const to = el.getBoundingClientRect();
    if (animate) await zoom(fromRect || sourceRect(id), to);
    el.style.visibility = "";
    focusWin(id);
    if (animate) el.querySelector(".body").focus({ preventScroll: true });
    if (!state.open.includes(id)) state.open.push(id);
    save();
  }

  async function closeWin(id) {
    const el = wins[id];
    if (!el || el.hidden) return;
    const from = el.getBoundingClientRect();
    el.hidden = true;
    el.classList.remove("active", "shaded");
    state.open = state.open.filter((x) => x !== id);
    save();
    await zoom(from, sourceRect(id));
    const next = topmost();
    if (next) focusWin(next.dataset.win);
    const icon = document.querySelector(`.icon[data-open="${id}"]`);
    if (icon && document.activeElement === document.body) icon.focus({ preventScroll: true });
  }

  function toggleShade(id) {
    const el = wins[id];
    const shaded = el.classList.toggle("shaded");
    el.querySelector(".shade").setAttribute("aria-expanded", String(!shaded));
  }

  /* ---------- Dragging ---------- */

  Object.entries(wins).forEach(([id, el]) => {
    const bar = el.querySelector(".titlebar");
    let start = null;

    el.addEventListener("pointerdown", () => focusWin(id));

    bar.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".box") || narrow.matches || e.button !== 0) return;
      start = { px: e.clientX, py: e.clientY, x: el.offsetLeft, y: el.offsetTop };
      bar.setPointerCapture(e.pointerId);
    });
    bar.addEventListener("pointermove", (e) => {
      if (!start) return;
      const p = clamp(el, start.x + e.clientX - start.px, start.y + e.clientY - start.py);
      el.style.left = p.x + "px";
      el.style.top = p.y + "px";
    });
    const stop = () => {
      if (!start) return;
      start = null;
      state.pos[id] = { x: el.offsetLeft, y: el.offsetTop };
      save();
    };
    bar.addEventListener("pointerup", stop);
    bar.addEventListener("pointercancel", stop);

    bar.addEventListener("dblclick", (e) => {
      if (!e.target.closest(".box")) toggleShade(id);
    });
    el.querySelector(".close").addEventListener("click", () => closeWin(id));
    el.querySelector(".shade").addEventListener("click", () => toggleShade(id));
  });

  /* ---------- Desktop icons ---------- */

  const icons = [...document.querySelectorAll(".icon")];
  const select = (icon) => icons.forEach((i) => i.classList.toggle("selected", i === icon));

  // On wide screens icons sit wherever they were last dropped. Unmoved icons
  // keep the Finder's default spots: a column down the right, Trash at the bottom.
  function layoutIcons() {
    icons.forEach((icon) => {
      const slot = icon.parentElement;
      slot.style.left = slot.style.top = "";
    });
    if (narrow.matches) return;
    const d = desktop.getBoundingClientRect();
    let nextY = 16;
    icons.forEach((icon) => {
      const slot = icon.parentElement;
      const w = slot.offsetWidth;
      const h = slot.offsetHeight;
      const isTrash = slot.classList.contains("trash-slot");
      const def = { x: d.width - 16 - w, y: isTrash ? d.height - 16 - h : nextY };
      if (!isTrash) nextY += h + 18;
      const p = state.icons[icon.dataset.open] || def;
      slot.style.left = Math.max(0, Math.min(p.x, d.width - w)) + "px";
      slot.style.top = Math.max(0, Math.min(p.y, d.height - h)) + "px";
    });
  }

  let drag = null;
  let justDragged = false;

  icons.forEach((icon) => {
    const slot = icon.parentElement;
    const id = icon.dataset.open;

    icon.addEventListener("pointerdown", (e) => {
      if (narrow.matches || e.button !== 0) return;
      select(icon);
      drag = { px: e.clientX, py: e.clientY, x: slot.offsetLeft, y: slot.offsetTop, moved: false };
      icon.setPointerCapture(e.pointerId);
    });
    icon.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.px;
      const dy = e.clientY - drag.py;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < 4) return;
        drag.moved = true;
        slot.classList.add("dragging");
      }
      const d = desktop.getBoundingClientRect();
      slot.style.left = Math.max(0, Math.min(drag.x + dx, d.width - slot.offsetWidth)) + "px";
      slot.style.top = Math.max(0, Math.min(drag.y + dy, d.height - slot.offsetHeight)) + "px";
    });
    const drop = () => {
      if (!drag) return;
      if (drag.moved) {
        slot.classList.remove("dragging");
        state.icons[id] = { x: slot.offsetLeft, y: slot.offsetTop };
        save();
        // The click that follows a drop shouldn't count as a click.
        justDragged = true;
        setTimeout(() => (justDragged = false), 300);
      }
      drag = null;
    };
    icon.addEventListener("pointerup", drop);
    icon.addEventListener("pointercancel", drop);
    icon.addEventListener("dragstart", (e) => e.preventDefault());

    icon.addEventListener("click", (e) => {
      if (justDragged) return;
      select(icon);
      // Keyboard (detail 0), touch, and the narrow dock open on one press.
      if (e.detail === 0 || coarse.matches || narrow.matches) openWin(id);
    });
    icon.addEventListener("dblclick", () => {
      if (!justDragged) openWin(id);
    });
  });

  layoutIcons();

  desktop.addEventListener("pointerdown", (e) => {
    if (e.target === desktop || e.target.classList.contains("icons")) select(null);
  });

  // Links inside windows that open other windows.
  document.querySelectorAll(".win [data-open]").forEach((btn) => {
    btn.addEventListener("click", () => openWin(btn.dataset.open, btn.getBoundingClientRect()));
  });

  /* ---------- Menus ---------- */

  const menus = [...document.querySelectorAll(".menu")];
  const closeMenus = () =>
    menus.forEach((m) => {
      m.querySelector(".menu-title").setAttribute("aria-expanded", "false");
      m.querySelector(".menu-list").hidden = true;
    });

  menus.forEach((m) => {
    const title = m.querySelector(".menu-title");
    const list = m.querySelector(".menu-list");
    title.addEventListener("click", () => {
      const wasOpen = title.getAttribute("aria-expanded") === "true";
      closeMenus();
      if (!wasOpen) {
        title.setAttribute("aria-expanded", "true");
        list.hidden = false;
      }
    });
    // Classic menu bar: once one menu is open, hovering another switches to it.
    title.addEventListener("pointerenter", () => {
      if (menus.some((o) => o !== m && !o.querySelector(".menu-list").hidden)) title.click();
    });
    list.addEventListener("click", (e) => {
      const item = e.target.closest("button");
      if (!item) return;
      closeMenus();
      if (item.dataset.open) openWin(item.dataset.open, title.getBoundingClientRect());
      if (item.dataset.action === "close") { const t = topmost(); if (t) closeWin(t.dataset.win); }
      if (item.dataset.action === "closeall") Object.keys(wins).forEach((id) => !wins[id].hidden && closeWin(id));
      if (item.dataset.action === "cleanup-desktop") {
        state.icons = {};
        save();
        layoutIcons();
      }
      if (item.dataset.action === "cleanup") {
        state.pos = {};
        save();
        Object.keys(wins).forEach((id) => !wins[id].hidden && place(id));
      }
    });
  });

  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".menu")) closeMenus();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (menus.some((m) => !m.querySelector(".menu-list").hidden)) return closeMenus();
    const t = topmost();
    if (t) closeWin(t.dataset.win);
  });

  /* ---------- Clock ---------- */

  const clock = document.getElementById("clock");
  const tick = () => {
    const now = new Date();
    clock.dateTime = now.toISOString();
    clock.textContent = now.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }).replace(",", "");
  };
  tick();
  setInterval(tick, 10000);

  /* ---------- Startup ---------- */

  addEventListener("resize", () => {
    layoutIcons();
    Object.keys(wins).forEach((id) => !wins[id].hidden && place(id));
  });

  const startup = state.open.filter((id) => wins[id]);
  startup.forEach((id) => openWin(id, null, { animate: false }));
  if (!startup.length) select(null);
})();
