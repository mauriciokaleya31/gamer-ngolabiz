/**
 * NgolaBiz World 3D — Tempo do mundo e posição solar.
 *
 * Módulo partilhado (ES module) usado pelo servidor de mundo (Node.js) e pelo
 * cliente web. O cliente UE5 replica este algoritmo em C++
 * (unreal/Source/NgolaWorld/Private/Time/LuandaSolarMath.cpp).
 *
 * Regras:
 *  - O instante de referência é SEMPRE um instante UTC (ms desde epoch) vindo do servidor.
 *  - O fuso é identificado pelo nome IANA "Africa/Luanda" (Intl), nunca por um desvio fixo.
 *  - O relógio mostrado ao jogador, o Sol e as rotinas dos NPCs usam o mesmo instante virtual.
 */

export const WORLD_TIME_ZONE = 'Africa/Luanda';

/** Coordenadas de referência solar da cidade virtual (inspirada na Baixa de Luanda). */
export const REFERENCE_LOCATION = Object.freeze({
  name: 'Luanda (referência solar da cidade virtual "Kianda")',
  latitude: -8.8383,
  longitude: 13.2344,
});

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

const partsFormatterCache = new Map();
function partsFormatter(timeZone) {
  let f = partsFormatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    });
    partsFormatterCache.set(timeZone, f);
  }
  return f;
}

/**
 * Converte um instante UTC em data/hora civil no fuso indicado (via base de dados IANA).
 * @returns {{year:number,month:number,day:number,hour:number,minute:number,second:number,
 *            hourFloat:number, offsetMinutes:number, timeZone:string}}
 */
export function localParts(utcMs, timeZone = WORLD_TIME_ZONE) {
  const p = {};
  for (const { type, value } of partsFormatter(timeZone).formatToParts(new Date(utcMs))) {
    if (type !== 'literal') p[type] = Number(value);
  }
  const ms = ((utcMs % 1000) + 1000) % 1000;
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, ms);
  return {
    year: p.year, month: p.month, day: p.day,
    hour: p.hour, minute: p.minute, second: p.second,
    hourFloat: p.hour + p.minute / 60 + (p.second + ms / 1000) / 3600,
    offsetMinutes: Math.round((asUtc - utcMs) / 60000),
    timeZone,
  };
}

/**
 * Converte data/hora civil do fuso indicado no instante UTC correspondente.
 * Resolve o desvio através das regras IANA (iteração em dois passos, robusta a DST).
 */
export function zonedToUtc({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone = WORLD_TIME_ZONE) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = guess - localParts(guess, timeZone).offsetMinutes * 60000;
  utc = guess - localParts(utc, timeZone).offsetMinutes * 60000;
  return utc;
}

