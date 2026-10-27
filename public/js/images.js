window.CQImages = {
  // Free Pollinations fallback (slow: ~1 image / 45s)
  base: "https://image.pollinations.ai/prompt/",
  provider: "gemini", // "gemini" | "pollinations"
  gapMs: 1500,
  pollinationsGapMs: 48000,
  _queue: [],
  _busy: false,
  _lastStart: 0,
  _cache: {},

  apiUrl(path) {
    return new URL(path, window.location.href).toString();
  },

  stepPrompt(imagePrompt) {
    return [
      imagePrompt || "close-up of cooking ingredients on a cutting board",
      "macro or close-up food photography style",
      "focus on ingredients, utensils, hands only from wrists down if needed",
      "no faces, no people portraits, no full body, no characters",
      "bright kitchen counter, soft natural light",
      "clear instructional cooking detail",
      "no text, no watermark, no logo",
    ].join(", ");
  },

  enemyPrompt(enemy) {
    return `${enemy.imagePrompt || "cute food yuru-chara monster"}, kawaii chibi monster, soft round, pastel, playful rival, no text, not scary`;
  },

  pollinationsUrl(prompt, opts = {}) {
    const width = opts.width || 640;
    const height = opts.height || 480;
    const seed = opts.seed != null ? opts.seed : Math.floor(Math.random() * 1e9);
    const clean = String(prompt || "close-up cooking ingredients")
      .replace(/[\r\n]+/g, " ")
      .trim();
    return `${this.base}${encodeURIComponent(clean)}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
  },

  /** @deprecated for direct <img src>, prefer enqueuePrompt */
  enemy(enemy, seed) {
    return this.pollinationsUrl(this.enemyPrompt(enemy), { width: 768, height: 768, seed });
  },

  step(imagePrompt, seed) {
    return this.pollinationsUrl(this.stepPrompt(imagePrompt), { width: 640, height: 480, seed });
  },

  enqueue(img, url, statusEl) {
    if (!img) return;
    this._queue.push({ type: "url", img, url, statusEl });
    this._pump();
  },

  enqueuePrompt(img, prompt, kind, statusEl) {
    if (!img) return;
    this._queue.push({ type: "prompt", img, prompt, kind: kind || "step", statusEl });
    this._pump();
  },

  clearQueue() {
    this._queue = [];
  },

  _setStatus(el, text) {
    if (el) el.textContent = text;
  },

  _gap() {
    return this.provider === "pollinations" ? this.pollinationsGapMs : this.gapMs;
  },

  _cacheKey(prompt, kind) {
    return `${kind}::${prompt}`;
  },

  async _generateGemini(prompt, kind) {
    const key = this._cacheKey(prompt, kind);
    if (this._cache[key]) return this._cache[key];

    const form = new FormData();
    form.append("data", JSON.stringify({ prompt, kind }));
    const res = await fetch(this.apiUrl("api/gemini-image.php"), {
      method: "POST",
      body: form,
      credentials: "same-origin",
      cache: "no-store",
    });
    const text = await res.text();
    if (/aes\.js|requires Javascript/i.test(text)) {
      throw new Error("セキュリティ確認が必要です。ページを再読み込みしてね");
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`画像APIの応答が不正です (HTTP ${res.status})`);
    }
    if (!data.ok) throw new Error(data.error || "画像生成に失敗しました");
    const url = `data:${data.mime || "image/png"};base64,${data.data}`;
    this._cache[key] = url;
    return url;
  },

  _pump() {
    if (this._busy) return;
    const next = this._queue.shift();
    if (!next) return;

    this._busy = true;
    const gap = this._gap();
    const wait = Math.max(0, gap - (Date.now() - this._lastStart));
    if (wait > 0) {
      this._setStatus(next.statusEl, `画像待ち… 約${Math.ceil(wait / 1000)}秒`);
    }

    setTimeout(async () => {
      this._lastStart = Date.now();
      this._setStatus(next.statusEl, "画像を生成中…");
      const { img, statusEl } = next;

      const done = () => {
        this._setStatus(statusEl, "");
        this._busy = false;
        this._pump();
      };

      const showUrl = (url) =>
        new Promise((resolve) => {
          img.onload = () => {
            img.hidden = false;
            img.classList.add("loaded");
            resolve(true);
          };
          img.onerror = () => resolve(false);
          img.src = url;
          setTimeout(() => resolve(img.complete), 60000);
        });

      try {
        let url;
        if (next.type === "url") {
          url = next.url;
        } else if (this.provider === "gemini") {
          url = await this._generateGemini(next.prompt, next.kind);
        } else {
          url = this.pollinationsUrl(next.prompt, {
            width: next.kind === "enemy" ? 768 : 640,
            height: next.kind === "enemy" ? 768 : 480,
          });
        }

        const ok = await showUrl(url);
        if (!ok) {
          this._setStatus(statusEl, "画像の表示に失敗しました");
        }
        done();
      } catch (err) {
        console.error(err);
        // Geminiエラーを隠さず表示（Pollinationsへ黙って逃がさない）
        this._setStatus(statusEl, err.message || "画像の取得に失敗しました");
        this._busy = false;
        setTimeout(() => this._pump(), this._gap());
      }
    }, wait);
  },
};
