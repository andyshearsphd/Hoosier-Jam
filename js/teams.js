// Hoosier Jam: Delaware County schools (round one) and rosters.
// PLAYERS ARE FICTIONAL PLACEHOLDERS. Real all-time players can replace them later.
// Ratings are 1 to 10: spd speed, sht two-point shooting, thr three-pointers, dnk dunking, blk blocking/defense, stl steals.
// h is height in feet (6.5 = 6'6"). Skin: light, tan, medium, brown, dark. Hair: short, flattop, afro, mullet, bald, parted.
// Each school has a road (colored) uniform and a home (light) uniform. The player's team wears home, the CPU wears road.
'use strict';
const P_ = (name, nick, num, h, skin, hair, hairColor, r, extra = {}) => ({ name, nick, num, h, skin, hair, hairColor, r, ...extra });
const R_ = (spd, sht, thr, dnk, blk, stl) => ({ spd, sht, thr, dnk, blk, stl });

const SCHOOLS = [
  { key: 'central', city: 'CENTRAL', mascot: 'BEARCATS', blurb: 'THE POWERHOUSE. 8 STATE TITLES.',
    colors: ['#5b2d8e', '#ffffff'],
    road: { jersey: '#5b2d8e', trim: '#ffffff', numColor: '#ffffff' },
    home: { jersey: '#f6f4f8', trim: '#5b2d8e', numColor: '#5b2d8e' },
    players: [
      P_('MADDOX', 'SKY', 33, 6.58, 'dark', 'short', 'black', R_(7, 7, 4, 10, 8, 6)),
      P_('KESSLER', 'LONG BALL', 12, 6.25, 'light', 'flattop', 'brown', R_(6, 9, 9, 5, 4, 6)),
      P_('JAMES', 'SLICK', 5, 6.08, 'brown', 'short', 'black', R_(9, 7, 7, 7, 4, 9), { headband: '#ffffff' }),
    ] },
  { key: 'south', city: 'SOUTH', mascot: 'REBELS', blurb: 'WORKING CLASS GRINDERS.',
    colors: ['#c8202f', '#ffffff'],
    road: { jersey: '#c8202f', trim: '#ffffff', numColor: '#ffffff' },
    home: { jersey: '#f6f4f4', trim: '#c8202f', numColor: '#c8202f' },
    players: [
      P_('ZALESKI', 'HARDHAT', 44, 6.67, 'light', 'mullet', 'brown', R_(5, 6, 3, 8, 8, 4), { stache: true }),
      P_('PRICE', 'BOOTS', 21, 6.17, 'dark', 'bald', 'black', R_(8, 7, 6, 7, 5, 8), { headband: '#c8202f' }),
      P_('RHOADES', 'SHIFTWORK', 3, 6.0, 'tan', 'parted', 'blond', R_(7, 8, 8, 4, 3, 6)),
    ] },
  { key: 'north', city: 'NORTH', mascot: 'TITANS', blurb: 'THE RICH KIDS ACROSS TOWN.',
    colors: ['#1c3a8a', '#c8202f', '#ffffff'],
    road: { jersey: '#1c3a8a', trim: '#c8202f', numColor: '#ffffff' },
    home: { jersey: '#f6f6fa', trim: '#1c3a8a', numColor: '#c8202f' },
    players: [
      P_('PRESTON', 'CHIP', 50, 6.75, 'light', 'parted', 'blond', R_(5, 6, 3, 8, 9, 3)),
      P_('BANCROFT', 'TRIP', 11, 6.17, 'light', 'short', 'brown', R_(7, 8, 9, 4, 3, 5)),
      P_('HOLLIS', 'SKIP', 24, 6.33, 'light', 'flattop', 'blond', R_(7, 6, 6, 7, 5, 6)),
    ] },
  { key: 'burris', city: 'BURRIS', mascot: 'OWLS', blurb: 'THE MAGNET SCHOOL BRAINIACS.',
    colors: ['#2a62c9', '#f2c230'],
    road: { jersey: '#2a62c9', trim: '#f2c230', numColor: '#f2c230' },
    home: { jersey: '#f6f6f8', trim: '#2a62c9', numColor: '#2a62c9' },
    players: [
      P_('AUSTERMAN', 'PROFESSOR', 14, 6.08, 'light', 'parted', 'red', R_(6, 9, 8, 3, 3, 6)),
      P_('HOLT', 'EINSTEIN', 22, 6.42, 'medium', 'afro', 'black', R_(7, 7, 6, 7, 6, 7)),
      P_('VANDERWALL', 'THE OWL', 40, 6.67, 'tan', 'short', 'brown', R_(5, 6, 4, 7, 8, 4)),
    ] },
  { key: 'yorktown', city: 'YORKTOWN', mascot: 'TIGERS', blurb: 'OLD DOORMAT, NEW MONEY.',
    colors: ['#1e7a3c', '#ffffff'],
    road: { jersey: '#1e7a3c', trim: '#ffffff', numColor: '#ffffff' },
    home: { jersey: '#f6f8f6', trim: '#1e7a3c', numColor: '#1e7a3c' },
    players: [
      P_('SPURLOCK', 'CORNFED', 32, 6.5, 'light', 'mullet', 'blond', R_(5, 5, 3, 7, 7, 4)),
      P_('HADLEY', 'PITCHFORK', 10, 6.0, 'light', 'short', 'brown', R_(7, 6, 7, 4, 3, 6)),
      P_('NIX', 'TRACTOR', 23, 6.25, 'tan', 'flattop', 'black', R_(6, 6, 5, 6, 5, 5)),
    ] },
  { key: 'delta', city: 'DELTA', mascot: 'EAGLES', blurb: 'SUBURBAN AND SHARP.',
    colors: ['#1a3480', '#f2b705'],
    road: { jersey: '#1a3480', trim: '#f2b705', numColor: '#f2b705' },
    home: { jersey: '#f2b705', trim: '#1a3480', numColor: '#1a3480' },
    players: [
      P_('DEAKINS', "COACH'S KID", 2, 6.17, 'light', 'parted', 'brown', R_(7, 8, 8, 5, 4, 7)),
      P_('KORTEPETER', 'BIG BIRD', 45, 6.83, 'light', 'short', 'blond', R_(4, 6, 2, 8, 9, 3)),
      P_('TATE', 'SWOOP', 15, 6.33, 'medium', 'short', 'black', R_(8, 7, 6, 8, 5, 7)),
    ] },
  { key: 'daleville', city: 'DALEVILLE', mascot: 'BRONCOS', blurb: 'SMALL TOWN, BIG HEART.',
    colors: ['#6b3e1f', '#151515', '#ffffff'],
    road: { jersey: '#6b3e1f', trim: '#ffffff', numColor: '#ffffff' },
    home: { jersey: '#f6f4f2', trim: '#6b3e1f', numColor: '#151515' },
    players: [
      P_('WAGNER', 'BUCK', 30, 6.25, 'light', 'mullet', 'brown', R_(6, 7, 6, 5, 5, 5), { stache: true }),
      P_('PEEK', 'STALLION', 4, 6.0, 'tan', 'short', 'black', R_(8, 6, 7, 4, 3, 7)),
      P_('BRUMMETT', 'HAYLOFT', 42, 6.58, 'light', 'flattop', 'red', R_(4, 5, 2, 7, 7, 3)),
    ] },
  { key: 'wapahani', city: 'WAPAHANI', mascot: 'RAIDERS', blurb: 'COUNTY SCORING MACHINES.',
    colors: ['#b81d24', '#151515', '#ffffff'],
    road: { jersey: '#b81d24', trim: '#151515', numColor: '#ffffff' },
    home: { jersey: '#f6f4f4', trim: '#b81d24', numColor: '#151515' },
    players: [
      P_('ASHCRAFT', 'THE RECORD', 20, 6.33, 'light', 'short', 'brown', R_(7, 9, 8, 5, 4, 6)),
      P_('FOUTS', 'PLUNDER', 34, 6.58, 'light', 'parted', 'blond', R_(5, 6, 4, 7, 7, 4)),
      P_('LAMB', 'CUTLASS', 1, 6.0, 'brown', 'bald', 'black', R_(9, 6, 6, 5, 3, 8)),
    ] },
  { key: 'cowan', city: 'COWAN', mascot: 'BLACKHAWKS', blurb: 'COUNTRY TOUGH.',
    colors: ['#161616', '#e8b923'],
    road: { jersey: '#1b1b1d', trim: '#e8b923', numColor: '#e8b923' },
    home: { jersey: '#f6f6f2', trim: '#1b1b1d', numColor: '#1b1b1d' },
    players: [
      P_('MERCER', 'TALONS', 24, 6.42, 'medium', 'short', 'black', R_(7, 6, 5, 7, 6, 7)),
      P_('SHOAF', 'HAWKEYE', 11, 6.08, 'light', 'parted', 'brown', R_(6, 7, 8, 3, 3, 6)),
      P_('MOORMAN', 'WINGSPAN', 52, 6.67, 'tan', 'flattop', 'brown', R_(4, 5, 2, 7, 8, 3)),
    ] },
  { key: 'wesdel', city: 'WES-DEL', mascot: 'WARRIORS', blurb: 'NOBODY WANTS TO PLAY THEM.',
    colors: ['#161616', '#c8202f', '#ffffff'],
    road: { jersey: '#1b1b1d', trim: '#c8202f', numColor: '#c8202f' },
    home: { jersey: '#f6f4f4', trim: '#c8202f', numColor: '#1b1b1d' },
    players: [
      P_('STOUT', 'TANK', 35, 6.58, 'light', 'short', 'brown', R_(5, 6, 3, 8, 8, 4)),
      P_('LENNARTZ', 'SNIPER', 13, 6.08, 'light', 'parted', 'blond', R_(7, 8, 8, 3, 3, 6)),
      P_('HAMM', 'BULLDOZER', 23, 6.25, 'tan', 'mullet', 'black', R_(7, 6, 5, 6, 6, 6)),
    ] },
];

// Builds the team object the game uses for one side of a matchup.
function makeTeam(school, home) {
  const u = home ? school.home : school.road;
  return {
    key: school.key, name: school.mascot, city: school.city, full: school.city + ' ' + school.mascot,
    primary: school.road.jersey, secondary: school.road.trim,
    jersey: u.jersey, trim: u.trim, shorts: u.jersey, numColor: u.numColor,
    players: school.players, home
  };
}
const teamRating = s => {
  const all = s.players.flatMap(p => Object.values(p.r));
  return all.reduce((a, b) => a + b, 0) / all.length;
};

// TEAMS[0] is the player's team (home whites), TEAMS[1] is the CPU (road colors). Set by the team picker.
const TEAMS = [makeTeam(SCHOOLS[0], true), makeTeam(SCHOOLS[1], false)];
