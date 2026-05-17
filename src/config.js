// All tunables in one place. Distances in meters, speeds in m/s, angles in radians unless noted.

export const WORLD = {
  groundSize: 80000,        // square ground extent — vast landscape
  skyColor: 0x9fd3ff,
  groundColor: 0x4a6b3a,
  fogNear: 4000,
  fogFar: 45000,
  sunDir: [-0.4, 0.85, 0.3],
  startAltitude: 2400,      // above the tallest mountain peaks
  startSpeed: 180,          // ~m/s, roughly 650 km/h
};

export const JET = {
  mass: 9000,                // kg, F-16-ish empty-ish
  maxThrust: 130000,         // N at full afterburner
  // Aerodynamics (toy model, not real coefficients)
  liftSlope: 5.5,            // lift coefficient per radian of AoA (pre-stall)
  stallAoA: 0.42,            // base critical AoA (~24°) — only at low speed
  stallSpeed: 70,            // m/s; below this, stallAoA applies. Above, AoA tolerance grows
  postStallLift: 0.55,       // milder lift collapse — easier to recover
  parasiticDrag: 0.018,
  inducedDragK: 0.04,
  wingArea: 28,
  airDensity: 1.10,          // sea-level-ish; we ignore altitude falloff for sim feel

  // Control rates (rad/s at full deflection) — less twitchy
  pitchRate: 0.85,
  rollRate: 2.2,
  yawRate: 0.4,

  // Throttle behavior
  throttleResponse: 0.55,    // how fast throttle setting tracks input (per second)

  // Damage
  maxHull: 100,
};

export const GUNS = {
  rateOfFire: 18,            // rounds per second
  muzzleSpeed: 1000,
  spread: 0.0025,
  range: 1800,
  damage: 8,
};

export const MISSILE = {
  speed: 380,
  acceleration: 220,
  maxSpeed: 900,
  turnRate: 2.4,             // rad/s
  fuse: 12,                  // seconds before self-destruct
  damage: 70,
  lockCone: Math.cos(0.5),   // ~30deg half-angle as cosine
  lockRange: 6000,
};

export const ENEMIES = {
  count: 4,
  speed: 160,
  turnRate: 0.7,
  gunRange: 900,
  hull: 60,
};

export const RADAR = {
  range: 8000,
  size: 180,
};
