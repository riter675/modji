-- Add indexed PostGIS locations to the application's saved places, journeys and reports.
-- Coordinates remain the source of truth; generated columns stay in sync automatically.
ALTER TABLE modji_saved_places
  ADD COLUMN IF NOT EXISTS location geography(Point, 4326)
    GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography) STORED,
  ADD COLUMN IF NOT EXISTS location_geom geometry(Point, 4326)
    GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED;
CREATE INDEX IF NOT EXISTS modji_saved_places_location_gix
  ON modji_saved_places USING gist (location_geom);

ALTER TABLE modji_journeys
  ADD COLUMN IF NOT EXISTS origin_location geography(Point, 4326)
    GENERATED ALWAYS AS (CASE WHEN origin_latitude IS NULL OR origin_longitude IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(origin_longitude, origin_latitude), 4326)::geography END) STORED,
  ADD COLUMN IF NOT EXISTS destination_location geography(Point, 4326)
    GENERATED ALWAYS AS (CASE WHEN destination_latitude IS NULL OR destination_longitude IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(destination_longitude, destination_latitude), 4326)::geography END) STORED,
  ADD COLUMN IF NOT EXISTS origin_geom geometry(Point, 4326)
    GENERATED ALWAYS AS (CASE WHEN origin_latitude IS NULL OR origin_longitude IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(origin_longitude, origin_latitude), 4326) END) STORED,
  ADD COLUMN IF NOT EXISTS destination_geom geometry(Point, 4326)
    GENERATED ALWAYS AS (CASE WHEN destination_latitude IS NULL OR destination_longitude IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint(destination_longitude, destination_latitude), 4326) END) STORED;
CREATE INDEX IF NOT EXISTS modji_journeys_origin_gix ON modji_journeys USING gist (origin_geom);
CREATE INDEX IF NOT EXISTS modji_journeys_destination_gix ON modji_journeys USING gist (destination_geom);

ALTER TABLE modji_community_reports
  ADD COLUMN IF NOT EXISTS location geography(Point, 4326)
    GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography) STORED,
  ADD COLUMN IF NOT EXISTS location_geom geometry(Point, 4326)
    GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED;
CREATE INDEX IF NOT EXISTS modji_reports_location_gix
  ON modji_community_reports USING gist (location_geom);
