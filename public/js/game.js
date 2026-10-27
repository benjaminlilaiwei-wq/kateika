window.CQGame = (() => {
  const STORAGE_KEY = "cookquest_save_v2";

  const defaultState = () => ({
    level: 1,
    defeatedCount: 0,
    difficulty: 1,
    enemyIndex: 0,
    enemyHp: null,
    enemyMaxHp: null,
    enemySeed: Math.floor(Math.random() * 1e9),
  });

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return { ...defaultState(), ...parsed };
    } catch {
      return defaultState();
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function currentEnemy() {
    const list = window.CQ_DATA.enemies;
    const idx = state.enemyIndex % list.length;
    const base = list[idx];
    const wave = Math.floor(state.enemyIndex / list.length);
    const maxHp = Math.round(base.hp * (1 + wave * 0.35) * (1 + (state.difficulty - 1) * 0.08));
    return {
      ...base,
      maxHp,
      hp: state.enemyHp == null ? maxHp : Math.min(state.enemyHp, maxHp),
      wave,
      displayName: wave > 0 ? `${base.name}＋${wave}` : base.name,
    };
  }

  function ensureEnemyHp() {
    const enemy = currentEnemy();
    if (state.enemyHp == null || state.enemyMaxHp == null) {
      state.enemyHp = enemy.maxHp;
      state.enemyMaxHp = enemy.maxHp;
      save();
    }
    return currentEnemy();
  }

  function getDifficulty() {
    return Math.max(1, Math.min(10, state.difficulty));
  }

  function attack(cookPower) {
    const enemy = ensureEnemyHp();
    const prevSeed = state.enemySeed;
    const power = Math.max(1, Math.round(Number(cookPower) || 10));
    const prevHp = state.enemyHp;
    state.enemyHp = Math.max(0, state.enemyHp - power);
    const defeated = state.enemyHp <= 0;
    let leveledUp = false;

    if (defeated) {
      state.defeatedCount += 1;
      const nextDiff = Math.min(10, 1 + Math.floor(state.defeatedCount / 2));
      if (nextDiff > state.difficulty) {
        state.difficulty = nextDiff;
        state.level += 1;
        leveledUp = true;
      }
      state.enemyIndex += 1;
      state.enemyHp = null;
      state.enemyMaxHp = null;
      state.enemySeed = Math.floor(Math.random() * 1e9);
    }

    save();

    return {
      damage: Math.min(power, prevHp),
      defeated,
      leveledUp,
      prevEnemy: enemy,
      prevEnemySeed: prevSeed,
      enemy: currentEnemy(),
      state: getPublicState(),
    };
  }

  function getPublicState() {
    const enemy = ensureEnemyHp();
    return {
      level: state.level,
      defeatedCount: state.defeatedCount,
      difficulty: getDifficulty(),
      enemy,
      enemySeed: state.enemySeed,
    };
  }

  function resetProgress() {
    state = defaultState();
    save();
    return getPublicState();
  }

  return {
    getState: getPublicState,
    attack,
    resetProgress,
    getDifficulty,
  };
})();
