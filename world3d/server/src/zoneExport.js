/**
 * Exportação do layout da zona em JSON (para o importador do Unreal Engine 5 e
 * ferramentas externas). O UE5 usa estes dados para colocar blocos/actores de
 * referência (blockout) e POIs; a arte final é feita no editor.
 */
import { ZONE_ID, ZONE_BOUNDS, ROADS, BUILDINGS, POIS, PROPS, BENCHES, INTERSECTIONS, TRAFFIC_LIGHTS, TRAFFIC_LOOPS, PARKED_VEHICLES, RACE_TRACK, PATROL_ROUTES, PLAYER_SPAWNS, DISTRICTS, sidewalkRects } from '../../shared/zone.js';
import { REFERENCE_LOCATION, WORLD_TIME_ZONE } from '../../shared/time.js';

export function exportZone() {
  return {
    format: 'ngolabiz-world3d-zone',
    version: 1,
    units: 'metros; +X=Este, +Z=Sul, +Y=cima (UE5: X=Norte? ver docs/UNREAL.md para a conversão)',
    zoneId: ZONE_ID,
    timeZone: WORLD_TIME_ZONE,
    solarReference: REFERENCE_LOCATION,
    bounds: ZONE_BOUNDS,
    districts: DISTRICTS,
    roads: ROADS,
    sidewalks: sidewalkRects(),
    intersections: INTERSECTIONS,
    trafficLights: TRAFFIC_LIGHTS,
    trafficLoops: TRAFFIC_LOOPS,
    buildings: BUILDINGS,
    pois: POIS,
    props: PROPS,
    benches: BENCHES,
    parkedVehicles: PARKED_VEHICLES,
    raceTrack: RACE_TRACK,
    patrolRoutes: PATROL_ROUTES,
    playerSpawns: PLAYER_SPAWNS,
  };
}
