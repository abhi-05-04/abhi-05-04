(() => {
  "use strict";
  const canvas = document.querySelector("#gameCanvas");
  const ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  const screens = { menu: $("menuScreen"), upgrade: $("upgradeScreen"), pause: $("pauseScreen"), over: $("gameOverScreen") };
  const keys = new Set();
  const mouse = { x: 0, y: 0, down: false };
  const touchMove = { x: 0, y: 0, active: false };
  let touchFire = false;
  const levelRules = {
    1: { spawnMultiplier: 2, fireAngles: [-15, 0, 15] },
    2: { spawnMultiplier: 2, fireAngles: [0] },
    3: { spawnMultiplier: 1, fireAngles: [0] }
  };
  let selectedLevel = 1;
  const upgrades = [
    { key: "RAPID", title: "Overclocked coil", desc: "Fire rate +25%", apply: p => p.fireDelay *= .75 },
    { key: "HARDEN", title: "Reactive plating", desc: "Maximum hull +1", apply: p => { p.maxHp++; p.hp++; } },
    { key: "PULSE", title: "Salvage magnet", desc: "Pull shards from farther away", apply: p => p.magnet += 45 }
  ];
  let W, H, dpr, state = "menu", last = 0, audio;
  let player, bullets = [], enemies = [], shards = [], particles = [], score = 0, wave = 1, waveTimer = 0, spawnTimer = 0, shake = 0, best;
  best = Number(localStorage.getItem("neon-salvager-best") || 0);
  $("menuHighScore").textContent = best.toLocaleString();

  function resize() { dpr = Math.min(devicePixelRatio || 1, 2); W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  addEventListener("resize", resize); resize();
  addEventListener("keydown", e => {
    const key = e.key.toLowerCase();
    if (state === "play" && key.startsWith("arrow")) e.preventDefault();
    keys.add(key);
    if (e.key === "Escape") togglePause();
    if (e.key === " " && state === "play") dash();
  });
  addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
  canvas.addEventListener("mousemove", e => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
  canvas.addEventListener("mousedown", () => { mouse.down = true; startAudio(); });
  addEventListener("mouseup", () => mouse.down = false);
  $("startButton").onclick = startGame; $("restartButton").onclick = startGame; $("menuButton").onclick = returnMenu;
  $("pauseButton").onclick = togglePause; $("resumeButton").onclick = togglePause;
  setupTouchControls();
  document.querySelectorAll(".level-card").forEach(card => {
    card.onclick = () => {
      selectedLevel = Number(card.dataset.level);
      document.querySelectorAll(".level-card").forEach(option => option.classList.toggle("selected", option === card));
    };
  });

  function startAudio() { if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === "suspended") audio.resume(); }
  function beep(freq, duration = .06, type = "sine", volume = .025) { if (!audio) return; const o = audio.createOscillator(), g = audio.createGain(); o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(volume, audio.currentTime); g.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration); o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + duration); }
  function show(screen) { Object.values(screens).forEach(s => s.classList.add("hidden")); if (screen) screen.classList.remove("hidden"); }
  function startGame() {
    startAudio(); state = "play"; score = 0; wave = 1; waveTimer = 0; spawnTimer = .3; shake = 0;
    player = { x: W / 2, y: H / 2, r: 14, speed: 260, hp: 3, maxHp: 3, fireDelay: .16, fire: 0, dash: 0, magnet: 80, invuln: 0 };
    player.level = selectedLevel; bullets = []; enemies = []; shards = []; particles = []; show(null); $("hud").classList.remove("hidden"); updateHud();
    $("touchControls").classList.remove("hidden");
  }
  function returnMenu() { state = "menu"; show(screens.menu); $("hud").classList.add("hidden"); $("touchControls").classList.add("hidden"); $("menuHighScore").textContent = best.toLocaleString(); }
  function togglePause() { if (state === "play") { state = "pause"; $("touchControls").classList.add("hidden"); show(screens.pause); } else if (state === "pause") { state = "play"; $("touchControls").classList.remove("hidden"); show(null); } }
  function setupTouchControls() {
    const joystick = $("joystick"), knob = $("joystickKnob"), firePad = $("firePad"), dashButton = $("touchDash");
    let joystickPointer = null, firePointer = null;
    const updateJoystick = (event) => {
      const rect = joystick.getBoundingClientRect(), radius = rect.width * .36;
      let x = event.clientX - (rect.left + rect.width / 2), y = event.clientY - (rect.top + rect.height / 2);
      const distance = Math.hypot(x, y), scale = Math.min(1, radius / (distance || 1));
      x *= scale; y *= scale; touchMove.x = x / radius; touchMove.y = y / radius;
      knob.style.transform = `translate(${x}px, ${y}px)`;
    };
    const resetJoystick = () => { joystickPointer = null; touchMove.x = 0; touchMove.y = 0; knob.style.transform = ""; };
    joystick.addEventListener("pointerdown", event => { if (state !== "play") return; joystickPointer = event.pointerId; joystick.setPointerCapture(event.pointerId); updateJoystick(event); });
    joystick.addEventListener("pointermove", event => { if (event.pointerId === joystickPointer) updateJoystick(event); });
    joystick.addEventListener("pointerup", resetJoystick); joystick.addEventListener("pointercancel", resetJoystick);
    const updateAim = event => { const rect = canvas.getBoundingClientRect(); mouse.x = event.clientX - rect.left; mouse.y = event.clientY - rect.top; };
    firePad.addEventListener("pointerdown", event => { if (state !== "play") return; firePointer = event.pointerId; firePad.setPointerCapture(event.pointerId); touchFire = true; updateAim(event); startAudio(); });
    firePad.addEventListener("pointermove", event => { if (event.pointerId === firePointer) updateAim(event); });
    const resetFire = event => { if (event.pointerId === firePointer) { firePointer = null; touchFire = false; } };
    firePad.addEventListener("pointerup", resetFire); firePad.addEventListener("pointercancel", resetFire);
    dashButton.addEventListener("pointerdown", event => { event.preventDefault(); if (state === "play") { dash(); startAudio(); } });
  }
  function dash() { if (player.dash > 0) return; const dx = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0) + (keys.has("arrowright") ? 1 : 0) - (keys.has("arrowleft") ? 1 : 0), dy = (keys.has("s") ? 1 : 0) - (keys.has("w") ? 1 : 0) + (keys.has("arrowdown") ? 1 : 0) - (keys.has("arrowup") ? 1 : 0); if (!dx && !dy) return; player.x += dx * 100; player.y += dy * 100; player.x = Math.max(25, Math.min(W - 25, player.x)); player.y = Math.max(25, Math.min(H - 25, player.y)); player.dash = 1.3; player.invuln = .22; burst(player.x, player.y, "#6df7d0", 16); beep(480, .12, "sawtooth", .04); }

  function spawnEnemy() {
    const edge = Math.floor(Math.random() * 4), pos = edge === 0 ? { x: Math.random() * W, y: -25 } : edge === 1 ? { x: W + 25, y: Math.random() * H } : edge === 2 ? { x: Math.random() * W, y: H + 25 } : { x: -25, y: Math.random() * H };
    const shooter = wave >= 2 && Math.random() < .25;
    enemies.push({ ...pos, r: shooter ? 14 : 11, speed: shooter ? 48 + wave * 4 : 72 + wave * 8, hp: shooter ? 3 : 1, maxHp: shooter ? 3 : 1, shooter, shot: 1.2 + Math.random() });
  }
  function shoot() { if (player.fire > 0) return; const a = Math.atan2(mouse.y - player.y, mouse.x - player.x); levelRules[player.level].fireAngles.forEach(offset => { const angle = a + offset * Math.PI / 180; bullets.push({ x: player.x + Math.cos(angle) * 18, y: player.y + Math.sin(angle) * 18, vx: Math.cos(angle) * 650, vy: Math.sin(angle) * 650, life: 1 }); }); player.fire = player.fireDelay; beep(190, .045, "square", .018); }
  function damage() { if (player.invuln > 0) return; player.hp--; player.invuln = 1; shake = 10; burst(player.x, player.y, "#ff6b9d", 20); beep(90, .2, "sawtooth", .05); if (player.hp <= 0) endGame(false); }
  function endGame(victory) { state = "over"; const isBest = score > best; if (isBest) { best = score; localStorage.setItem("neon-salvager-best", best); } $("resultEyebrow").textContent = victory ? "STATION SECURED" : "RUN TERMINATED"; $("resultTitle").textContent = victory ? "SALVAGE COMPLETE" : "HULL BREACH"; $("resultCopy").textContent = victory ? "Five sectors cleared. The station can breathe again." : "The swarm took the station. The salvage is still out there."; $("finalScore").textContent = score.toLocaleString(); $("finalBest").textContent = best.toLocaleString(); $("finalWave").textContent = String(wave).padStart(2, "0"); show(screens.over); $("hud").classList.add("hidden"); $("touchControls").classList.add("hidden"); beep(victory ? 660 : 70, .35, victory ? "sine" : "sawtooth", .05); }

  function update(dt) {
    if (state !== "play") return;
    player.fire -= dt; player.dash -= dt; player.invuln -= dt; waveTimer += dt; spawnTimer -= dt;
    if (spawnTimer <= 0) { spawnEnemy(); spawnTimer = Math.max(.28, .9 - wave * .1) * (0.7 + Math.random() * .5) * levelRules[player.level].spawnMultiplier; }
    if (waveTimer > 22) { if (wave >= 5) return endGame(true); wave++; waveTimer = 0; showUpgrade(); }
    let dx = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0) + touchMove.x, dy = (keys.has("s") ? 1 : 0) - (keys.has("w") ? 1 : 0) + touchMove.y;
    dx += (keys.has("arrowright") ? 1 : 0) - (keys.has("arrowleft") ? 1 : 0);
    dy += (keys.has("arrowdown") ? 1 : 0) - (keys.has("arrowup") ? 1 : 0);
    const len = Math.hypot(dx, dy) || 1;
    player.x = Math.max(20, Math.min(W - 20, player.x + dx / len * player.speed * dt)); player.y = Math.max(20, Math.min(H - 20, player.y + dy / len * player.speed * dt));
    if (mouse.down || touchFire) shoot();
    bullets.forEach(b => { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; });
    bullets = bullets.filter(b => b.life > 0 && b.x > -20 && b.x < W + 20 && b.y > -20 && b.y < H + 20);
    enemies.forEach(e => { const a = Math.atan2(player.y - e.y, player.x - e.x), dist = Math.hypot(player.x - e.x, player.y - e.y); if (e.shooter && dist < 330) { e.x -= Math.cos(a) * e.speed * .35 * dt; e.y -= Math.sin(a) * e.speed * .35 * dt; e.shot -= dt; if (e.shot <= 0) { bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190, life: 3, hostile: true }); e.shot = 2; } } else { e.x += Math.cos(a) * e.speed * dt; e.y += Math.sin(a) * e.speed * dt; } if (dist < e.r + player.r) damage(); });
    bullets.forEach(b => { if (b.hostile && Math.hypot(b.x - player.x, b.y - player.y) < player.r + 5) { b.life = 0; damage(); } });
    enemies.forEach(e => bullets.forEach(b => { if (!b.hostile && b.life > 0 && Math.hypot(b.x - e.x, b.y - e.y) < e.r + 5) { b.life = 0; e.hp--; burst(b.x, b.y, "#ffd166", 4); if (e.hp <= 0) { e.dead = true; score += e.shooter ? 80 : 30; shards.push({ x: e.x, y: e.y, r: 5, life: 8 }); burst(e.x, e.y, e.shooter ? "#ff6b9d" : "#6df7d0", 12); beep(e.shooter ? 300 : 440, .07, "triangle", .02); } } }));
    enemies = enemies.filter(e => !e.dead); shards.forEach(s => { const a = Math.atan2(player.y - s.y, player.x - s.x), d = Math.hypot(player.x - s.x, player.y - s.y); if (d < player.magnet) { s.x += Math.cos(a) * (d < 30 ? 280 : 80) * dt; s.y += Math.sin(a) * (d < 30 ? 280 : 80) * dt; } if (d < 20) { s.collected = true; score += 10; beep(720, .05, "sine", .015); } s.life -= dt; }); shards = shards.filter(s => !s.collected && s.life > 0); particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }); particles = particles.filter(p => p.life > 0); shake *= .86; updateHud();
  }
  function showUpgrade() { state = "upgrade"; $("touchControls").classList.add("hidden"); const box = $("upgradeChoices"); box.innerHTML = ""; upgrades.sort(() => Math.random() - .5).forEach(u => { const b = document.createElement("button"); b.className = "upgrade-card"; b.innerHTML = `<b>${u.key}</b><strong>${u.title}</strong><span>${u.desc}</span>`; b.onclick = () => { u.apply(player); state = "play"; $("touchControls").classList.remove("hidden"); show(null); beep(880, .12, "sine", .035); }; box.appendChild(b); }); show(screens.upgrade); }
  function updateHud() { $("scoreValue").textContent = String(score).padStart(6, "0"); $("waveValue").textContent = `${String(wave).padStart(2, "0")} / 05`; $("chargeMeter").style.width = `${Math.max(0, Math.min(100, (1 - Math.max(0, player.dash) / 1.3) * 100))}%`; $("hullPips").innerHTML = Array.from({ length: player.maxHp }, (_, i) => `<i class="${i >= player.hp ? "empty" : ""}"></i>`).join(""); }
  function burst(x, y, color, count) { for (let i = 0; i < count; i++) { const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * 150; particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .25 + Math.random() * .4, color }); } }
  function draw() {
    ctx.save(); ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake); ctx.fillStyle = "#07121a"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(109,247,208,.055)"; ctx.lineWidth = 1; const grid = 48; for (let x = 0; x < W; x += grid) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); } for (let y = 0; y < H; y += grid) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    shards.forEach(s => { ctx.fillStyle = "#ffd166"; ctx.shadowBlur = 14; ctx.shadowColor = "#ffd166"; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); });
    bullets.forEach(b => { ctx.fillStyle = b.hostile ? "#ff6b9d" : "#eaf7f2"; ctx.shadowBlur = 12; ctx.shadowColor = ctx.fillStyle; ctx.beginPath(); ctx.arc(b.x, b.y, b.hostile ? 4 : 3, 0, Math.PI * 2); ctx.fill(); });
    enemies.forEach(e => { ctx.shadowBlur = 16; ctx.shadowColor = e.shooter ? "#ff6b9d" : "#b877ff"; ctx.strokeStyle = e.shooter ? "#ff6b9d" : "#b877ff"; ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 2; ctx.beginPath(); e.shooter ? ctx.rect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2) : ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); if (e.shooter) { ctx.fillStyle = "#ff6b9d"; ctx.fillRect(e.x - 3, e.y - 3, 6, 6); } });
    particles.forEach(p => { ctx.globalAlpha = Math.max(0, p.life * 2); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 3, 3); }); ctx.globalAlpha = 1;
    if (player) { const a = Math.atan2(mouse.y - player.y, mouse.x - player.x); ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(a); ctx.shadowBlur = 22; ctx.shadowColor = "#6df7d0"; ctx.fillStyle = player.invuln > 0 && Math.floor(player.invuln * 12) % 2 ? "#fff" : "#6df7d0"; ctx.beginPath(); ctx.moveTo(19, 0); ctx.lineTo(-11, -11); ctx.lineTo(-7, 0); ctx.lineTo(-11, 11); ctx.closePath(); ctx.fill(); ctx.restore(); }
    ctx.restore(); requestAnimationFrame(loop);
  }
  function loop(t) { const dt = Math.min((t - last) / 1000 || 0, .04); last = t; update(dt); draw(); }
  requestAnimationFrame(loop);
})();
