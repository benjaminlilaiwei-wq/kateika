window.CQImages = {
  base: "https://image.pollinations.ai/prompt/",

  enemyPrompt(enemy) {
    return `${enemy.imagePrompt || "cute food yuru-chara monster"}, kawaii chibi monster, soft round, pastel, playful rival, no text, not scary`;
  },

  pollinationsUrl(prompt, opts = {}) {
    const width = opts.width || 768;
    const height = opts.height || 768;
    const seed = opts.seed != null ? opts.seed : Math.floor(Math.random() * 1e9);
    const clean = String(prompt || "cute food monster")
      .replace(/[\r\n]+/g, " ")
      .trim();
    return `${this.base}${encodeURIComponent(clean)}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
  },

  /** モンスター画像のみ Pollinations */
  loadEnemy(img, enemy, seed) {
    if (!img || !enemy) return;
    img.src = this.pollinationsUrl(this.enemyPrompt(enemy), {
      width: 768,
      height: 768,
      seed,
    });
  },

  clearQueue() {
    /* no-op: 手順画像キューは廃止 */
  },
};
