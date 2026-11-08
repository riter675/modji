export function decodeShape(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) throw new Error("Invalid route geometry.");
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    latitude += next();
    longitude += next();
    points.push([longitude / 1_000_000, latitude / 1_000_000]);
  }
  return points;
}
