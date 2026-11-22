// Hoosier Jam: team rosters.
// PLACEHOLDER TEAMS for testing feel and gameplay. Real Delaware County schools go here later.
// Ratings are 1 to 10: spd speed, sht two-point shooting, thr three-pointers, dnk dunking, blk blocking/defense, stl steals.
// h is height in feet (6.5 = 6'6").
'use strict';
const TEAMS = [
  {
    name: 'BULLDOGS', city: 'RED', full: 'RED BULLDOGS',
    primary: '#c8202f', secondary: '#ffffff', jersey: '#c8202f', trim: '#ffffff', shorts: '#c8202f', numColor: '#ffffff',
    players: [
      { name: 'HAMMOND', nick: 'HOOK', num: 44, h: 6.67, skin: 'light', hair: 'flattop', hairColor: 'brown',
        r: { spd: 4, sht: 5, thr: 2, dnk: 9, blk: 9, stl: 3 } },
      { name: 'SIMS', nick: 'SWEET PETE', num: 12, h: 6.08, skin: 'dark', hair: 'short', hairColor: 'black',
        r: { spd: 7, sht: 8, thr: 9, dnk: 4, blk: 3, stl: 6 } },
      { name: 'BELL', nick: "JUMPIN' JOE", num: 23, h: 6.33, skin: 'tan', hair: 'mullet', hairColor: 'blond', stache: true,
        r: { spd: 7, sht: 6, thr: 5, dnk: 7, blk: 6, stl: 6 } },
    ]
  },
  {
    name: 'EAGLES', city: 'BLUE', full: 'BLUE EAGLES',
    primary: '#1f4fb8', secondary: '#f2c230', jersey: '#1f4fb8', trim: '#f2c230', shorts: '#1f4fb8', numColor: '#f2c230',
    players: [
      { name: 'ROSS', nick: 'TOWER', num: 50, h: 6.75, skin: 'brown', hair: 'afro', hairColor: 'black',
        r: { spd: 4, sht: 6, thr: 1, dnk: 8, blk: 9, stl: 3 } },
      { name: 'FRY', nick: 'DEAD-EYE', num: 3, h: 6.0, skin: 'light', hair: 'parted', hairColor: 'red',
        r: { spd: 6, sht: 9, thr: 9, dnk: 3, blk: 2, stl: 5 } },
      { name: 'LANE', nick: 'QUICK RICK', num: 10, h: 6.17, skin: 'dark', hair: 'bald', hairColor: 'black', headband: '#ffffff',
        r: { spd: 9, sht: 6, thr: 6, dnk: 6, blk: 4, stl: 9 } },
    ]
  }
];
