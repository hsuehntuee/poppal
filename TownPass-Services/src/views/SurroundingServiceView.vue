<script setup lang="ts">
import FindPlace, { type Place } from '@/components/molecules/FindPlace.vue';
import SpotList from '@/components/organisms/SpotListView.vue';
import SpotDetail from '@/components/organisms/SpotDetailView.vue';
import MessageModal from '@/components/molecules/MessageModal.vue';
import axios from 'axios';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import L from 'leaflet';
import greenDotIconUrl from '/public/images/map/youbike/mappin-green.svg';
import defaultFocusIconUrl from '/public/images/map/icon_mappin-garbagetruck-green-pressed.svg';
import { mappingFormatter, getNestedValue } from '@/utils/spot-formatter';
import {
  DEFAULT_CENTER,
  createImageIcon,
  createOsmMap,
  createUserLocationMarker,
  distanceInKm,
  getCurrentPosition
} from '@/utils/leaflet-map';

export interface Spot {
  id: string;
  /** 站點名稱 */
  name: string;
  /** 行政區 */
  area: string;
  /** 地址 */
  address: string;
  /** 經度 */
  lat: number;
  /** 緯度 */
  lng: number;
  /** 距離 */
  distance?: number;
  /** 詳細資訊 */
  service_infos?: {
    title: string;
    value: { title: string; value: string }[] | string;
  }[];

  /** 其餘詳細資訊 */
  [key: string]: any;
}

const selectedSearchData = ref<Place>({
  id: '',
  name: '',
  icon: '',
  agency: '',
  type: '',
  request_url: '',
  data_path: ''
});

/** 搜尋結果 */
const searchSpotList = ref<Spot[]>([]);
/** 視窗下搜尋結果 */
const filteredSpotList = ref<Spot[]>([]);
const selectedSpot = ref<Spot | null>(null);

/** 是否展開找地點面板 */
const isExpand = ref(false);
/** 是否點選展開列表 */
const isExpandList = ref(false);
/** 是否點選展開明細 */
const isExpandDetail = ref(false);
const isFrom = ref<'spot' | 'list' | ''>('');

let isMapReady = ref(false);

let map: L.Map | null = null;
/** 使用者定位 */
let marker: L.CircleMarker | null = null;
/** 地點標記 */
let markers: L.Marker[] = [];
/** 目前聚焦的標記 */
let currentFocusedMarker: L.Marker | null = null;

/** 預設綠色小圓點圖標 */
const greenDotIcon = createImageIcon(greenDotIconUrl, [20, 20], [10, 20]);
/** 點擊後聚焦圖標 */
const focusedIcon = createImageIcon(defaultFocusIconUrl, [48, 69], [24, 69]);

/**
 * 目前位置
 */
const currentLocation = ref<{ lat: number; lng: number; results: any[] }>({
  // 預設經緯度在台北市
  lat: DEFAULT_CENTER.lat,
  lng: DEFAULT_CENTER.lng,
  results: []
});

/**
 * 是否顯示未開啟取用位置權限通知
 */
const isShowGeoError = ref(false);

onMounted(() => {
  initMap(currentLocation.value.lat, currentLocation.value.lng);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', setMapHeight);
  if (map) {
    map.remove();
    map = null;
  }
});

const handleExpandChange = (newValue: boolean) => {
  isExpand.value = newValue;
};

const handleSearchChange = async (data: Place) => {
  if (!data) {
    return;
  }
  console.log('handleSearchChange:', data);
  searchSpotList.value = [];
  selectedSearchData.value = data;

  switch (data.data_type) {
    case 'api':
    case 'json':
      searchSpotList.value = await fetchAndFormatData(
        data.request_url,
        mappingFormatter,
        data.format_fields,
        data.service_infos,
        data.data_path
      );
      break;
    case 'csv':
      break;
    default:
      break;
  }

  console.log('searchSpotList:', searchSpotList.value);
};

const setMapHeight = () => {
  const mapElement = document.getElementById('map');
  if (mapElement) {
    mapElement.style.height = `${window.innerHeight - 88}px`;
  }
  map?.invalidateSize();
};

/**
 * 初始化地圖
 * @param lat 緯度
 * @param lng 經度
 */
