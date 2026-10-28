/**
 * Ambiente visual coordenado pelo relógio do servidor (Africa/Luanda):
 * céu físico (Preetham), luz solar direccional com sombras que seguem o azimute e a
 * elevação calculados, luz hemisférica, exposição, nevoeiro, estrelas, lua,
 * camada de nuvens, chuva, superfícies molhadas, candeeiros com pool de luzes reais
 * e janelas iluminadas. Todas as transições são contínuas (sem estados bruscos).
 */
import * as THREE from 'three';
import { Sky } from '../vendor/three/Sky.js';
import { sunPosition, daylightFactors, localParts } from '../../shared/time.js';
import { WINDOW_UNIFORMS } from './city.js';
import { cloudTexture } from './textures.js';

const tmpColor = new THREE.Color();

export function sunDirection(elevationDeg, azimuthDeg, target = new THREE.Vector3()) {
  const el = THREE.MathUtils.degToRad(elevationDeg);
  const az = THREE.MathUtils.degToRad(azimuthDeg);
  // azimute a partir do Norte (−Z) no sentido horário (Este = +X)
  return target.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

/** Fracção de janelas acesas ao longo do dia (hábitos domésticos/escritório). */
export function windowLitFraction(hour) {
  const pts = [[0, 0.22], [1, 0.14], [4, 0.06], [5.5, 0.18], [6.5, 0.25], [8, 0.08], [17, 0.12], [18.5, 0.55], [20, 0.75], [22, 0.6], [23.5, 0.32], [24, 0.22]];
  for (let i = 1; i < pts.length; i++) {
    if (hour <= pts[i][0]) {
      const [h0, v0] = pts[i - 1];
      const [h1, v1] = pts[i];
      return v0 + (v1 - v0) * ((hour - h0) / (h1 - h0));
    }
  }
  return 0.2;
}

export class Environment {
  constructor(scene, renderer, camera, { quality }) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
    this.quality = quality;

    this.sky = new Sky();
    this.sky.scale.setScalar(4500);
    scene.add(this.sky);
    this.skyU = this.sky.material.uniforms;

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = quality.shadows;
    this.sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);

    this.moon = new THREE.DirectionalLight(0x9db4ff, 0);
    scene.add(this.moon, this.moon.target);
    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x5a4a3a, 0.6);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(0xbfd1e5, 0.0022);

    // estrelas
    const n = 1800;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random();
      const v = Math.random() * 0.9 + 0.1;
      const th = u * Math.PI * 2;
      const ph = Math.acos(1 - v);
      pos.set([Math.cos(th) * Math.sin(ph) * 2000, Math.cos(ph) * 2000, Math.sin(th) * Math.sin(ph) * 2000], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    scene.add(this.stars);

    // lua (disco simples oposto ao Sol)
    this.moonMesh = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshBasicMaterial({ color: 0xf2f4ff, fog: false, transparent: true, opacity: 0 }));
    scene.add(this.moonMesh);

    // nuvens
    const ct = cloudTexture();
    ct.repeat.set(3, 3);
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshBasicMaterial({ map: ct, transparent: true, opacity: 0.2, depthWrite: false, fog: false, color: 0xffffff }));
    this.clouds.rotation.x = Math.PI / 2;
    this.clouds.position.y = 420;
    scene.add(this.clouds);

    // chuva (riscos à volta da câmara)
    const rc = quality.rainDrops;
    const rpos = new Float32Array(rc * 6);
    for (let i = 0; i < rc; i++) {
      const x = (Math.random() - 0.5) * 60;
      const y = Math.random() * 30;
      const z = (Math.random() - 0.5) * 60;
      rpos.set([x, y, z, x, y - 0.6, z], i * 6);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rpos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xaec4d8, transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false;
    scene.add(this.rain);

    // pool de luzes pontuais reais para os candeeiros mais próximos
    this.lampLights = [];
    for (let i = 0; i < quality.lampLights; i++) {
      const l = new THREE.PointLight(0xffd9a0, 0, 34, 2);
      scene.add(l);
      this.lampLights.push(l);
    }
    this.interiorLight = new THREE.PointLight(0xfff3dc, 0, 16, 1.5);
    this.stationLight = new THREE.PointLight(0xf4fbff, 0, 26, 1.4);
    scene.add(this.interiorLight, this.stationLight);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    const domeGeo = new THREE.SphereGeometry(100, 24, 16);
    domeGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(domeGeo.attributes.position.count * 3), 3));
    this.envDome = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
    this.envScene.add(this.envDome);
    this.lastEnvSun = null;
    this.state = { light: { day: 1, night: 0, streetLights: 0, golden: 0 }, hour: 12, weather: { cloud: 0.1, fog: 0, rain: 0, wind: 0.2, wetness: 0 } };
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.lampTimer = 0;
  }

  /**
   * @param {number} virtualMs instante virtual (do servidor) — mesma fonte do relógio do HUD
   */
  update(dt, virtualMs, weather, city, focus) {
    const sun = sunPosition(virtualMs);
    const f = daylightFactors(sun.elevation);
    const hour = localParts(virtualMs).hourFloat;
    const w = weather ?? this.state.weather;
    this.state = { light: f, hour, weather: w, sun };
    sunDirection(sun.elevation, sun.azimuth, this.sunDir);

    // céu físico: turbidez e dispersão variam com nuvens/neblina
    this.skyU.sunPosition.value.copy(this.sunDir);
    this.skyU.turbidity.value = 3 + w.cloud * 9 + w.fog * 6;
    this.skyU.rayleigh.value = 1.2 + f.golden * 1.4 - w.cloud * 0.6;
    this.skyU.mieCoefficient.value = 0.004 + w.fog * 0.02;
    this.skyU.mieDirectionalG.value = 0.82;

    // Sol: cor quente perto do horizonte, intensidade reduzida por nuvens
    const overcast = 1 - w.cloud * 0.65 - w.rain * 0.2;
    const elevFactor = THREE.MathUtils.smoothstep(sun.elevation, -2, 12);
    this.sun.intensity = 3.2 * elevFactor * overcast;
    tmpColor.setHSL(0.08 + 0.05 * THREE.MathUtils.smoothstep(sun.elevation, 0, 30), 0.9 - 0.6 * THREE.MathUtils.smoothstep(sun.elevation, 0, 35), 0.62 + 0.3 * THREE.MathUtils.smoothstep(sun.elevation, 0, 40));
    this.sun.color.copy(tmpColor);
    this.sun.visible = sun.elevation > -3;
    this.sun.castShadow = this.quality.shadows && sun.elevation > 1;

    // sombras seguem a câmara (cascata única centrada no jogador)
    const target = focus ?? new THREE.Vector3();
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(this.sunDir, 180);
    // estabilizar a sombra (encaixe em texels) para evitar tremeluzir
    const texel = 140 / this.quality.shadowMap;
    this.sun.position.x = Math.round(this.sun.position.x / texel) * texel;
    this.sun.position.z = Math.round(this.sun.position.z / texel) * texel;

    // Lua: luz azulada fraca à noite, do lado oposto ao Sol
    const moonDir = this.sunDir.clone().multiplyScalar(-1);
    moonDir.y = Math.max(0.35, moonDir.y);
    moonDir.normalize();
    this.moon.intensity = 0.28 * f.night * (1 - w.cloud * 0.7);
    this.moon.position.copy(target).addScaledVector(moonDir, 150);
    this.moon.target.position.copy(target);
    this.moonMesh.position.copy(this.camera.position).addScaledVector(moonDir, 1800);
    this.moonMesh.lookAt(this.camera.position);
    this.moonMesh.material.opacity = f.night * (1 - w.cloud * 0.8);

    // luz ambiente hemisférica
    this.hemi.intensity = 0.12 + 0.75 * f.day * (0.75 + 0.25 * overcast);
    this.hemi.color.setHSL(0.58, 0.35 + 0.2 * f.day, 0.25 + 0.5 * f.day);
    this.hemi.groundColor.setHSL(0.08, 0.3, 0.12 + 0.2 * f.day);

    // exposição: adaptação suave entre dia e noite
    const targetExposure = THREE.MathUtils.lerp(1.25, 0.62, f.day) * (1 + w.cloud * 0.15);
    this.renderer.toneMappingExposure += (targetExposure - this.renderer.toneMappingExposure) * Math.min(1, dt * 1.5);

    // nevoeiro: cor do horizonte e densidade por clima
    const fogDay = new THREE.Color().setHSL(0.58, 0.3, 0.72 - w.cloud * 0.15);
    const fogSunset = new THREE.Color(0xd9925f);
    const fogNight = new THREE.Color(0x0d1420);
    const fogCol = fogNight.clone().lerp(fogDay, f.day).lerp(fogSunset, f.golden * 0.45);
    this.scene.fog.color.copy(fogCol);
    this.scene.fog.density = 0.0016 + w.fog * 0.016 + w.rain * 0.004 + f.night * 0.0012;

    // estrelas e nuvens
    this.stars.material.opacity = f.night * (1 - w.cloud) * 0.95;
    this.stars.position.copy(this.camera.position);
    this.clouds.material.opacity = 0.08 + w.cloud * 0.55;
    this.clouds.material.color.setScalar(0.25 + 0.75 * f.day);
    this.clouds.material.map.offset.x += dt * 0.002 * (0.3 + w.wind);
    this.clouds.position.x = this.camera.position.x;
    this.clouds.position.z = this.camera.position.z;

    // chuva
    this.rain.material.opacity = Math.min(0.55, w.rain * 0.7);
    this.rain.visible = w.rain > 0.02;
    if (this.rain.visible) {
      const p = this.rain.geometry.attributes.position;
      const fall = (14 + w.rain * 8) * dt;
      const slant = w.wind * 0.35;
      const active = Math.floor((p.count / 2) * Math.min(1, w.rain * 1.3));
      for (let i = 0; i < p.count / 2; i++) {
        let y = p.getY(i * 2) - fall;
        let x = p.getX(i * 2) + slant * fall * 0.3;
        let z = p.getZ(i * 2);
        if (y < 0 || i >= active) { y = i >= active ? -50 : 25 + Math.random() * 5; x = (Math.random() - 0.5) * 60; z = (Math.random() - 0.5) * 60; }
        p.setXYZ(i * 2, x, y, z);
        p.setXYZ(i * 2 + 1, x - slant * 0.3, y - 0.7, z);
      }
      p.needsUpdate = true;
      this.rain.position.set(this.camera.position.x, 0, this.camera.position.z);
    }

    // janelas e luzes urbanas
    WINDOW_UNIFORMS.uNight.value = Math.max(f.streetLights, w.cloud * w.rain * 0.4);
    WINDOW_UNIFORMS.uLitFraction.value = windowLitFraction(hour);

    this.lampTimer -= dt;
    if (city && this.lampTimer <= 0) {
      this.lampTimer = 0.4;
      const cam = this.camera.position;
      const sorted = city.lampPositions.map((p) => [p, p.distanceToSquared(cam)]).sort((a, b) => a[1] - b[1]);
      this.lampLights.forEach((l, i) => { if (sorted[i]) l.position.copy(sorted[i][0]); });
    }
    const lampI = f.streetLights * 120;
    for (const l of this.lampLights) l.intensity = lampI;
    if (city?.interiorLightPos) {
      this.interiorLight.position.copy(city.interiorLightPos);
      const open = hour >= 7 && hour < 21;
      this.interiorLight.intensity = open ? 25 + f.streetLights * 40 : 0;
    }
    if (city?.stationLightPos) {
      this.stationLight.position.copy(city.stationLightPos);
      this.stationLight.intensity = f.streetLights * 160;
    }

    // reflexos do ambiente: cúpula de gradiente (céu → horizonte → chão) convertida em PMREM.
    // Evita os valores HDR extremos do disco solar do shader do céu (instáveis em alguns GPUs).
    if (this.quality.envReflections) {
      const key = `${Math.round(f.day * 20)}:${Math.round(f.golden * 10)}:${Math.round(w.cloud * 5)}`;
      if (key !== this.lastEnvSun) {
        this.lastEnvSun = key;
        const top = new THREE.Color().setHSL(0.6, 0.55 - w.cloud * 0.4, 0.06 + 0.5 * f.day);
        const horizon = fogCol.clone();
        const ground = new THREE.Color().setHSL(0.08, 0.25, 0.04 + 0.22 * f.day);
        const geo = this.envDome.geometry;
        const pos = geo.attributes.position;
        const col = geo.attributes.color;
        for (let i = 0; i < pos.count; i++) {
          const y = pos.getY(i) / 100;
          const c = y >= 0 ? horizon.clone().lerp(top, Math.pow(y, 0.6)) : horizon.clone().lerp(ground, Math.min(1, -y * 4));
          col.setXYZ(i, c.r, c.g, c.b);
        }
        col.needsUpdate = true;
        const old = this.envRT;
        this.envRT = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 1000);
        this.scene.environment = this.envRT.texture;
        this.scene.environmentIntensity = 0.6;
        old?.dispose();
      }
    }
  }
}
