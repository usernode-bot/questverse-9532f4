// QuestVerse shared engine.
//
// Pure and synchronous: no DOM, no storage, no network. The runner calls
// these functions; a future unit suite can too. A run is fully determined
// by the title script plus the sequence of actions, so it is reproducible.

export const SCHEMA_VERSION = 1;

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function gaugeDef(title, key) {
  return (title.gauges || []).find((g) => g.key === key) || null;
}

export function stageAt(title, state) {
  return title.stages[state.stageIndex] || null;
}

export function gaugeText(title, state, key) {
  const g = gaugeDef(title, key);
  if (!g) return '';
  const v = state.gauges[key];
  if (g.type === 'tier') return g.steps[v];
  if (g.type === 'count') return v + ' / ' + g.max;
  if (typeof g.format === 'function') return g.format(v);
  return v + '%';
}

export function createRun(title) {
  const gauges = {};
  for (const g of title.gauges || []) {
    gauges[g.key] = g.type === 'tier' ? g.steps.indexOf(g.start) : g.start;
  }
  const inventory = {};
  for (const it of title.inventory || []) inventory[it.key] = it.start;
  const flags = {};
  for (const f of title.flags || []) flags[f.key] = f.start;
  return {
    v: SCHEMA_VERSION,
    titleId: title.id,
    stageIndex: 0,
    gauges,
    inventory,
    flags,
    finished: false,
    outcome: null,
    transcript: [
      { kind: 'scene', text: title.opening },
      { kind: 'scene', text: title.stages[0].scene },
    ],
    updatedAt: Date.now(),
  };
}

function applyEffects(title, state, effects) {
  for (const e of effects || []) {
    const g = gaugeDef(title, e.gauge);
    if (!g) continue;
    const v = state.gauges[e.gauge];
    if (g.type === 'tier') {
      state.gauges[e.gauge] = clamp(v + e.delta, 0, g.steps.length - 1);
    } else {
      const lo = g.min != null ? g.min : 0;
      const hi = g.max != null ? g.max : 100;
      state.gauges[e.gauge] = clamp(v + e.delta, lo, hi);
    }
  }
}

// The item matrix decides how an item behaves in a stage: good moves the
// stage's gauge up one step, poor moves it down one, neutral does nothing.
function itemOutcome(stage, itemKey) {
  if (!stage.items || !stage.items[itemKey]) return null;
  return stage.items[itemKey];
}

function matrixEffects(stage, itemKey) {
  const result = itemOutcome(stage, itemKey);
  if (!result || !stage.itemGauge) return [];
  const delta = result === 'good' ? 1 : result === 'poor' ? -1 : 0;
  return [{ gauge: stage.itemGauge, delta }];
}

function itemText(title, result) {
  const map = title.itemText || {};
  return map[result] || '';
}

function record(title, state, choice) {
  const { text } = choice;
  state.transcript.push({ kind: 'action', text });
  const uses = choice.uses;
  if (uses && state.inventory[uses] > 0) state.inventory[uses] = 0;
  const effect = matrixEffects(title.stages[state.stageIndex], uses);
  applyEffects(title, state, effect.length ? effect : choice.effects || []);
  if (choice.sets) state.flags[choice.sets] = true;
  let line;
  if (uses && itemOutcome(title.stages[state.stageIndex], uses)) {
    line = choice.outcome || itemText(title, itemOutcome(title.stages[state.stageIndex], uses));
  } else {
    line = choice.outcome || itemText(title, 'neutral');
  }
  if (line) state.transcript.push({ kind: 'outcome', text: line });
  if (choice.final) {
    state.finished = true;
  } else if (state.stageIndex < title.stages.length - 1) {
    state.stageIndex += 1;
    state.transcript.push({ kind: 'scene', text: title.stages[state.stageIndex].scene });
  }
}

export function applyChoice(title, state, choiceKey) {
  const next = JSON.parse(JSON.stringify(state));
  const stage = stageAt(title, next);
  const choice = (stage.choices || []).find((c) => c.key === choiceKey);
  if (!choice) return next;
  record(title, next, choice);
  const terminal = checkTerminal(title, next);
  if (terminal) {
    next.outcome = terminal.kind;
    next.transcript.push({ kind: terminal.kind === 'win' ? 'win' : 'lose', text: terminal.text });
  }
  next.updatedAt = Date.now();
  return next;
}

