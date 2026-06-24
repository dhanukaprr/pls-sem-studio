import { Dataset, Construct, StructuralPath } from '../types';

// Helper to generate normally distributed random numbers (Box-Muller transform)
function randomNormal(mean = 0, stdDev = 1): number {
  const u1 = Math.random() || 0.0001; // Avoid 0
  const u2 = Math.random() || 0.0001;
  const randStdNormal = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + stdDev * randStdNormal;
}

// Generate the classic Corporate Reputation dataset
function generateCorpRepData(numRows = 150): Dataset {
  const rows: Record<string, number>[] = [];
  
  for (let i = 0; i < numRows; i++) {
    // Latent variables with specified path dependencies
    const comp = randomNormal(0, 1);
    const like = 0.55 * comp + randomNormal(0, Math.sqrt(1 - 0.55 * 0.55));
    const cusa = 0.35 * comp + 0.45 * like + randomNormal(0, 0.5);
    const cusl = 0.55 * cusa + 0.25 * like + randomNormal(0, 0.4);

    // Reflective indicators (loadings 0.75 - 0.90 + noise)
    const comp_1 = 0.86 * comp + randomNormal(0, 0.35);
    const comp_2 = 0.81 * comp + randomNormal(0, 0.42);
    const comp_3 = 0.77 * comp + randomNormal(0, 0.45);

    const like_1 = 0.89 * like + randomNormal(0, 0.30);
    const like_2 = 0.83 * like + randomNormal(0, 0.38);
    const like_3 = 0.80 * like + randomNormal(0, 0.42);

    const cusa_1 = 0.91 * cusa + randomNormal(0, 0.25);
    const cusa_2 = 0.87 * cusa + randomNormal(0, 0.32);
    const cusa_3 = 0.82 * cusa + randomNormal(0, 0.38);

    const cusl_1 = 0.93 * cusl + randomNormal(0, 0.22);
    const cusl_2 = 0.89 * cusl + randomNormal(0, 0.28);
    const cusl_3 = 0.84 * cusl + randomNormal(0, 0.35);

    rows.push({
      COMP_1: parseFloat(comp_1.toFixed(3)),
      COMP_2: parseFloat(comp_2.toFixed(3)),
      COMP_3: parseFloat(comp_3.toFixed(3)),
      LIKE_1: parseFloat(like_1.toFixed(3)),
      LIKE_2: parseFloat(like_2.toFixed(3)),
      LIKE_3: parseFloat(like_3.toFixed(3)),
      CUSA_1: parseFloat(cusa_1.toFixed(3)),
      CUSA_2: parseFloat(cusa_2.toFixed(3)),
      CUSA_3: parseFloat(cusa_3.toFixed(3)),
      CUSL_1: parseFloat(cusl_1.toFixed(3)),
      CUSL_2: parseFloat(cusl_2.toFixed(3)),
      CUSL_3: parseFloat(cusl_3.toFixed(3)),
    });
  }

  // Column names
  const columns = [
    'COMP_1', 'COMP_2', 'COMP_3',
    'LIKE_1', 'LIKE_2', 'LIKE_3',
    'CUSA_1', 'CUSA_2', 'CUSA_3',
    'CUSL_1', 'CUSL_2', 'CUSL_3'
  ];

  return {
    name: 'Corporate Reputation Dataset (N=150)',
    columns,
    rows
  };
}

