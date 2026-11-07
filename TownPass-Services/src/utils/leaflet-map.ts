import L from 'leaflet';
import markerIconUrl from 'leaflet/dist/images/marker-icon.png';
import markerIconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png';

/**
 * Leaflet + Vite 無法自動找到預設 marker 圖片，需手動指定
 */
L.Icon.Default.mergeOptions({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIconRetinaUrl,
  shadowUrl: markerShadowUrl
});

export interface LatLng {
  lat: number;
  lng: number;
}

/** 預設中心點（台北市） */
export const DEFAULT_CENTER: LatLng = { lat: 25.033, lng: 121.5654 };

export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

/**
 * 建立使用 OpenStreetMap 圖資的 Leaflet 地圖
 */
export const createOsmMap = (
  element: HTMLElement,
  center: LatLng = DEFAULT_CENTER,
  zoom = 13,
  options: L.MapOptions = {}
): L.Map => {
  const map = L.map(element, {
    center: [center.lat, center.lng],
    zoom,
    minZoom: 3,
    maxZoom: 19,
    zoomControl: false,
    attributionControl: true,
    ...options
  });

  L.tileLayer(OSM_TILE_URL, {
    maxZoom: 19,
    attribution: OSM_ATTRIBUTION
  }).addTo(map);

  return map;
};

/**
 * 使用者目前位置的藍色圓點
 */
export const createUserLocationMarker = (map: L.Map, position: LatLng): L.CircleMarker => {
  return L.circleMarker([position.lat, position.lng], {
    radius: 8,
    color: '#ffffff',
    weight: 2,
    fillColor: '#4285F4',
    fillOpacity: 1,
    interactive: false
  }).addTo(map);
};

/**
 * 兩點之間的距離（公里，小數一位）
 */
export const distanceInKm = (from: LatLng, to: LatLng): number => {
  const meters = L.latLng(from.lat, from.lng).distanceTo(L.latLng(Number(to.lat), Number(to.lng)));
  return parseFloat((meters / 1000).toFixed(1));
};

/**
 * 獲取目前位置
 */
export const getCurrentPosition = (): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: 0,
      timeout: 10000
    });
  });
};

/**
 * 以圖片建立地圖標記 icon
 */
export const createImageIcon = (
  url: string,
  size: [number, number],
  anchor: [number, number]
): L.Icon => {
  return L.icon({
    iconUrl: url,
    iconSize: size,
    iconAnchor: anchor
  });
};