const initMap = (lat: number, lng: number) => {
  const mapElement = document.getElementById('map');
  if (!mapElement) return;

  setMapHeight();
  map = createOsmMap(mapElement, { lat, lng }, 13);

  // init marker: 使用者目前位置
  marker = createUserLocationMarker(map, { lat, lng });

  // get current location
  getPositionClick();

  // 地圖移動或縮放後重新篩選視窗內的地點
  map.on('moveend', () => {
    updateMarkers();
  });

  isMapReady.value = true;
  window.addEventListener('resize', setMapHeight);
};

const getPositionClick = () => {
  getCurrentPosition()
    .then((position) => successCallback(position))
    .catch((error) => errorCallback(error));
};

const successCallback = (position: GeolocationPosition) => {
  currentLocation.value.lat = position.coords.latitude;
  currentLocation.value.lng = position.coords.longitude;

  // 使用者目前位置
  const latLng = L.latLng(position.coords.latitude, position.coords.longitude);
  marker?.setLatLng(latLng);
  map?.setView(latLng, map.getZoom());
};
const errorCallback = (error: any) => {
  console.log(error);
  if (error.code === 1) {
    // 使用者未開啟定位
    isShowGeoError.value = true;
  }
};

const fetchAndFormatData = async (
  url: string,
  formatter: (item: any, formatFields: any, serviceInfos: any[]) => Spot,
  formatFields: any,
  serviceInfos: any,
  dataPath: string
) => {
  try {
    const response = await axios.get(url);
    return formatSpotData(response.data, formatter, formatFields, serviceInfos, dataPath);
  } catch (error) {
    console.error(`Failed to fetch data from ${url}:`, error);
    return [];
  }
};

const formatSpotData = (
  data: any,
  formatter: (item: any, formatFields: any, serviceInfos: any[]) => Spot,
  formatFields: any,
  serviceInfos: any,
  dataPath: string
): Spot[] => {
  // 動態解析 dataPath，如果沒有提供 dataPath，默認使用 response
  const targetData = dataPath ? getNestedValue(data, dataPath) : data;
  return targetData.map((item: any) => formatter(item, formatFields, serviceInfos));
};

const updateMarkers = async () => {
  if (!selectedSearchData.value.id) {
    clearMarkers();
    return;
  }

  if (!map) return;
  const bounds = map.getBounds();

  filteredSpotList.value = searchSpotList.value
    .filter((spot) => bounds.contains(L.latLng(Number(spot.lat), Number(spot.lng))))
    .map((spot) => ({
      ...spot,
      distance: distanceInKm(currentLocation.value, spot)
    }));

  console.log('filteredSpotList:', filteredSpotList.value);

  // Clear existing markers
  clearMarkers();

  filteredSpotList.value.forEach((spot) => {
    const spotMarker = L.marker([Number(spot.lat), Number(spot.lng)], {
      icon: greenDotIcon
    }).addTo(map as L.Map);

    spotMarker.on('click', () => {
      if (currentFocusedMarker && currentFocusedMarker !== spotMarker) {
        // 恢復之前聚焦的標記為預設圖標
        currentFocusedMarker.setIcon(greenDotIcon);
        currentFocusedMarker.setZIndexOffset(0);
        selectedSpot.value = null;
      }

      // 設置當前標記為聚焦圖標
      spotMarker.setIcon(focusedIcon);
      spotMarker.setZIndexOffset(1000);
      currentFocusedMarker = spotMarker;

      // 獲取所選擇的 spot 的所有屬性
      selectedSpot.value = spot;
      console.log('Selected spot:', selectedSpot);
    });

    markers.push(spotMarker);
  });
};

const clearMarkers = () => {
  markers.forEach((marker) => marker.remove());
  markers = [];
  currentFocusedMarker = null;
  selectedSpot.value = null;
};

// Watch for changes in searchSpotList
watch(searchSpotList, updateMarkers);

// 地圖從隱藏恢復顯示時，重新計算尺寸
watch([isExpand, isExpandList, isExpandDetail], async ([expand, expandList, expandDetail]) => {
  if (!expand && !expandList && !expandDetail) {
    await nextTick();
    setMapHeight();
  }
});
</script>

