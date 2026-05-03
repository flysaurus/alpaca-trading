export interface Exercise {
  id: string;
  name: string;
  category: 'strength' | 'cardio' | 'mobility' | 'balance' | 'hiking';
  targetMuscles: string[];
  description: string;
  sets?: string;
  reps?: string;
  duration?: string;
  youtubeId?: string;
  tips: string[];
  progression?: string;
  forKili: string;
}

export const exercises: Exercise[] = [
  // Lower Body Strength
  {
    id: 'squat',
    name: 'Goblet Squat',
    category: 'strength',
    targetMuscles: ['Quadriceps', 'Glutes', 'Core'],
    description: 'Hold a dumbbell or kettlebell at chest level. Feet shoulder-width apart, lower hips back and down until thighs are parallel to floor.',
    sets: '3-4',
    reps: '10-15',
    youtubeId: 'MeIiIdhvXT4',
    tips: [
      'Keep chest up, don\'t let knees cave inward',
      'Go as deep as comfortable — depth matters for Kili',
      'Weight in heels, not toes',
    ],
    progression: 'Increase weight, then move to barbell back squats',
    forKili: 'Primary muscle group for uphill trekking. The constant stepping up on Kili demands quad and glute endurance.',
  },
  {
    id: 'lunge',
    name: 'Walking Lunges',
    category: 'strength',
    targetMuscles: ['Quadriceps', 'Glutes', 'Hamstrings', 'Calves'],
    description: 'Step forward into a lunge, lowering back knee toward ground. Push through front heel to stand, bring back foot forward into next lunge.',
    sets: '3',
    reps: '10-12 each leg',
    youtubeId: 'Pbmj6xPo-Hw',
    tips: [
      'Keep torso upright — no leaning forward',
      'Front knee stays over ankle, not past toes',
      'Control the descent, don\'t drop',
    ],
    progression: 'Add dumbbells, or try Bulgarian split squats for more intensity',
    forKili: 'Mimics uneven terrain and single-leg demands of hiking. Critical for downhill stability too.',
  },
  {
    id: 'stepup',
    name: 'Step-Ups',
    category: 'strength',
    targetMuscles: ['Quadriceps', 'Glutes', 'Calves'],
    description: 'Step onto a sturdy bench or box (12-20 inches). Drive through heel, bring other foot up. Step back down controlled.',
    sets: '3-4',
    reps: '12-15 each leg',
    youtubeId: 'WCFCdxzFBa4',
    tips: [
      'Box height: start at knee height, progress to mid-thigh',
      'Drive through full foot, not just toes',
      'Control the eccentric (lowering) phase',
    ],
    progression: 'Increase box height, add dumbbells, or try weighted vest',
    forKili: 'THE most specific exercise for Kili. You will do thousands of step-ups on the mountain. Build the exact pattern.',
  },
  {
    id: 'rdl',
    name: 'Romanian Deadlift',
    category: 'strength',
    targetMuscles: ['Hamstrings', 'Glutes', 'Lower Back'],
    description: 'Hold barbell or dumbbells in front of thighs. Hinge at hips, keeping back flat, lowering weight along legs until you feel hamstring stretch.',
    sets: '3',
    reps: '8-12',
    youtubeId: 'JCXUYuzwNrM',
    tips: [
      'Slight knee bend — not locked out, not squatted',
      'Bar stays close to body throughout',
      'Feel the stretch in hamstrings, not lower back',
    ],
    progression: 'Increase weight, or switch to single-leg RDL for balance challenge',
    forKili: 'Downhill trekking hammers hamstrings. Strong posterior chain prevents fatigue and injury on descents.',
  },
  {
    id: 'calfraise',
    name: 'Calf Raises',
    category: 'strength',
    targetMuscles: ['Calves', 'Ankles'],
    description: 'Stand on edge of step with heels hanging off. Rise up on toes as high as possible, lower below step level for full stretch.',
    sets: '3-4',
    reps: '15-20',
    youtubeId: '-qsRtp_PbVM',
    tips: [
      'Full range of motion — all the way down, all the way up',
      'Pause at top for 1-2 seconds',
      'Try single-leg once bodyweight is easy',
    ],
    progression: 'Add dumbbells, backpack weight, or use single leg',
    forKili: 'Calves drive every step uphill and absorb impact downhill. Weak calves = early fatigue on trail.',
  },

  // Core
  {
    id: 'plank',
    name: 'Plank',
    category: 'strength',
    targetMuscles: ['Core', 'Shoulders'],
    description: 'Forearms on ground, elbows under shoulders. Body in straight line from head to heels. Hold.',
    sets: '3',
    duration: '30-60 seconds',
    youtubeId: 'pSHjTRCQxIw',
    tips: [
      'Don\'t let hips sag or pike up',
      'Breathe normally — don\'t hold breath',
      'Squeeze glutes to protect lower back',
    ],
    progression: 'Increase time, add weight on back, or try side planks',
    forKili: 'Core stability carries your pack for 6-8 hours daily. Weak core = back pain and poor posture at altitude.',
  },
  {
    id: 'deadbug',
    name: 'Dead Bug',
    category: 'strength',
    targetMuscles: ['Core', 'Hip Flexors'],
    description: 'Lie on back, arms extended up, legs in table top. Lower opposite arm and leg, keeping lower back pressed to floor.',
    sets: '3',
    reps: '10 each side',
    youtubeId: 'g_BYB0R-4Ws',
    tips: [
      'Lower back MUST stay flat — if it arches, reduce range of motion',
      'Move slowly and controlled',
      'Exhale as you extend',
    ],
    progression: 'Add resistance band, or hold weights in hands',
    forKili: 'Anti-extension core strength protects spine under pack load. Prevents the arching that causes trail back pain.',
  },

  // Cardio
  {
    id: 'stairmaster',
    name: 'StairMaster / Stepmill',
    category: 'cardio',
    targetMuscles: ['Quadriceps', 'Glutes', 'Calves', 'Cardiovascular System'],
    description: 'Continuous stepping on rotating stairs. Maintain upright posture, don\'t lean on handles.',
    duration: '20-45 minutes',
    youtubeId: 'xSB39wbMz4w',
    tips: [
      'Don\'t lean on the handles — hands lightly touching only',
      'Full foot on each step',
      'Level 4-6 for endurance, 8-10 for intervals',
    ],
    progression: 'Increase time, then increase speed/level',
    forKili: 'The single best cardio simulator for Kili. The continuous stepping exactly replicates summit day.',
  },
  {
    id: 'inclinewalk',
    name: 'Treadmill Incline Walk',
    category: 'cardio',
    targetMuscles: ['Quadriceps', 'Glutes', 'Calves', 'Cardiovascular System'],
    description: 'Set treadmill to 10-15% incline. Walk at 3-3.5 mph with pack or vest.',
    duration: '30-60 minutes',
    youtubeId: 'NAsObfFJXvE',
    tips: [
      'Add weight via pack or vest for specificity',
      'Don\'t hold the handrails',
      'Maintain nasal breathing if possible (aerobic zone)',
    ],
    progression: 'Increase incline to 15%, then add pack weight up to 15-20 lbs',
    forKili: 'Specific uphill endurance. Start with bodyweight, build to carrying your actual pack weight.',
  },
  {
    id: 'hiking',
    name: 'Hiking with Pack',
    category: 'hiking',
    targetMuscles: ['Full Body', 'Cardiovascular System'],
    description: 'Find trails with elevation gain. Wear your actual hiking boots and pack with weight.',
    duration: '2-6 hours',
    // youtubeId: 'TODO-find-real-video',
    tips: [
      'Use the boots you\'ll wear on Kili — break them in!',
      'Start with 10 lbs, add 2-3 lbs per week to 20-25 lbs',
      'Practice pacing: slow and steady, breathe through nose',
    ],
    progression: 'More elevation gain, more weight, longer duration',
    forKili: 'Nothing beats actual hiking. Gears your mind, feet, and body for the real thing.',
  },

  // Mobility & Balance
  {
    id: 'anklemobility',
    name: 'Ankle Mobility Drill',
    category: 'mobility',
    targetMuscles: ['Ankles', 'Calves'],
    description: 'Kneel with toes tucked under. Sit back on heels. Also do knee-to-wall dorsiflexion test.',
    sets: '2-3',
    duration: '30-60 seconds',
    youtubeId: '4GW6QdSaQ6U',
    tips: [
      'Essential for ankle injury recovery/prevention',
      'Do before every lower body workout',
      'If knee can\'t touch wall 5 inches away, work on this daily',
    ],
    progression: 'Add band resistance for joint mobilization',
    forKili: 'Your previously injured ankle needs extra love. Limited ankle mobility = compensations that cause knee/hip/ back issues on trail.',
  },
  {
    id: 'singleleg',
    name: 'Single-Leg Balance',
    category: 'balance',
    targetMuscles: ['Ankles', 'Calves', 'Hips', 'Core'],
    description: 'Stand on one leg, slight knee bend. Hold 30 seconds. Progress to eyes closed or unstable surface.',
    sets: '2-3',
    duration: '30-45 seconds each',
    youtubeId: '7SF7AYh2_Yw',
    tips: [
      'Barefoot for extra proprioception benefit',
      'Don\'t let hip hike — keep pelvis level',
      'Focus on a spot, but challenge yourself on unstable surface',
    ],
    progression: 'Eyes closed, then BOSU ball, then single-leg Romanian deadlift',
    forKili: 'Uneven terrain, rocks, scree — your ankle needs to react instantly. Prevents re-injury on unstable surfaces.',
  },
  {
    id: 'hipmobility',
    name: 'Hip 90/90 Stretch',
    category: 'mobility',
    targetMuscles: ['Hips', 'Glutes'],
    description: 'Sit with both legs at 90 degrees (one front, one back). Keep back straight, lean forward over front leg.',
    sets: '2',
    duration: '45-60 seconds each side',
    youtubeId: 't4Zz6-aG8Iw',
    tips: [
      'Keep both sit bones grounded if possible',
      'Back straight — hinge from hips, not round spine',
      'Breathe into the stretch',
    ],
    progression: 'Add rotation by lifting back knee, or transition between sides dynamically',
    forKili: 'Tight hips lead to lower back compensation under pack load. Mobile hips = happy spine on long days.',
  },

  // Recovery
  {
    id: 'foamroll',
    name: 'Foam Rolling — Legs',
    category: 'mobility',
    targetMuscles: ['Quadriceps', 'IT Band', 'Calves'],
    description: 'Slowly roll each muscle group, pausing on tender spots. 30-60 seconds per area.',
    duration: '10-15 minutes',
    // REI article: https://www.rei.com/learn/expert-advice/foam-roller-exercises.html
    tips: [
      'Not too painful — discomfort yes, agony no',
      'Breathe and relax into it',
      'Do post-workout or on rest days',
    ],
    progression: 'Use harder roller or lacrosse ball for targeted work',
    forKili: 'Recovery is training. Rolling increases blood flow, reduces soreness, keeps you consistent with workouts.',
  },
];

export const exerciseCategories = [
  { key: 'all', label: 'All Exercises', color: 'bg-slate-100 text-slate-800' },
  { key: 'strength', label: 'Strength', color: 'bg-amber-100 text-amber-800' },
  { key: 'cardio', label: 'Cardio', color: 'bg-rose-100 text-rose-800' },
  { key: 'hiking', label: 'Hiking', color: 'bg-emerald-100 text-emerald-800' },
  { key: 'mobility', label: 'Mobility', color: 'bg-blue-100 text-blue-800' },
  { key: 'balance', label: 'Balance', color: 'bg-purple-100 text-purple-800' },
] as const;

export type CategoryKey = typeof exerciseCategories[number]['key'];
