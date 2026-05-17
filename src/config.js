// All tunables in one place. Distances in meters, speeds in m/s, angles in radians unless noted.

export const WORLD = {
  groundSize: 40000,        // square ground extent
  skyColor: 0x9fd3ff,
  groundColor: 0x4a6b3a,
  fogNear: 1500,
  fogFar: 18000,
  sunDir: [-0.4, 0.85, 0.3],
  startAltitude: 1200,
  startSpeed: 180,          // ~m/s, roughly 650 km/h
};

export const JET = {
  mass: 9000,                // kg, F-16-ish empty-ish
  maxThrust: 130000,         // N at full afterburner
  // Aerodynamics (toy model, not real coefficients)
  liftSlope: 5.5,            // lift coefficient per radian of AoA (pre-stall)
  stallAoA: 0.28,            // ~16 degrees
  postStallLift: 0.25,       // collapse multiplier after stall
  parasiticDrag: 0.018,
  inducedDragK: 0.04,
  wingArea: 28,
  airDensity: 1.10,          // sea-level-ish; we ignore altitude falloff for sim feel

  // Control rates (rad/s at full deflection)
  pitchRate: 1.4,
  rollRate: 3.5,
  yawRate: 0.6,

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
