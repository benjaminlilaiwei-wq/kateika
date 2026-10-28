import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

function cleanEnvValue(value) {
  if (value == null) return "";
  let v = String(value).trim();
  // Render / .env で "..." や '...' 付きになりがち
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function env(name, fallback = "") {
  return cleanEnvValue(process.env[name] || fallback);
}

function firstEnv(names, fallback = "") {
  for (const name of names) {
    const v = env(name);
    if (v) return v;
  }
  return fallback;
}

function openaiApiKey() {
  // OPENAI_MODEL はモデル名。キーは OPENAI_API_KEY
  return firstEnv(["OPENAI_API_KEY", "OPENAI_KEY"]);
}

function geminiApiKey() {
  return firstEnv(["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_AI_API_KEY"]);
}

function isQuotaError(message) {
  const m = String(message || "").toLowerCase();
  return (
    m.includes("rate limit") ||
    m.includes("quota") ||
    m.includes("resource_exhausted") ||
    m.includes("limit: 0") ||
    m.includes("exceeded")
  );
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function readBody(req) {
  if (req.body && typeof req.body.data === "string" && req.body.data) {
    try {
      const parsed = JSON.parse(req.body.data);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      /* ignore */
    }
  }
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  return {};
}

async function openaiChat(messages, temperature = 0.7) {
  const apiKey = openaiApiKey();
  if (!apiKey) {
    return {
      ok: false,
      error:
        "OPENAI_API_KEY が未設定です。Render の Environment に KEY=OPENAI_API_KEY を追加してください（OPENAI_MODEL は gpt-4o-mini などのモデル名用です）。",
    };
  }
  const model = env("OPENAI_MODEL", "gpt-4o-mini");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      response_format: { type: "json_object" },
      max_tokens: 1800,
      messages,
    }),
  });

  const raw = await res.text();
  let decoded;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return { ok: false, error: `OpenAI 応答が不正です (HTTP ${res.status})` };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: decoded?.error?.message || `OpenAI エラー (HTTP ${res.status})`,
    };
  }

  const content = decoded?.choices?.[0]?.message?.content || "";
  let json;
  try {
    json = JSON.parse(content);
  } catch {
    return { ok: false, error: "AIの応答を解釈できませんでした。", raw: content };
  }
  return { ok: true, data: json };
}

function extractGeminiImage(json) {
  const parts = json?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part?.inlineData?.data) {
      return {
        data: part.inlineData.data,
        mime: part.inlineData.mimeType || "image/png",
      };
    }
    if (part?.inline_data?.data) {
      return {
        data: part.inline_data.data,
        mime: part.inline_data.mime_type || part.inline_data.mimeType || "image/png",
      };
    }
  }

  if (Array.isArray(json?.outputs)) {
    for (const out of json.outputs) {
      if (out?.image?.data) {
        return {
          data: out.image.data,
          mime: out.image.mime_type || out.image.mimeType || "image/png",
        };
      }
      if (out?.type === "image" && out?.data) {
        return {
          data: out.data,
          mime: out.mime_type || out.mimeType || "image/png",
        };
      }
    }
  }

  if (json?.output_image?.data) {
    return {
      data: json.output_image.data,
      mime: json.output_image.mime_type || "image/png",
    };
  }
  return null;
}

async function geminiHttp(url, apiKey, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });
  const raw = await res.text();
  let json = null;
  try {
    json = JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { status: res.status, raw, json };
}

function buildImagePrompt(prompt, kind = "step") {
  if (kind === "enemy") {
    return `${prompt}. Cute kawaii chibi food monster mascot, soft pastel colors, playful rival vibe, not scary, no text, no watermark.`;
  }
  return `${prompt}. Close-up food photography of ingredients and cooking process. Focus on food, utensils, and hands from wrists down only if needed. No faces, no portraits, no full-body people, no characters, no text, no watermark. Bright kitchen counter, soft natural light.`;
}

