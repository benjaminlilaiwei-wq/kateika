window.CQ_DATA = {
  moodQuestions: [
    {
      id: "energy",
      question: "いまの元気ゲージはどのくらい？",
      lowLabel: "ぐったり",
      highLabel: "全開",
    },
    {
      id: "hunger",
      question: "お腹の空き具合は？",
      lowLabel: "軽くでOK",
      highLabel: "がっつり",
    },
    {
      id: "time",
      question: "料理に使える時間は？",
      lowLabel: "超短い",
      highLabel: "じっくり可",
    },
    {
      id: "dishes",
      question: "洗い物への勇気は？",
      lowLabel: "最小限で",
      highLabel: "戦える",
    },
    {
      id: "heat",
      question: "温かいものが食べたい？",
      lowLabel: "さっぱり冷たい",
      highLabel: "ほかほか温かい",
    },
    {
      id: "spice",
      question: "味の刺激はどのくらい欲しい？",
      lowLabel: "やさしい味",
      highLabel: "パンチ強め",
    },
    {
      id: "health",
      question: "ヘルシーさ重視度は？",
      lowLabel: "今日は気にしない",
      highLabel: "からだ思い",
    },
    {
      id: "adventure",
      question: "新しい味への冒険心は？",
      lowLabel: "定番が安心",
      highLabel: "未知を開拓",
    },
    {
      id: "comfort",
      question: "ごほうび感（ごちそう感）は？",
      lowLabel: "日常メシ",
      highLabel: "祝祭メシ",
    },
    {
      id: "focus",
      question: "手順の多さに耐えられる？",
      lowLabel: "超かんたん希望",
      highLabel: "挑戦してみたい",
    },
  ],

  ingredientGroups: [
    {
      name: "主食・炭水化物",
      items: ["ご飯", "残りご飯", "うどん", "そうめん", "パスタ", "パン", "じゃがいも", "さつまいも"],
    },
    {
      name: "肉・魚・卵・大豆",
      items: ["卵", "鶏むね肉", "豚こま", "ひき肉", "ベーコン", "ソーセージ", "鮭", "ツナ缶", "豆腐", "納豆"],
    },
    {
      name: "野菜",
      items: ["玉ねぎ", "にんじん", "キャベツ", "白菜", "もやし", "トマト", "きゅうり", "レタス", "ねぎ", "きのこ"],
    },
    {
      name: "乳・その他",
      items: ["牛乳", "チーズ", "ヨーグルト", "バター", "冷凍野菜", "コーン缶", "わかめ"],
    },
    {
      name: "調味料（あれば）",
      items: ["醤油", "味噌", "塩", "こしょう", "砂糖", "みりん", "酒", "酢", "マヨネーズ", "ケチャップ", "オリーブオイル", "ごま油"],
    },
  ],

  enemies: [
    {
      id: "egg-kun",
      name: "はらぺこタマゴん",
      flavor: "ぽよぽよお腹がぐうぐう。温かい料理でノックアウトだ！",
      hp: 100,
      imagePrompt:
        "kawaii yuru-chara monster, round soft boiled egg creature with tiny arms and big eyes, chibi, pastel yellow, playful rival vibe, cozy kitchen battle, soft lighting, no text, not scary",
    },
    {
      id: "toast-chan",
      name: "こげぱんちゃん",
      flavor: "香ばしい焦げパワーで攻めてくる。火加減勝負だ！",
      hp: 130,
      imagePrompt:
        "kawaii yuru-chara monster, cute burnt toast slice creature with rosy cheeks, chibi, warm brown pastel, playful battle pose, cozy kitchen, soft lighting, no text, not scary",
    },
    {
      id: "fridge-mimi",
      name: "れいぞうこミミィ",
      flavor: "食材かくれんぼの達人。扉を閉めてHPを守ってくる！",
      hp: 160,
      imagePrompt:
        "kawaii yuru-chara monster, cute chubby refrigerator creature with round door face, chibi, pastel blue and white, playful rival, soft kitchen battle, no text, not scary",
    },
    {
      id: "stew-mochi",
      name: "シチューもちもち",
      flavor: "とろとろボディでふわっと弾く。味付けで弱点をつこう！",
      hp: 190,
      imagePrompt:
        "kawaii yuru-chara monster, cute round stew slime creature with tiny carrot hat, chibi, warm orange pastel, playful battle, cozy kitchen, no text, not scary",
    },
    {
      id: "onion-n",
      name: "なみだオニオンん",
      flavor: "切るたびうるうる攻撃。勇気の包丁さばきで討伐せよ！",
      hp: 220,
      imagePrompt:
        "kawaii yuru-chara monster, cute onion creature with tiny tear sparkles, chibi, pastel purple-white, playful rival, cozy kitchen battle, no text, not scary",
    },
    {
      id: "spice-majin",
      name: "スパイスまーじん",
      flavor: "ぴりぴり魔法でキッチンを支配中。特製レシピで倒せ！",
      hp: 280,
      imagePrompt:
        "kawaii yuru-chara monster, cute little spice wizard creature with paprika shaker hat, chibi, warm red and gold pastel, playful boss vibe, cozy kitchen battle, no text, not scary",
    },
  ],
};