<template>
  <div class="pb-8 h-screen">
    <div
      :class="{ hidden: isExpandList || isExpandDetail, visible: !isExpandList && !isExpandDetail }"
    >
      <!-- 找地點搜尋框 -->
      <div class="flex items-center">
        <FindPlace
          @onSearchChange="(value) => handleSearchChange(value)"
          @update:isExpand="handleExpandChange"
        />
      </div>
      <!-- 地圖 -->
      <div class="relative flex-1" :class="{ hidden: isExpand, visible: !isExpand }">
        <div class="osm-map" id="map"></div>
        <div v-if="isMapReady" class="gps" @click="getPositionClick">
          <img src="@/assets/images/gps.png" width="20" alt="" />
        </div>
      </div>
      <!-- 選取的點 -->
      <div
        v-if="selectedSearchData.id && !isExpand && selectedSpot"
        class="floating-box bottom-24 left-[50%] translate-x-[-50%] w-[90%]"
        @click="
          isExpandDetail = true;
          isFrom = 'spot';
        "
      >
        <div>
          <p class="font-bold mb-2">{{ selectedSpot.name }}</p>
          <div class="flex mb-2">
            <img src="@/assets/images/icon-geo.svg" alt="" />
            <span class="underline">{{ selectedSpot.address }}</span>
          </div>
          <!-- custom template -->
          <div class="flex text-grey-500">
            <span>{{ selectedSpot.distance }}公里</span>
          </div>
        </div>
        <img src="@/assets/images/down-icon.svg" class="-rotate-90" alt="" />
      </div>
      <!-- 底部搜尋結果 -->
      <div v-if="selectedSearchData.id && !isExpand" class="floating-box bottom-0 w-full">
        <div class="flex items-center">
          <span class="font-bold mr-2">{{ selectedSearchData.name }}</span>
          <div class="text-primary-500 border border-primary-500 rounded-full px-2">
            {{ filteredSpotList.length }}筆結果
          </div>
        </div>
        <a class="text-primary-500" @click="isExpandList = true">展開列表</a>
      </div>
    </div>
    <!-- 搜尋結果列表 -->
    <SpotList
      v-if="isExpandList"
      :selectedSearchData="selectedSearchData"
      :filteredSpotList="filteredSpotList"
      @update:isExpandList="(value: boolean) => (isExpandList = value)"
      @update:selectedSpot="
        (value: Spot) => {
          selectedSpot = value;
          isExpandDetail = true;
          isFrom = 'list';
        }
      "
    />
    <!-- 搜尋結果明細 -->
    <SpotDetail
      v-if="selectedSpot && isExpandDetail && isFrom"
      :selectedSearchData="selectedSearchData"
      :selectedSpot="selectedSpot"
      @update:isExpandDetail="
        (value) => {
          isExpandDetail = value;
          selectedSpot = null;
          if (isFrom === 'list') {
            isExpandList = true;
          }
          isFrom = '';
        }
      "
    />
  </div>

  <!-- geo modal -->
  <MessageModal :is-show="isShowGeoError">
    <template #header>
      <p>請啟用定位服務</p>
    </template>
    <template #body>
      <p class="text-grey-700">打開定位服務來允許“城市通”確認您的位置</p>
    </template>
    <template #footer>
      <button class="text-primary-500 px-7 py-2 w-full" @click="isShowGeoError = false">
        確認
      </button>
    </template>
  </MessageModal>
</template>

<style lang="postcss" scoped>
.osm-map {
  width: 100%;
  height: 400px;
  /* 讓 Leaflet 內部的 z-index 不會蓋過浮動面板 */
  position: relative;
  z-index: 0;
}

.marker {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 60px;
}

.gps {
  position: absolute;
  z-index: 1;
  right: 10px;
  top: 10px;
  background-color: rgb(255, 255, 255);
  width: 40px;
  height: 40px;
  user-select: none;
  box-shadow: rgba(0, 0, 0, 0.3) 0px 1px 4px -1px;
  border-radius: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.floating-box {
  @apply absolute z-[1] flex items-center justify-between bg-white px-4 py-6 rounded-xl;
  box-shadow: rgba(0, 0, 0, 0.04) 0px -4px 10px;
}
</style>
