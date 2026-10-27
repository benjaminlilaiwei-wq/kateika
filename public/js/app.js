(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const state = {
    moodIndex: 0,
    moodAnswers: {},
    selectedIngredients: new Set(),
    recipe: null,
    asking: false,
  };

  function toast(message, ms = 4500) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add("hidden"), ms);
  }

  function apiUrl(path) {
    return new URL(path, window.location.href).toString();
  }

  async function apiPost(path, payload) {
    if (location.protocol === "file:") {
      throw new Error("ファイル直接開きでは動きません。InfinityFreeのURL、または PHP サーバーで開いてください。");
    }

    const form = new FormData();
    form.append("data", JSON.stringify(payload));

    let res;
    try {
      res = await fetch(apiUrl(path), {
        method: "POST",
        body: form,
        credentials: "same-origin",
        cache: "no-store",
      });
    } catch (err) {
      throw new Error(
        "サーバーに接続できません（Failed to fetch）。ページを再読み込みするか、api/ping.php が開けるか確認してください。"
      );
    }

    const text = await res.text();
    if (/aes\.js|requires Javascript|Just a moment/i.test(text)) {
      throw new Error("InfinityFreeのセキュリティ確認が必要です。ページを再読み込みしてから、もう一度試してください。");
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        `APIの応答がJSONではありません（HTTP ${res.status}）。api フォルダのアップロードを確認してください。`
      );
    }

    if (!res.ok || data.ok === false) {
      throw new Error(data.error || `APIエラー (HTTP ${res.status})`);
    }
    return data;
  }

  async function checkConnection() {
    if (location.protocol === "file:") {
      toast("ファイル直接開きではAPI不可。公開URLで開いてね。");
      return;
    }
    try {
      const res = await fetch(apiUrl("api/ping.php"), {
        credentials: "same-origin",
        cache: "no-store",
      });
      const text = await res.text();
      if (/aes\.js|requires Javascript/i.test(text)) {
        toast("セキュリティ確認中かも。ページを再読み込みしてね。");
        return;
      }
      const data = JSON.parse(text);
      if (!data.ok) throw new Error(data.error || "ping失敗");
      const bits = [
        "接続OK",
        data.has_config_local ? "設定あり" : "config.local.phpなし",
        data.has_api_key ? "OpenAIあり" : "OpenAIなし",
        data.has_gemini_key ? "Geminiあり" : "Geminiなし",
        data.has_curl ? "cURLあり" : "cURLなし",
      ];
      toast(bits.join(" / "));
    } catch (err) {
      toast(err.message || "接続チェック失敗");
    }
  }

  async function testGeminiImage() {
    if (location.protocol === "file:") {
      toast("公開URLで開いてからテストしてね。");
      return;
    }
    toast("Gemini画像をテスト中…（最大1分）", 8000);
    try {
      const res = await fetch(apiUrl("api/gemini-image.php?test=1"), {
        credentials: "same-origin",
        cache: "no-store",
      });
      const text = await res.text();
      if (/aes\.js|requires Javascript/i.test(text)) {
        toast("セキュリティ確認中。ページを再読み込みしてね。");
        return;
      }
      const data = JSON.parse(text);
      if (!data.ok) {
        const detail = data.attempts && data.attempts[0] ? ` / ${data.attempts[0].error}` : "";
        throw new Error((data.error || "失敗") + detail);
      }
      toast(`Gemini画像OK（${data.model || "model"}）`);
    } catch (err) {
      toast(err.message || "Gemini画像テスト失敗", 8000);
    }
  }

  function showScreen(name) {
    $$(".screen").forEach((s) => s.classList.toggle("active", s.dataset.screen === name));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function stars(n) {
    return "★".repeat(Math.max(1, Math.min(10, n)));
  }

  function refreshHud() {
    const g = window.CQGame.getState();
    $("#hud-level").textContent = String(g.level);
    $("#hud-defeated").textContent = String(g.defeatedCount);
    $("#hud-difficulty").textContent = stars(g.difficulty);
    renderHomeEnemy(g);
  }

  function renderHomeEnemy(g = window.CQGame.getState()) {
    const enemy = g.enemy;
    $("#home-enemy-name").textContent = enemy.displayName;
    $("#home-enemy-flavor").textContent = enemy.flavor;
    $("#home-enemy-hp-text").textContent = `${enemy.hp} / ${enemy.maxHp}`;
    $("#home-enemy-hp-fill").style.width = `${Math.max(0, (enemy.hp / enemy.maxHp) * 100)}%`;
    const img = $("#home-enemy-img");
    img.alt = enemy.displayName;
    const prompt = window.CQImages.enemyPrompt(enemy);
    const tag = `${enemy.id || enemy.name}:${g.enemySeed}`;
    if (img.dataset.enemyTag === tag && img.getAttribute("src")) return;
    img.dataset.enemyTag = tag;
    img.removeAttribute("src");
    img.classList.remove("loaded");
    window.CQImages.enqueuePrompt(img, prompt, "enemy", null);
  }

  /* -------- Mood -------- */
  function startMood() {
    state.moodIndex = 0;
    state.moodAnswers = {};
    renderMood();
    showScreen("mood");
  }

  function renderMood() {
    const list = window.CQ_DATA.moodQuestions;
    const q = list[state.moodIndex];
    const total = list.length;
    const current = state.moodAnswers[q.id] || 3;

    $("#mood-progress").style.width = `${((state.moodIndex + 1) / total) * 100}%`;
    $("#mood-progress-label").textContent = `${state.moodIndex + 1} / ${total}`;
    $("#mood-back").disabled = state.moodIndex === 0;
    $("#mood-next").textContent = state.moodIndex === total - 1 ? "レシピを召喚" : "次へ";

    $("#mood-question").innerHTML = `
      <h3>${q.question}</h3>
      <div class="scale" role="group" aria-label="5段階評価">
        ${[1, 2, 3, 4, 5]
          .map(
            (n) =>
              `<button type="button" data-mood-value="${n}" class="${n === current ? "selected" : ""}">${n}</button>`
          )
          .join("")}
      </div>
      <div class="scale-labels"><span>${q.lowLabel}</span><span>${q.highLabel}</span></div>
    `;

    state.moodAnswers[q.id] = current;

    $$("[data-mood-value]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.moodAnswers[q.id] = Number(btn.dataset.moodValue);
        $$("[data-mood-value]").forEach((b) => b.classList.toggle("selected", b === btn));
      });
    });
  }

  function moodNext() {
    const list = window.CQ_DATA.moodQuestions;
    if (state.moodIndex < list.length - 1) {
      state.moodIndex += 1;
      renderMood();
      return;
    }
    const answers = list.map((q) => ({
      id: q.id,
      question: q.question,
      lowLabel: q.lowLabel,
      highLabel: q.highLabel,
      value: state.moodAnswers[q.id] || 3,
    }));
    requestRecipe({ mode: "mood", answers });
  }

  function moodBack() {
    if (state.moodIndex > 0) {
      state.moodIndex -= 1;
      renderMood();
    }
  }

  /* -------- Fridge -------- */
  function startFridge() {
    state.selectedIngredients = new Set();
    renderIngredientGroups();
    renderSelectedIngredients();
    showScreen("fridge");
  }

  function renderIngredientGroups() {
    const root = $("#ingredient-groups");
    root.innerHTML = window.CQ_DATA.ingredientGroups
      .map(
        (group) => `
      <div class="chip-group">
        <h3>${group.name}</h3>
        <div class="chips">
          ${group.items
            .map(
              (item) =>
                `<button type="button" class="chip ${state.selectedIngredients.has(item) ? "on" : ""}" data-ing="${escapeAttr(item)}">${item}</button>`
            )
            .join("")}
        </div>
      </div>`
      )
      .join("");

    $$("[data-ing]", root).forEach((btn) => {
      btn.addEventListener("click", () => {
        const name = btn.dataset.ing;
        if (state.selectedIngredients.has(name)) state.selectedIngredients.delete(name);
        else state.selectedIngredients.add(name);
        btn.classList.toggle("on");
        renderSelectedIngredients();
      });
    });
  }

  function renderSelectedIngredients() {
    const box = $("#selected-ingredients");
    const items = [...state.selectedIngredients];
    $("#fridge-submit").disabled = items.length === 0;
    if (items.length === 0) {
      box.innerHTML = `<span style="opacity:.6">まだ選ばれていないよ</span>`;
      return;
    }
    box.innerHTML = items
      .map(
        (item) =>
          `<button type="button" class="chip on" data-remove-ing="${escapeAttr(item)}">${item}<span>×</span></button>`
      )
      .join("");
    $$("[data-remove-ing]", box).forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedIngredients.delete(btn.dataset.removeIng);
        renderIngredientGroups();
        renderSelectedIngredients();
      });
    });
  }

  function addCustomIngredient() {
    const input = $("#custom-ingredient");
    const value = input.value.trim();
    if (!value) return;
    state.selectedIngredients.add(value);
    input.value = "";
    renderIngredientGroups();
    renderSelectedIngredients();
  }

  /* -------- API -------- */
  async function requestRecipe(payload) {
    showScreen("loading");
    $("#loading-text").textContent = "AI師匠がレシピを考え中…";
    const g = window.CQGame.getState();
    const body = {
      ...payload,
      difficulty: g.difficulty,
      defeatedCount: g.defeatedCount,
    };

    try {
      const data = await apiPost("api/suggest.php", body);
      state.recipe = data.recipe;
      renderRecipe(data.recipe);
      showScreen("recipe");
    } catch (err) {
      console.error(err);
      toast(err.message || "通信エラーです。");
      showScreen("home");
      refreshHud();
    }
  }

  function renderRecipe(recipe) {
    const g = window.CQGame.getState();
    $("#recipe-real-name").textContent = recipe.realName || "秘伝レシピ";
    $("#recipe-title").textContent = recipe.title || "名無しの料理";
    $("#recipe-summary").textContent = recipe.summary || "";
    $("#recipe-diff").textContent = `難易度 ${stars(recipe.difficulty || g.difficulty)}`;
    $("#recipe-power").textContent = `料理パワー ${recipe.cookPower}`;
    $("#recipe-time").textContent = recipe.timeMinutes ? `約${recipe.timeMinutes}分` : "時間未定";
    $("#recipe-servings").textContent = recipe.servings || "";
    $("#recipe-encourage").textContent = recipe.encouragement || "ゆっくりで大丈夫。完成が勝ちだ。";
    $("#recipe-enemy-taunt").textContent = recipe.enemyTaunt || g.enemy.flavor;

    $("#recipe-ingredients").innerHTML = (recipe.ingredients || [])
      .map((ing) => `<li>${escapeHtml(ing)}</li>`)
      .join("");

    window.CQImages.clearQueue();

    $("#recipe-steps").innerHTML = (recipe.steps || [])
      .map((step, i) => {
        const order = step.order || i + 1;
        const prompt = window.CQImages.stepPrompt(step.imagePrompt);
        // Geminiなら多めに自動、Pollinations時は2枚まで
        const auto = window.CQImages.provider === "gemini" ? i < 4 : i < 2;
        return `
          <li>
            <span class="step-num">Step ${order}</span>
            <div>${escapeHtml(step.text || "")}</div>
            ${step.tip ? `<p class="tip">ヒント: ${escapeHtml(step.tip)}</p>` : ""}
            <div class="step-img-slot" data-img-prompt="${escapeAttr(prompt)}" data-auto="${auto ? "1" : "0"}">
              <p class="step-img-status"></p>
              <img alt="手順${order}のイメージ（食材・手元）" hidden />
              ${auto ? "" : `<button type="button" class="btn btn-ghost step-img-btn">この手順の画像を見る</button>`}
            </div>
          </li>`;
      })
      .join("");

    $$(".step-img-slot").forEach((slot) => {
      const img = slot.querySelector("img");
      const status = slot.querySelector(".step-img-status");
      const btn = slot.querySelector(".step-img-btn");
      const prompt = slot.dataset.imgPrompt;
      const start = () => {
        if (btn) {
          btn.disabled = true;
          btn.textContent = "順番待ち…";
        }
        window.CQImages.enqueuePrompt(img, prompt, "step", status);
      };
      if (slot.dataset.auto === "1") start();
      else if (btn) btn.addEventListener("click", start);
    });

    $("#recipe-enemy-name").textContent = g.enemy.displayName;
    $("#recipe-enemy-hp-text").textContent = `${g.enemy.hp} / ${g.enemy.maxHp}`;
    $("#recipe-enemy-hp-fill").style.width = `${(g.enemy.hp / g.enemy.maxHp) * 100}%`;
    const recipeEnemyImg = $("#recipe-enemy-img");
    recipeEnemyImg.removeAttribute("src");
    recipeEnemyImg.classList.remove("loaded");
    window.CQImages.enqueuePrompt(
      recipeEnemyImg,
      window.CQImages.enemyPrompt(g.enemy),
      "enemy",
      null
    );

    const faq = $("#faq-buttons");
    const questions = recipe.commonQuestions || [];
    faq.innerHTML = questions
      .map(
        (q, i) =>
          `<button type="button" data-faq="${i}">${escapeHtml(q.label || q.question || "質問")}</button>`
      )
      .join("");

    $$("[data-faq]", faq).forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = questions[Number(btn.dataset.faq)];
        if (!item) return;
        showLocalAnswer(item.label || item.question, item.answer);
      });
    });

    $("#ask-answer").classList.add("hidden");
    $("#ask-input").value = "";
  }

  function showLocalAnswer(title, answer) {
    const box = $("#ask-answer");
    box.classList.remove("hidden");
    box.innerHTML = `<strong>${escapeHtml(title)}</strong><p>${escapeHtml(answer)}</p>`;
  }

  async function askAi(question) {
    if (!state.recipe) return;
    const q = (question || "").trim();
    if (!q) {
      toast("質問を入力するか、ボタンを選んでね");
      return;
    }
    if (state.asking) return;
    state.asking = true;
    const box = $("#ask-answer");
    box.classList.remove("hidden");
    box.innerHTML = `<p>師匠が考え中…</p>`;

    try {
      const data = await apiPost("api/ask.php", { question: q, recipe: state.recipe });
      const reply = data.reply || {};
      const tips = Array.isArray(reply.quickTips)
        ? `<ul>${reply.quickTips.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`
        : "";
      const hasImg = reply.imagePrompt && String(reply.imagePrompt).trim();
      box.innerHTML = `<strong>${escapeHtml(q)}</strong><p>${escapeHtml(reply.answer || "")}</p>${tips}${
        hasImg
          ? `<div class="step-img-slot ask-img-slot"><p class="step-img-status"></p><img alt="説明イメージ（食材・手元）" hidden /></div>`
          : ""
      }`;
      if (hasImg) {
        const slot = box.querySelector(".ask-img-slot");
        const img = slot.querySelector("img");
        const status = slot.querySelector(".step-img-status");
        window.CQImages.enqueuePrompt(img, window.CQImages.stepPrompt(reply.imagePrompt), "step", status);
      }
    } catch (err) {
      box.innerHTML = `<p>${escapeHtml(err.message || "エラーが発生しました")}</p>`;
    } finally {
      state.asking = false;
    }
  }

  function completeCook() {
    if (!state.recipe) return;
    const power = state.recipe.cookPower || 20;
    const result = window.CQGame.attack(power);
    showBattle(result);
  }

  function showBattle(result) {
    showScreen("battle");
    const visual = $(".battle-visual");
    visual.classList.remove("hit");
    void visual.offsetWidth;
    visual.classList.add("hit");

    const battleImg = $("#battle-enemy-img");
    battleImg.removeAttribute("src");
    battleImg.classList.remove("loaded");
    window.CQImages.enqueuePrompt(
      battleImg,
      window.CQImages.enemyPrompt(result.prevEnemy),
      "enemy",
      null
    );
    $("#damage-float").textContent = `-${result.damage}`;
    $("#damage-float").classList.remove("show");
    void $("#damage-float").offsetWidth;
    $("#damage-float").classList.add("show");

    if (result.defeated) {
      $("#battle-eyebrow").textContent = "討伐成功！";
      $("#battle-title").textContent = `${result.prevEnemy.displayName} を倒した！`;
      $("#battle-message").textContent = result.leveledUp
        ? `料理パワー ${result.damage}！ レベルアップ！ 次のレシピはもう少し挑戦的になるよ。`
        : `料理パワー ${result.damage}！ 次のゆるモンスターが近づいている…`;
      $("#battle-hp-text").textContent = `0 / ${result.prevEnemy.maxHp}`;
      $("#battle-hp-fill").style.width = "0%";
      $("#battle-next").classList.remove("hidden");
    } else {
      $("#battle-eyebrow").textContent = "ダメージ成功";
      $("#battle-title").textContent = "料理パワー発動！";
      $("#battle-message").textContent = `${result.prevEnemy.displayName} に ${result.damage} ダメージ！ 残りHP ${result.enemy.hp}`;
      $("#battle-hp-text").textContent = `${result.enemy.hp} / ${result.enemy.maxHp}`;
      $("#battle-hp-fill").style.width = `${(result.enemy.hp / result.enemy.maxHp) * 100}%`;
      $("#battle-next").classList.add("hidden");
    }
    refreshHud();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, "&#39;");
  }

  /* -------- Events -------- */
  document.addEventListener("click", (e) => {
    const actionEl = e.target.closest("[data-action]");
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    switch (action) {
      case "home":
        showScreen("home");
        refreshHud();
        break;
      case "start-mood":
        startMood();
        break;
      case "start-fridge":
        startFridge();
        break;
      case "mood-next":
        moodNext();
        break;
      case "mood-back":
        moodBack();
        break;
      case "add-ingredient":
        addCustomIngredient();
        break;
      case "fridge-submit":
        requestRecipe({ mode: "fridge", ingredients: [...state.selectedIngredients] });
        break;
      case "ask-ai":
        askAi($("#ask-input").value);
        break;
      case "complete-cook":
        completeCook();
        break;
      case "next-enemy":
        showScreen("home");
        refreshHud();
        break;
      case "check-connection":
        checkConnection();
        break;
      case "test-gemini-image":
        testGeminiImage();
        break;
      default:
        break;
    }
  });

  $("#custom-ingredient")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCustomIngredient();
    }
  });

  $("#ask-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      askAi($("#ask-input").value);
    }
  });

  refreshHud();
})();
