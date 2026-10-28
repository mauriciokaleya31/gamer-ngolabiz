/**
 * Relógio autoritativo do mundo. A fonte temporal é o relógio do servidor (que deve
 * estar sincronizado por NTP/chrony no anfitrião). O cliente nunca define a hora:
 * recebe o estado do relógio e estima o desvio (offset) com base no RTT.
 */
import { makeClockState, rebaseClock, virtualNow, localParts, sunPosition, sunTimes, daylightFactors, dayPeriod, WORLD_TIME_ZONE, REFERENCE_LOCATION } from '../../shared/time.js';

export class WorldClock {
  /**
   * @param {{mode?:string, dayLengthMinutes?:number, allowDiagnostics?:boolean, now?:()=>number}} opts
   */
  constructor({ mode = 'realtime', dayLengthMinutes = 1440, allowDiagnostics = false, now = () => Date.now(), location = REFERENCE_LOCATION } = {}) {
    this.now = now;
    this.allowDiagnostics = allowDiagnostics;
    this.location = location;
    this.state = makeClockState({ mode: mode === 'fixed' && !allowDiagnostics ? 'realtime' : mode, dayLengthMinutes }, this.now());
  }

  get rate() { return this.state.rate; }

  virtualNow(realMs = this.now()) { return virtualNow(this.state, realMs); }

  /** Configuração administrativa (persistente): tempo real de Luanda ou dia acelerado. */
  configure({ mode, dayLengthMinutes }) {
    if (mode === 'fixed') throw new Error('O modo fixo só está disponível no diagnóstico de desenvolvimento.');
    if (mode === 'realtime') {
      this.state = makeClockState({ mode: 'realtime' }, this.now());
    } else {
      this.state = rebaseClock(this.state, { mode: 'accelerated', dayLengthMinutes: Math.max(2, Number(dayLengthMinutes) || 48) }, this.now());
    }
    this.diagnostic = null;
    return this.publicState();
  }

  /**
   * Diagnóstico (desenvolvimento): fixar uma hora local de Luanda ou acelerar.
   * Recusado quando allowDiagnostics = false (produção).
   */
  diagnose({ hour, speed, reset } = {}) {
    if (!this.allowDiagnostics) throw new Error('Diagnóstico de tempo desactivado neste servidor.');
    const realNow = this.now();
    if (reset) {
      this.state = makeClockState({ mode: 'realtime' }, realNow);
      this.diagnostic = null;
      return this.publicState();
    }
    let anchorVirtualMs = this.virtualNow(realNow);
    if (hour !== undefined && hour !== null) {
      const lp = localParts(anchorVirtualMs);
      const h = ((Number(hour) % 24) + 24) % 24;
      const delta = (h - lp.hourFloat) * 3600000;
      anchorVirtualMs += delta;
    }
    const s = Number(speed ?? (this.state.mode === 'fixed' ? 0 : this.state.rate));
    if (s === 0) {
      this.state = { mode: 'fixed', dayLengthMinutes: 1440, rate: 0, anchorRealMs: realNow, anchorVirtualMs };
    } else {
      this.state = { mode: 'accelerated', dayLengthMinutes: 1440 / s, rate: s, anchorRealMs: realNow, anchorVirtualMs };
    }
    this.diagnostic = { hour, speed: s, at: realNow };
    return this.publicState();
  }

  /** Estado completo enviado aos clientes (mesma fonte para relógio, Sol e rotinas). */
  publicState(realMs = this.now()) {
    const v = this.virtualNow(realMs);
    const lp = localParts(v, WORLD_TIME_ZONE);
    const sun = sunPosition(v, this.location.latitude, this.location.longitude);
    const times = sunTimes(v, this.location.latitude, this.location.longitude);
    return {
      serverNowMs: realMs,
      clock: { ...this.state },
      timeZone: WORLD_TIME_ZONE,
      location: this.location,
      virtualMs: v,
      local: { hour: lp.hour, minute: lp.minute, second: lp.second, hourFloat: lp.hourFloat, date: `${lp.year}-${String(lp.month).padStart(2, '0')}-${String(lp.day).padStart(2, '0')}`, offsetMinutes: lp.offsetMinutes },
      period: dayPeriod(lp.hourFloat),
      sun: { elevation: sun.elevation, azimuth: sun.azimuth, sunrise: times.sunrise, sunset: times.sunset, solarNoon: times.solarNoon },
      light: daylightFactors(sun.elevation),
      diagnostic: this.diagnostic ?? null,
      diagnosticsAllowed: this.allowDiagnostics,
    };
  }
}
