const EARTH_RADIUS_METERS = 6_371_000;

export function distanceMeters(a: [number, number], b: [number, number]): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(b[1] - a[1]);
  const longitudeDelta = radians(b[0] - a[0]);
  const latitudeA = radians(a[1]);
  const latitudeB = radians(b[1]);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}

export function nearestRoutePoint(position: [number, number], route: [number, number][]) {
  let nearest = { index: -1, distanceMeters: Number.POSITIVE_INFINITY };
  route.forEach((point, index) => {
    const distance = distanceMeters(position, point);
    if (distance < nearest.distanceMeters) nearest = { index, distanceMeters: distance };
  });
  return nearest;
}