export function formatClock(utcMs, timeZone = WORLD_TIME_ZONE, withSeconds = false) {
  const t = localParts(utcMs, timeZone);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(t.hour)}:${pad(t.minute)}${withSeconds ? ':' + pad(t.second) : ''}`;
}

// ---------------------------------------------------------------------------
// Posição solar — algoritmo NOAA (Meeus simplificado). Precisão ~1 min para
// nascer/pôr do Sol em latitudes tropicais, suficiente para iluminação de jogo.
// ---------------------------------------------------------------------------

function julianCentury(utcMs) {
  const jd = utcMs / 86400000 + 2440587.5;
  return (jd - 2451545.0) / 36525.0;
}

function solarTerms(T) {
  const L0 = ((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360 + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(M * DEG) * (1.914602 - T * (0.004817 + 0.000014 * T))
    + Math.sin(2 * M * DEG) * (0.019993 - 0.000101 * T)
    + Math.sin(3 * M * DEG) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * DEG);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * DEG);
  const decl = Math.asin(Math.sin(eps * DEG) * Math.sin(lambda * DEG)) * RAD;
  const y = Math.tan((eps / 2) * DEG) ** 2;
  const eqTime = 4 * RAD * (
    y * Math.sin(2 * L0 * DEG)
    - 2 * e * Math.sin(M * DEG)
    + 4 * e * y * Math.sin(M * DEG) * Math.cos(2 * L0 * DEG)
    - 0.5 * y * y * Math.sin(4 * L0 * DEG)
    - 1.25 * e * e * Math.sin(2 * M * DEG)
  );
  return { decl, eqTime };
}

/**
 * Posição do Sol para um instante UTC e uma localização.
 * @returns {{elevation:number, azimuth:number, declination:number, equationOfTime:number}}
 *   elevation em graus acima do horizonte (com refracção atmosférica aproximada),
 *   azimuth em graus a partir do Norte, sentido horário (Este = 90).
 */
export function sunPosition(utcMs, lat = REFERENCE_LOCATION.latitude, lon = REFERENCE_LOCATION.longitude) {
  const { decl, eqTime } = solarTerms(julianCentury(utcMs));
  const d = new Date(utcMs);
  const utcMinutes = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60 + d.getUTCMilliseconds() / 60000;
  let tst = (utcMinutes + eqTime + 4 * lon) % 1440;
  if (tst < 0) tst += 1440;
  let ha = tst / 4 - 180;
  if (ha < -180) ha += 360;

  const cosZen = Math.sin(lat * DEG) * Math.sin(decl * DEG) + Math.cos(lat * DEG) * Math.cos(decl * DEG) * Math.cos(ha * DEG);
  const zenith = Math.acos(Math.min(1, Math.max(-1, cosZen))) * RAD;
  let elevation = 90 - zenith;

  // Refracção atmosférica (NOAA)
  let refraction = 0;
  if (elevation <= 85) {
    const te = Math.tan(elevation * DEG);
    if (elevation > 5) refraction = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
    else if (elevation > -0.575) refraction = 1735 + elevation * (-518.2 + elevation * (103.4 + elevation * (-12.79 + elevation * 0.711)));
    else refraction = -20.772 / te;
    refraction /= 3600;
  }
  elevation += refraction;

  const sinZen = Math.sin(zenith * DEG);
  let azimuth;
  if (Math.abs(sinZen) < 1e-9) {
    azimuth = lat > decl ? 180 : 0;
  } else {
    const cosAz = ((Math.sin(lat * DEG) * Math.cos(zenith * DEG)) - Math.sin(decl * DEG)) / (Math.cos(lat * DEG) * sinZen);
    const a = Math.acos(Math.min(1, Math.max(-1, cosAz))) * RAD;
    azimuth = ha > 0 ? (a + 180) % 360 : (540 - a) % 360;
  }
  return { elevation, azimuth, declination: decl, equationOfTime: eqTime };
}

/**
 * Nascer, meio-dia solar e pôr do Sol (instantes UTC) para o dia civil local
 * que contém utcMs no fuso indicado.
 */
export function sunTimes(utcMs, lat = REFERENCE_LOCATION.latitude, lon = REFERENCE_LOCATION.longitude, timeZone = WORLD_TIME_ZONE) {
  const lp = localParts(utcMs, timeZone);
  const dayStartUtc = Date.UTC(lp.year, lp.month - 1, lp.day); // 00:00 UTC do mesmo dia civil
  const event = (sign) => {
    // duas iterações: recalcular termos solares perto do evento
    let minutes = 720;
    for (let i = 0; i < 3; i++) {
      const { decl, eqTime } = solarTerms(julianCentury(dayStartUtc + minutes * 60000));
      if (sign === 0) { minutes = 720 - 4 * lon - eqTime; continue; }
      const cosH = Math.cos(90.833 * DEG) / (Math.cos(lat * DEG) * Math.cos(decl * DEG)) - Math.tan(lat * DEG) * Math.tan(decl * DEG);
      if (cosH > 1 || cosH < -1) return null; // noite/dia polar
      const H = Math.acos(cosH) * RAD;
      minutes = 720 - 4 * (lon + sign * H) - eqTime;
    }
    return dayStartUtc + minutes * 60000;
  };
  return { sunrise: event(+1), solarNoon: event(0), sunset: event(-1) };
}

// ---------------------------------------------------------------------------
// Relógio do mundo: real (sincronizado com Luanda), acelerado ou fixo (diagnóstico)
// ---------------------------------------------------------------------------

export const CLOCK_MODES = Object.freeze(['realtime', 'accelerated', 'fixed']);

/**
 * Estado do relógio: virtual(t_real) = anchorVirtualMs + (t_real - anchorRealMs) * rate
 *   realtime    → rate = 1 e anchorVirtual = anchorReal (hora real de Luanda)
 *   accelerated → rate = 1440 / dayLengthMinutes
 *   fixed       → rate = 0 (só permitido em modo diagnóstico)
 */
export function makeClockState({ mode = 'realtime', dayLengthMinutes = 1440, anchorRealMs, anchorVirtualMs } = {}, nowMs = Date.now()) {
  if (!CLOCK_MODES.includes(mode)) throw new Error(`modo de relógio inválido: ${mode}`);
  const rate = mode === 'realtime' ? 1 : mode === 'fixed' ? 0 : 1440 / Math.max(1, dayLengthMinutes);
  const aReal = anchorRealMs ?? nowMs;
  const aVirt = mode === 'realtime' ? aReal : (anchorVirtualMs ?? nowMs);
  return { mode, dayLengthMinutes: mode === 'accelerated' ? dayLengthMinutes : 1440, rate, anchorRealMs: aReal, anchorVirtualMs: aVirt };
}

export function virtualNow(clock, realNowMs) {
  return clock.anchorVirtualMs + (realNowMs - clock.anchorRealMs) * clock.rate;
}

/** Re-ancorar mantendo a continuidade do tempo virtual (evita saltos de iluminação). */
export function rebaseClock(clock, changes, realNowMs) {
  const current = virtualNow(clock, realNowMs);
  return makeClockState({ ...clock, ...changes, anchorRealMs: realNowMs, anchorVirtualMs: changes.anchorVirtualMs ?? current }, realNowMs);
}

/** Factores de iluminação contínuos derivados da elevação solar (sem estados bruscos). */
export function daylightFactors(elevation) {
  const smooth = (e0, e1, x) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const day = smooth(-6, 10, elevation);            // 0 noite → 1 dia pleno
  const golden = smooth(-4, 2, elevation) * (1 - smooth(4, 16, elevation)); // pico perto do horizonte
  const night = 1 - smooth(-10, -2, elevation);     // crepúsculo náutico → noite
  const streetLights = 1 - smooth(-2, 4, elevation);  // acendem um pouco antes do pôr do Sol
  return { day, golden, night, streetLights };
}

/** Período do dia legível (só para UI/rotinas; a iluminação usa daylightFactors). */
export function dayPeriod(hourFloat) {
  if (hourFloat >= 5 && hourFloat < 7) return 'amanhecer';
  if (hourFloat >= 7 && hourFloat < 12) return 'manha';
  if (hourFloat >= 12 && hourFloat < 17) return 'tarde';
  if (hourFloat >= 17 && hourFloat < 19) return 'por_do_sol';
  return 'noite';
}