// Generate the Technology Acceptance Model (TAM) dataset
function generateTamData(numRows = 120): Dataset {
  const rows: Record<string, number>[] = [];

  for (let i = 0; i < numRows; i++) {
    // Latent variables
    const peou = randomNormal(0, 1);
    const pu = 0.50 * peou + randomNormal(0, Math.sqrt(1 - 0.50 * 0.50));
    const att = 0.30 * peou + 0.50 * pu + randomNormal(0, 0.5);
    const bi = 0.40 * pu + 0.45 * att + randomNormal(0, 0.4);

    // Reflective indicators
    const peou_1 = 0.85 * peou + randomNormal(0, 0.35);
    const peou_2 = 0.82 * peou + randomNormal(0, 0.40);
    const peou_3 = 0.79 * peou + randomNormal(0, 0.45);

    const pu_1 = 0.88 * pu + randomNormal(0, 0.30);
    const pu_2 = 0.84 * pu + randomNormal(0, 0.38);
    const pu_3 = 0.81 * pu + randomNormal(0, 0.42);

    const att_1 = 0.90 * att + randomNormal(0, 0.28);
    const att_2 = 0.85 * att + randomNormal(0, 0.35);
    const att_3 = 0.82 * att + randomNormal(0, 0.40);

    const bi_1 = 0.92 * bi + randomNormal(0, 0.25);
    const bi_2 = 0.88 * bi + randomNormal(0, 0.32);

    rows.push({
      PEOU_1: parseFloat(peou_1.toFixed(3)),
      PEOU_2: parseFloat(peou_2.toFixed(3)),
      PEOU_3: parseFloat(peou_3.toFixed(3)),
      PU_1: parseFloat(pu_1.toFixed(3)),
      PU_2: parseFloat(pu_2.toFixed(3)),
      PU_3: parseFloat(pu_3.toFixed(3)),
      ATT_1: parseFloat(att_1.toFixed(3)),
      ATT_2: parseFloat(att_2.toFixed(3)),
      ATT_3: parseFloat(att_3.toFixed(3)),
      BI_1: parseFloat(bi_1.toFixed(3)),
      BI_2: parseFloat(bi_2.toFixed(3)),
    });
  }

  const columns = [
    'PEOU_1', 'PEOU_2', 'PEOU_3',
    'PU_1', 'PU_2', 'PU_3',
    'ATT_1', 'ATT_2', 'ATT_3',
    'BI_1', 'BI_2'
  ];

  return {
    name: 'Technology Acceptance Model Dataset (N=120)',
    columns,
    rows
  };
}

export const builtInDatasets = {
  corpRep: generateCorpRepData(),
  tam: generateTamData()
};

// Default Models corresponding to the builtInDatasets
export const defaultCorpRepModel = {
  constructs: [
    {
      id: 'comp',
      name: 'Competence (COMP)',
      type: 'reflective',
      x: 180,
      y: 150,
      indicators: ['COMP_1', 'COMP_2', 'COMP_3'],
      indicatorAlignment: 'left'
    },
    {
      id: 'like',
      name: 'Likeability (LIKE)',
      type: 'reflective',
      x: 180,
      y: 400,
      indicators: ['LIKE_1', 'LIKE_2', 'LIKE_3'],
      indicatorAlignment: 'left'
    },
    {
      id: 'cusa',
      name: 'Satisfaction (CUSA)',
      type: 'reflective',
      x: 480,
      y: 270,
      indicators: ['CUSA_1', 'CUSA_2', 'CUSA_3'],
      indicatorAlignment: 'top'
    },
    {
      id: 'cusl',
      name: 'Loyalty (CUSL)',
      type: 'reflective',
      x: 750,
      y: 270,
      indicators: ['CUSL_1', 'CUSL_2', 'CUSL_3'],
      indicatorAlignment: 'right'
    }
  ] as Construct[],
  paths: [
    { id: 'p1', from: 'comp', to: 'like' },
    { id: 'p2', from: 'comp', to: 'cusa' },
    { id: 'p3', from: 'like', to: 'cusa' },
    { id: 'p4', from: 'like', to: 'cusl' },
    { id: 'p5', from: 'cusa', to: 'cusl' }
  ] as StructuralPath[]
};

export const defaultTamModel = {
  constructs: [
    {
      id: 'peou',
      name: 'Ease of Use (PEOU)',
      type: 'reflective',
      x: 180,
      y: 180,
      indicators: ['PEOU_1', 'PEOU_2', 'PEOU_3'],
      indicatorAlignment: 'left'
    },
    {
      id: 'pu',
      name: 'Usefulness (PU)',
      type: 'reflective',
      x: 420,
      y: 180,
      indicators: ['PU_1', 'PU_2', 'PU_3'],
      indicatorAlignment: 'top'
    },
    {
      id: 'att',
      name: 'Attitude (ATT)',
      type: 'reflective',
      x: 420,
      y: 420,
      indicators: ['ATT_1', 'ATT_2', 'ATT_3'],
      indicatorAlignment: 'bottom'
    },
    {
      id: 'bi',
      name: 'Intention (BI)',
      type: 'reflective',
      x: 720,
      y: 300,
      indicators: ['BI_1', 'BI_2'],
      indicatorAlignment: 'right'
    }
  ] as Construct[],
  paths: [
    { id: 'p1', from: 'peou', to: 'pu' },
    { id: 'p2', from: 'peou', to: 'att' },
    { id: 'p3', from: 'pu', to: 'att' },
    { id: 'p4', from: 'pu', to: 'bi' },
    { id: 'p5', from: 'att', to: 'bi' }
  ] as StructuralPath[]
};