async function generatePollinationsImage(prompt, kind = "step") {
  const fullPrompt = buildImagePrompt(prompt, kind);
  const width = kind === "enemy" ? 768 : 640;
  const height = kind === "enemy" ? 768 : 480;
  const seed = Date.now() % 1e9;
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}` +
    `?width=${width}&height=${height}&nologo=true&seed=${seed}`;

  const res = await fetch(url, {
    headers: { Accept: "image/*" },
  });
  if (!res.ok) {
    return {
      ok: false,
      error: `Pollinations 画像取得に失敗 (HTTP ${res.status})`,
    };
  }
  const mime = res.headers.get("content-type") || "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  // Pollinations の制限画像でも MIME は image/* になることがある
  return {
    ok: true,
    mime,
    data: buf.toString("base64"),
    provider: "pollinations",
    url,
  };
}

async function generateGeminiImageOnly(prompt, kind = "step") {
  const apiKey = geminiApiKey();
  if (!apiKey) {
    return { ok: false, error: "GEMINI_API_KEY が未設定です。" };
  }

  const fullPrompt = `Create an image: ${buildImagePrompt(prompt, kind)}`;
  const preferred = env("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image");
  const models = [...new Set([preferred, "gemini-2.5-flash-image"])];

  const attempts = [];
  let lastError = "画像を生成できませんでした。";

  for (const model of models) {
    for (const ver of ["v1beta", "v1"]) {
      const url = `https://generativelanguage.googleapis.com/${ver}/models/${encodeURIComponent(model)}:generateContent`;
      const payload = {
        contents: [
          {
            role: "user",
            parts: [{ text: fullPrompt }],
          },
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: {
            aspectRatio: kind === "enemy" ? "1:1" : "4:3",
          },
        },
      };

      let res;
      try {
        res = await geminiHttp(url, apiKey, payload);
      } catch (err) {
        const msg = `接続失敗: ${err.message || err}`;
        attempts.push({ model, api: `${ver}/generateContent`, error: msg });
        lastError = msg;
        continue;
      }

      const attempt = { model, api: `${ver}/generateContent`, http: res.status };
      if (res.status >= 400) {
        const msg = res.json?.error?.message || `HTTP ${res.status}`;
        attempt.error = msg;
        attempts.push(attempt);
        lastError = msg;
        // Free Tier limit:0 などは他モデルも同じなのですぐ打ち切り
        if (isQuotaError(msg)) {
          return { ok: false, error: msg, attempts, quota: true };
        }
        continue;
      }

      const img = extractGeminiImage(res.json);
      if (img) {
        return {
          ok: true,
          mime: img.mime,
          data: img.data,
          provider: "gemini",
          model,
          api: `${ver}/generateContent`,
        };
      }

      const block = res.json?.promptFeedback?.blockReason;
      const finish = res.json?.candidates?.[0]?.finishReason;
      attempt.error =
        "画像パーツなし" +
        (block ? ` block=${block}` : "") +
        (finish ? ` finish=${finish}` : "");
      attempts.push(attempt);
      lastError = attempt.error;
    }
  }

  return { ok: false, error: lastError, attempts };
}

async function generateImage(prompt, kind = "step") {
  const mode = env("IMAGE_PROVIDER", "auto").toLowerCase(); // auto | gemini | pollinations

  if (mode === "pollinations") {
    return generatePollinationsImage(prompt, kind);
  }

  if (mode === "gemini") {
    return generateGeminiImageOnly(prompt, kind);
  }

  // auto: Gemini → 失敗/枠なしなら Pollinations
  if (geminiApiKey()) {
    const gemini = await generateGeminiImageOnly(prompt, kind);
    if (gemini.ok) return gemini;
    const fallback = await generatePollinationsImage(prompt, kind);
    if (fallback.ok) {
      return {
        ...fallback,
        fallback_from: "gemini",
        gemini_error: gemini.error,
      };
    }
    return {
      ok: false,
      error: gemini.error || fallback.error,
      attempts: gemini.attempts,
      hint: "Gemini無料枠の画像生成が 0 のため失敗しました。課金するか IMAGE_PROVIDER=pollinations を使ってください。",
    };
  }

  return generatePollinationsImage(prompt, kind);
}