export function applyCustom(title, state, rawText) {
  const next = JSON.parse(JSON.stringify(state));
  const stage = stageAt(title, next);
  const text = String(rawText || '').trim();
  const lower = text.toLowerCase();
  if (!text) return next;
  next.transcript.push({ kind: 'action', text: 'Custom: ' + text });

  // 1. An inventory item named in the text uses that item in this stage.
  const items = (title.inventory || []);
  const named = items.find((it) => {
    const aliases = [it.key, it.label].concat(it.aliases || []);
    return aliases.some((a) => lower.includes(String(a).toLowerCase()));
  });
  if (named) {
    if (next.inventory[named.key] > 0) {
      next.inventory[named.key] = 0;
      const result = itemOutcome(stage, named.key);
      applyEffects(title, next, matrixEffects(stage, named.key));
      next.transcript.push({
        kind: 'outcome',
        text: stage.itemCustomText && stage.itemCustomText[named.key]
          ? stage.itemCustomText[named.key]
          : itemText(title, result || 'neutral'),
      });
    } else {
      next.transcript.push({ kind: 'outcome', text: 'You reach for the ' + named.label.toLowerCase() + ', but your pouch is empty.' });
    }
  } else {
    // 2. Stage keywords, then 3. a gentle nudge back to the choices.
    const kw = (stage.keywords || []).find((k) =>
      (k.match || []).some((m) => lower.includes(String(m).toLowerCase())));
    if (kw) {
      if (kw.sets) next.flags[kw.sets] = true;
      if (kw.uses && next.inventory[kw.uses] > 0) next.inventory[kw.uses] = 0;
      applyEffects(title, next, kw.effects || []);
      next.transcript.push({ kind: 'outcome', text: kw.text });
    } else {
      next.transcript.push({ kind: 'outcome', text: title.nudge });
    }
  }
  const terminal = checkTerminal(title, next);
  if (terminal) {
    next.outcome = terminal.kind;
    next.transcript.push({ kind: terminal.kind === 'win' ? 'win' : 'lose', text: terminal.text });
  }
  next.updatedAt = Date.now();
  return next;
}

export function checkTerminal(title, state) {
  const lose = title.lose ? title.lose(state) : null;
  if (lose) return { kind: 'lose', text: lose };
  if (state.finished) {
    // title.win is a predicate; the prose it wins with is title.winText.
    const won = title.win ? title.win(state) : false;
    if (won) return { kind: 'win', text: title.winText || 'You make it out.' };
    return { kind: 'lose', text: title.fizzle || title.loseText || 'The run ends here.' };
  }
  return null;
}

export function renderStateBlock(title, state) {
  return (title.gauges || []).map((g) => g.blockLabel + ': ' + gaugeText(title, state, g.key));
}

export function renderInventoryLine(title, state) {
  if (!title.inventory || !title.inventory.length) return null;
  const parts = title.inventory.map((it) => it.label + ': ' + (state.inventory[it.key] > 0 ? '1' : '0'));
  return (title.inventoryPrefix || 'INVENTORY') + ': ' + parts.join(' | ');
}

export function achievementsFor(title, state, event) {
  const unlocked = [];
  for (const a of title.achievements || []) {
    try {
      if (a.test(state, event || {})) unlocked.push(a.key);
    } catch { /* an achievement test never breaks a run */ }
  }
  return unlocked;
}

export function tierIndex(title, state, key) {
  return state.gauges[key];
}

export function tierLabel(title, state, key) {
  const g = gaugeDef(title, key);
  if (!g || g.type !== 'tier') return '';
  return g.steps[state.gauges[key]];
}

// The lines the runner shows in the bracketed state block, in order:
// the gauges, then any extra lines the title declares (a flag, a light),
// then the inventory line when the title has one.
export function renderBlock(title, state) {
  const lines = renderStateBlock(title, state);
  if (title.extraBlock) lines.push(...title.extraBlock(state));
  const inv = renderInventoryLine(title, state);
  if (inv) lines.push(inv);
  return lines;
}

export function titleStatus(title, state) {
  if (!state) return { key: 'not-started', label: 'Not started' };
  if (state.finished) {
    return { key: 'completed', label: state.outcome === 'win' ? 'Completed: victory' : 'Completed: game over' };
  }
  return { key: 'in-progress', label: 'In progress: Stage ' + (state.stageIndex + 1) };
}
