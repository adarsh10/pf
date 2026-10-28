/**
 * The grid: ten constructors, twenty drivers.
 *
 * Colours are the on-car liveries rather than the marketing palette, so
 * `primary` is what covers most of the bodywork, `secondary` is the darker
 * contrast (usually carbon or a dark panel) and `accent` is the flash colour
 * used on the wings, halo and engine cover stripe.
 *
 * `pace` is a plain multiplier on the AI speed profile. It is the only thing
 * that separates one AI driver from another, so it doubles as the seeding
 * order when the field is picked.
 */

export const TEAMS = [
  {
    id: 'redbull',
    name: 'Oracle Red Bull Racing',
    short: 'Red Bull',
    primary: 0x14275e,
    secondary: 0x0a0f1e,
    accent: 0xffc906,
    drivers: [
      { code: 'VER', first: 'Max', last: 'Verstappen', number: 1, pace: 1.000 },
      { code: 'PER', first: 'Sergio', last: 'Pérez', number: 11, pace: 0.987 },
    ],
  },
  {
    id: 'mclaren',
    name: 'McLaren Formula 1 Team',
    short: 'McLaren',
    primary: 0xff8000,
    secondary: 0x1b1b1f,
    accent: 0x47c7fc,
    drivers: [
      { code: 'NOR', first: 'Lando', last: 'Norris', number: 4, pace: 0.998 },
      { code: 'PIA', first: 'Oscar', last: 'Piastri', number: 81, pace: 0.994 },
    ],
  },
  {
    id: 'ferrari',
    name: 'Scuderia Ferrari',
    short: 'Ferrari',
    primary: 0xe8002d,
    secondary: 0x1a1a1c,
    accent: 0xfff200,
    drivers: [
      { code: 'LEC', first: 'Charles', last: 'Leclerc', number: 16, pace: 0.996 },
      { code: 'SAI', first: 'Carlos', last: 'Sainz', number: 55, pace: 0.993 },
    ],
  },
  {
    id: 'mercedes',
    name: 'Mercedes-AMG Petronas',
    short: 'Mercedes',
    primary: 0x00d7b6,
    secondary: 0x15161a,
    accent: 0xc8cdd4,
    drivers: [
      { code: 'RUS', first: 'George', last: 'Russell', number: 63, pace: 0.991 },
      { code: 'HAM', first: 'Lewis', last: 'Hamilton', number: 44, pace: 0.989 },
    ],
  },
  {
    id: 'aston',
    name: 'Aston Martin Aramco',
    short: 'Aston Martin',
    primary: 0x1a9e6f,
    secondary: 0x0f2b22,
    accent: 0xcedc00,
    drivers: [
      { code: 'ALO', first: 'Fernando', last: 'Alonso', number: 14, pace: 0.984 },
      { code: 'STR', first: 'Lance', last: 'Stroll', number: 18, pace: 0.972 },
    ],
  },
  {
    id: 'rb',
    name: 'Visa Cash App RB',
    short: 'RB',
    primary: 0x2b4bd6,
    secondary: 0x101423,
    accent: 0xffffff,
    drivers: [
      { code: 'TSU', first: 'Yuki', last: 'Tsunoda', number: 22, pace: 0.982 },
      { code: 'RIC', first: 'Daniel', last: 'Ricciardo', number: 3, pace: 0.976 },
    ],
  },
  {
    id: 'haas',
    name: 'MoneyGram Haas F1 Team',
    short: 'Haas',
    primary: 0xd8dde3,
    secondary: 0x18191d,
    accent: 0xe6002b,
    drivers: [
      { code: 'HUL', first: 'Nico', last: 'Hülkenberg', number: 27, pace: 0.980 },
      { code: 'MAG', first: 'Kevin', last: 'Magnussen', number: 20, pace: 0.970 },
    ],
  },
  {
    id: 'williams',
    name: 'Williams Racing',
    short: 'Williams',
    primary: 0x1c6fd6,
    secondary: 0x0d1526,
    accent: 0x64c4ff,
    drivers: [
      { code: 'ALB', first: 'Alexander', last: 'Albon', number: 23, pace: 0.978 },
      { code: 'SAR', first: 'Logan', last: 'Sargeant', number: 2, pace: 0.964 },
    ],
  },
  {
    id: 'alpine',
    name: 'BWT Alpine F1 Team',
    short: 'Alpine',
    primary: 0x0093cc,
    secondary: 0x12161c,
    accent: 0xff87bc,
    drivers: [
      { code: 'OCO', first: 'Esteban', last: 'Ocon', number: 31, pace: 0.975 },
      { code: 'GAS', first: 'Pierre', last: 'Gasly', number: 10, pace: 0.974 },
    ],
  },
  {
    id: 'sauber',
    name: 'Stake F1 Team Kick Sauber',
    short: 'Sauber',
    primary: 0x00e701,
    secondary: 0x101410,
    accent: 0x000000,
    drivers: [
      { code: 'BOT', first: 'Valtteri', last: 'Bottas', number: 77, pace: 0.968 },
      { code: 'ZHO', first: 'Zhou', last: 'Guanyu', number: 24, pace: 0.966 },
    ],
  },
];

/** Flat list of `{ ...driver, team }` for every entry on the grid. */
export const ENTRIES = TEAMS.flatMap((team) =>
  team.drivers.map((d) => ({
    ...d,
    name: `${d.first} ${d.last}`,
    team,
    teamName: team.short,
    primary: team.primary,
    secondary: team.secondary,
    accent: team.accent,
  }))
);

export function entryByCode(code) {
  return ENTRIES.find((e) => e.code === code) || ENTRIES[0];
}

/**
 * The `count` quickest drivers on the grid, with `exclude` (the player's own
 * code) left out so nobody races themselves.
 */
export function opponentsFor(code, count = 9) {
  return ENTRIES.filter((e) => e.code !== code)
    .sort((a, b) => b.pace - a.pace)
    .slice(0, count);
}