const SUGGEST_SYSTEM = `あなたはファンタジー世界の料理キッチン「CookQuest」の師匠AIです。
料理が苦手・嫌いな初心者でも楽しめるよう、やさしく、ゲーム感覚でレシピを提案してください。
世界観は「ゆるーいモンスターを料理パワーで倒すクッキングRPG」です。見た目はかわいいが、対戦はちゃんと討伐です。
必ず JSON オブジェクトのみで返答してください。日本語で書いてください。

JSONスキーマ:
{
  "title": "料理名（ファンタジー風の別名も少し混ぜてよい）",
  "realName": "一般的な料理名",
  "summary": "1〜2文の紹介",
  "difficulty": 1から10の整数（依頼された難易度に近い値）,
  "cookPower": 難易度に応じた攻撃力（だいたい difficulty * 12 + 8 前後）,
  "timeMinutes": 所要時間の目安（整数）,
  "servings": "人数の目安",
  "ingredients": ["材料 分量", "..."],
  "steps": [
    {
      "order": 1,
      "text": "手順説明（短く具体的に）",
      "tip": "初心者向けの一言ヒント",
      "imagePrompt": "英語。手元・食材・調理器具のクローズアップ写真風。人物の顔や全身は禁止。例: close-up of chopping onion on wooden board, hands only from wrists, no face"
    }
  ],
  "commonQuestions": [
    {"label": "短い質問ボタン文言", "answer": "やさしい回答"}
  ],
  "encouragement": "完成を励ます短文",
  "enemyTaunt": "この料理でゆるモンスターを倒すイメージの一言"
}

制約:
- steps は 4〜7 個
- commonQuestions は 4〜6 個（火加減、代用、失敗しやすい点など）
- 初心者向けなら工程を細かく、難易度が高いなら少し挑戦的に
- 危険な生食や非現実的な材料は避ける
- imagePrompt は英語、テキスト文字入れ禁止
- imagePrompt は必ず食材・手元・鍋などのクローズアップ。人の顔・全身・キャラクター禁止
- トーンは明るく親しみやすいが、討伐・バトル感は残す`;

function pingHandler(_req, res) {
  const hasOpenAI = Boolean(openaiApiKey());
  const hasGemini = Boolean(geminiApiKey());
  res.json({
    ok: true,
    message: "CookQuest API 応答OK (Render/Node)",
    has_config_local: true,
    has_curl: true,
    has_api_key: hasOpenAI,
    has_openai_key: hasOpenAI,
    has_gemini_key: hasGemini,
    openai_model: env("OPENAI_MODEL", "gpt-4o-mini"),
    gemini_image_model: env("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image"),
    image_provider: env("IMAGE_PROVIDER", "auto"),
    hint: hasOpenAI
      ? null
      : "OPENAI_API_KEY を Environment に追加してください（OPENAI_MODEL だけではレシピ提案できません）。",
  });
}
app.get(["/api/ping", "/api/ping.php"], pingHandler);

