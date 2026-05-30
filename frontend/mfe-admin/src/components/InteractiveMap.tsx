import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L, { LatLng } from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ── Fix Leaflet's broken default marker icons in Vite ─────────────────────────
// Vite hashes asset file names which breaks Leaflet's built-in icon URL logic.
// Point to the CDN copies instead.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom red pin so the venue marker stands out
const RED_ICON = new L.Icon({
  iconUrl:       'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize:      [25, 41],
  iconAnchor:    [12, 41],
  popupAnchor:   [1, -34],
  shadowSize:    [41, 41],
});

// ── Helper: re-centre map when props change ───────────────────────────────────

function MapRecentre({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const prev = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (
      prev.current === null ||
      Math.abs(prev.current.lat - lat) > 0.0001 ||
      Math.abs(prev.current.lng - lng) > 0.0001
    ) {
      map.setView([lat, lng], map.getZoom());
      prev.current = { lat, lng };
    }
  }, [lat, lng, map]);
  return null;
}

// ── Helper: click anywhere on map → move marker ───────────────────────────────

function ClickHandler({ onPositionChange }: { onPositionChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPositionChange(
        parseFloat(e.latlng.lat.toFixed(6)),
        parseFloat(e.latlng.lng.toFixed(6)),
      );
    },
  });
  return null;
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  lat: number;
  lng: number;
  onPositionChange: (lat: number, lng: number) => void;
  height?: number;
}

export function InteractiveMap({ lat, lng, onPositionChange, height = 320 }: Props) {
  const handleDragEnd = (e: L.DragEndEvent) => {
    const pos: LatLng = (e.target as L.Marker).getLatLng();
    onPositionChange(
      parseFloat(pos.lat.toFixed(6)),
      parseFloat(pos.lng.toFixed(6)),
    );
  };

  return (
    <MapContainer
      center={[lat, lng]}
      zoom={16}
      style={{ height, width: '100%', borderRadius: 8 }}
      scrollWheelZoom
    >
      {/* OpenStreetMap tiles — free, no API key */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Re-centre when coordinates change from outside */}
      <MapRecentre lat={lat} lng={lng} />

      {/* Click anywhere to relocate the marker */}
      <ClickHandler onPositionChange={onPositionChange} />

      {/* Draggable venue marker */}
      <Marker
        position={[lat, lng]}
        icon={RED_ICON}
        draggable
        eventHandlers={{ dragend: handleDragEnd }}
      />
    </MapContainer>
  );
}
