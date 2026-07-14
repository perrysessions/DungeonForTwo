// Audio: Web Audio API wrapper for SFX + background music.
// All sounds loaded from assets/sounds/. Music loops automatically.

const ctx = new (window.AudioContext || window.webkitAudioContext)();
const buffers = {};
let musicSource = null;
let musicGain = null;
let sfxGain = null;
let currentTrack = null;

// Master gains
const masterGain = ctx.createGain();
masterGain.gain.value = 1;
masterGain.connect(ctx.destination);

sfxGain = ctx.createGain();
sfxGain.gain.value = 0.7;
sfxGain.connect(masterGain);

musicGain = ctx.createGain();
musicGain.gain.value = 0.25;
musicGain.connect(masterGain);

const SFX_FILES = {
  hit:           'assets/sounds/hit.ogg',
  player_hit:    'assets/sounds/player_hit.ogg',
  enemy_die:     'assets/sounds/hit.ogg',
  pickup_gold:   'assets/sounds/pickup_gold.ogg',
  pickup_item:   'assets/sounds/pickup_item.ogg',
  level_up:      'assets/sounds/level_up.ogg',
  ability:       'assets/sounds/mage_ability.ogg',
  sword_ability: 'assets/sounds/sword_ability.ogg',
  floor_clear:   'assets/sounds/finished_level.ogg',
};

const MUSIC_FILES = {
  dungeon: 'assets/sounds/make-believe-giulio-fazio-main-version-16260-01-24.mp3',
  boss:    'assets/sounds/boss_music.ogg',
  death:   'assets/sounds/death_music.ogg',
};

async function loadBuffer(url) {
  if (buffers[url]) return buffers[url];
  try {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(arr);
    buffers[url] = buf;
    return buf;
  } catch (e) {
    console.warn('Audio load failed:', url, e);
    return null;
  }
}

export async function preloadAudio() {
  const all = [...Object.values(SFX_FILES), ...Object.values(MUSIC_FILES)];
  await Promise.all(all.map(loadBuffer));
}

export function playSfx(name, volume = 1) {
  if (ctx.state === 'suspended') ctx.resume();
  const url = SFX_FILES[name];
  if (!url || !buffers[url]) return;
  const src = ctx.createBufferSource();
  src.buffer = buffers[url];
  const g = ctx.createGain();
  g.gain.value = volume;
  src.connect(g);
  g.connect(sfxGain);
  src.start();
}

export function playMusic(name, { fadeIn = 0, volume = 0.25, loop = true } = {}) {
  if (currentTrack === name) return;
  _startMusic(name, fadeIn, volume, loop);
}

function _startMusic(name, fadeIn = 0, volume = 0.25, loop = true) {
  stopMusic();
  currentTrack = name;
  if (ctx.state === 'suspended') ctx.resume();
  const url = MUSIC_FILES[name];
  if (!url || !buffers[url]) return;
  musicSource = ctx.createBufferSource();
  musicSource.buffer = buffers[url];
  musicSource.loop = loop;
  musicSource.connect(musicGain);
  if (fadeIn > 0) {
    musicGain.gain.setValueAtTime(0, ctx.currentTime);
    musicGain.gain.linearRampToValueAtTime(volume, ctx.currentTime + fadeIn);
  } else {
    musicGain.gain.setValueAtTime(volume, ctx.currentTime);
  }
  musicSource.start();
}

export function stopMusic() {
  if (musicSource) {
    try { musicSource.stop(); } catch (_) {}
    musicSource = null;
  }
  currentTrack = null;
}

export function fadeOutMusic(duration = 1.0) {
  if (!musicSource) return;
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
  musicGain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
  setTimeout(() => stopMusic(), duration * 1000);
}

export function fadeOutThenIn(name, outDuration = 1.2, inDuration = 2.0, volume = 0.25) {
  if (!musicSource) { playMusic(name, { fadeIn: inDuration, volume }); return; }
  fadeOutMusic(outDuration);
  setTimeout(() => _startMusic(name, inDuration, volume), outDuration * 1000 + 50);
}

export function resumeAudio() {
  if (ctx.state === 'suspended') ctx.resume();
}

export function setMusicVolume(v) {
  // Only set if not currently mid-fade (cancel any scheduled ramps first).
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setValueAtTime(v, ctx.currentTime);
}

export function setSfxVolume(v) {
  sfxGain.gain.setValueAtTime(v, ctx.currentTime);
}