app.post(["/api/suggest", "/api/suggest.php"], upload.none(), async (req, res) => {
  try {
    const body = readBody(req);
    const mode = String(body.mode || "");
    const difficulty = clampInt(body.difficulty ?? 1, 1, 10, 1);
    const defeated = clampInt(body.defeatedCount ?? 0, 0, 999, 0);

    if (mode !== "mood" && mode !== "fridge") {
      return res.status(400).json({ ok: false, error: "mode は mood または fridge です。" });
    }

    const userParts = [
      `希望難易度(1-10): ${difficulty}`,
      `これまでに倒した敵の数: ${defeated}`,
      "難易度が上がるほど少し挑戦的なレシピにしてください。ただし無理のない範囲で。",
    ];

    if (mode === "mood") {
      const answers = Array.isArray(body.answers) ? body.answers : [];
      if (!answers.length) {
        return res.status(400).json({ ok: false, error: "気分アンケートの回答が必要です。" });
      }
      const lines = answers.map((item) => {
        const q = String(item?.question || "");
        const v = clampInt(item?.value ?? 3, 1, 5, 3);
        const low = String(item?.lowLabel || "低");
        const high = String(item?.highLabel || "高");
        return `- ${q}: ${v}/5 （1=${low}, 5=${high}）`;
      });
      userParts.push("モード: 今日の気分から提案");
      userParts.push(`アンケート結果:\n${lines.join("\n")}`);
    } else {
      const ingredients = Array.isArray(body.ingredients) ? body.ingredients : [];
      const clean = [...new Set(ingredients.map((x) => String(x || "").trim()).filter(Boolean))];
      if (!clean.length) {
        return res.status(400).json({ ok: false, error: "食材を1つ以上指定してください。" });
      }
      userParts.push("モード: 冷蔵庫の食材から提案");
      userParts.push(`使える食材: ${clean.join(", ")}`);
      userParts.push("できるだけ指定食材を活かし、足りない基本調味料（塩・醤油・油など）は使ってよい。");
    }

    const result = await openaiChat(
      [
        { role: "system", content: SUGGEST_SYSTEM },
        { role: "user", content: userParts.join("\n") },
      ],
      0.8
    );

    if (!result.ok) {
      return res.status(502).json(result);
    }

    const data = result.data || {};
    data.difficulty = clampInt(data.difficulty ?? difficulty, 1, 10, difficulty);
    if (!Number.isFinite(Number(data.cookPower))) {
      data.cookPower = data.difficulty * 12 + 8;
    }
    data.cookPower = clampInt(data.cookPower, 10, 200, data.difficulty * 12 + 8);
    return res.json({ ok: true, recipe: data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message || "サーバーエラー" });
  }
});

app.post(["/api/ask", "/api/ask.php"], upload.none(), async (req, res) => {
  try {
    const body = readBody(req);
    const question = String(body.question || "").trim();
    const recipe = body.recipe;
    if (!question) {
      return res.status(400).json({ ok: false, error: "質問を入力してください。" });
    }
    if (!recipe || typeof recipe !== "object") {
      return res.status(400).json({ ok: false, error: "レシピ情報が必要です。" });
    }

    const recipeJson = JSON.stringify({
      title: recipe.title || "",
      realName: recipe.realName || "",
      ingredients: recipe.ingredients || [],
      steps: recipe.steps || [],
      difficulty: recipe.difficulty || 1,
    });

    const system = `あなたは CookQuest の料理師匠です。提示されたレシピについて、初心者にもわかる日本語で短く丁寧に答えてください。
必ず JSON のみで返答:
{
  "answer": "回答本文",
  "quickTips": ["短い追加ヒント", "..."],
  "imagePrompt": "任意。英語。食材・手元・調理器具のクローズアップのみ。顔・全身禁止。不要なら空文字"
}
危険・非衛生な助言はしない。わからないことは無理に断定しない。`;

    const result = await openaiChat(
      [
        { role: "system", content: system },
        { role: "user", content: `レシピ:\n${recipeJson}\n\n質問:\n${question}` },
      ],
      0.5
    );

    if (!result.ok) {
      return res.status(502).json(result);
    }
    return res.json({ ok: true, reply: result.data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message || "サーバーエラー" });
  }
});

app.all(["/api/gemini-image", "/api/gemini-image.php"], upload.none(), async (req, res) => {
  try {
    const isTest = "test" in (req.query || {});
    const body = readBody(req);
    let prompt = String(body.prompt || "").trim();
    let kind = String(body.kind || "step").trim() || "step";

    if (isTest && !prompt) {
      prompt =
        "Close-up photo of fresh vegetables and a kitchen knife on a wooden cutting board, no people, no faces, no text";
      kind = "step";
    }
    if (!prompt) {
      return res.status(400).json({ ok: false, error: "prompt が空です。" });
    }

    const result = await generateImage(prompt, kind);
    if (!result.ok) {
      return res.status(502).json(result);
    }
    if (isTest) result.test = true;
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message || "サーバーエラー" });
  }
});

app.listen(PORT, () => {
  console.log(`CookQuest listening on :${PORT}`);
});
