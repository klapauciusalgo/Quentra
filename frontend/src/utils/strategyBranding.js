export const STRATEGY_BRANDING = {
  'pippo-30m-new-gen': {
    name: 'Novera',
    short_name: 'Novera',
    subtitle: '30M New Cycle Momentum',
    philosophy: 'A new cycle for fresh momentum.',
  },
  'pippo-30m-grd': {
    name: 'Kairon',
    short_name: 'Kairon',
    subtitle: '30M Precision Timing',
    philosophy: 'Enter the trend at the right moment.',
  },
  'pippo-30m-short-v2-a': {
    name: 'Noxara',
    short_name: 'Noxara',
    subtitle: '30M Downside Signal',
    philosophy: 'Find weakness before it becomes visible.',
  },
  'pippo-30m-short-v2-b': {
    name: 'Velora',
    short_name: 'Velora',
    subtitle: '30M Fast Downside',
    philosophy: 'Turn movement speed into downside edge.',
  },
  'pippo-30m-short-v2-c': {
    name: 'Sorevia',
    short_name: 'Sorevia',
    subtitle: '30M Defensive Short',
    philosophy: 'Protect capital while conditions shift.',
  },
  'pippo-30m-alpha': {
    name: 'Aurelis',
    short_name: 'Aurelis',
    subtitle: '30M Adaptive Alpha',
    philosophy: 'Find clarity inside market noise.',
  },
  'pippo-30m-scalp': {
    name: 'Tessara',
    short_name: 'Tessara',
    subtitle: '30M Precision Scalp',
    philosophy: 'Small edges become meaningful when repeated.',
  },
  'pippo-1h-enhanced': {
    name: 'Elaris',
    short_name: 'Elaris',
    subtitle: '1H Adaptive Structure',
    philosophy: 'Read market structure from a higher frame.',
  },
  'pippo-4h-original': {
    name: 'Orvane',
    short_name: 'Orvane',
    subtitle: '4H Structural Trend',
    philosophy: 'Let the larger orbit shape the trade.',
  },
  'pure-macro-weekly-ma55': {
    name: 'Mavora',
    short_name: 'Mavora',
    subtitle: 'Weekly Macro Flow',
    philosophy: "Follow the market's long current.",
  },
};

export function applyStrategyBranding(strategy) {
  const branding = STRATEGY_BRANDING[strategy?.id];
  if (!branding) return { ...strategy };
  const result = { ...strategy, ...branding };

  const updateNestedNames = (value) => {
    if (Array.isArray(value)) return value.map(updateNestedNames);
    if (!value || typeof value !== 'object') return value;
    const updated = { ...value };
    if (Object.prototype.hasOwnProperty.call(updated, 'strategy_name')) {
      updated.strategy_name = branding.name;
    }
    for (const [key, child] of Object.entries(updated)) {
      updated[key] = updateNestedNames(child);
    }
    return updated;
  };

  return updateNestedNames(result);
}

export function applyCatalogBranding(catalog) {
  return Array.isArray(catalog) ? catalog.map(applyStrategyBranding) : [];
}
