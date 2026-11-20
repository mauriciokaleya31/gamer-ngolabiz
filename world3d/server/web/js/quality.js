/**
 * Perfis de qualidade gráfica (configuráveis). A predefinição é "média" e, em
 * telemóveis, "baixa" — nunca tudo no máximo por omissão.
 */
export const QUALITY_PROFILES = {
  baixa: { name: 'baixa', pixelRatio: 0.8, antialias: false, shadows: false, shadowMap: 1024, lampLights: 2, rainDrops: 1200, npcDetailDistance: 16, npcVisibleDistance: 90, envReflections: false, far: 900 },
  media: { name: 'media', pixelRatio: 1.25, antialias: true, shadows: true, shadowMap: 2048, lampLights: 6, rainDrops: 3000, npcDetailDistance: 30, npcVisibleDistance: 140, envReflections: true, far: 1600 },
  alta: { name: 'alta', pixelRatio: 2, antialias: true, shadows: true, shadowMap: 4096, lampLights: 10, rainDrops: 6000, npcDetailDistance: 48, npcVisibleDistance: 200, envReflections: true, far: 2600 },
};

export function pickQuality() {
  const q = new URLSearchParams(location.search).get('q');
  let stored = null;
  try { stored = localStorage.getItem('w3d_quality'); } catch { /* armazenamento indisponível */ }
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const name = q ?? stored ?? (mobile ? 'baixa' : 'media');
  return QUALITY_PROFILES[name] ?? QUALITY_PROFILES.media;
}
