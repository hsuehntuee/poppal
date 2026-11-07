<script setup lang="ts">
import type { Library } from '@/interfaces/library-book.interface';
import LibraryList from '@/components/organisms/LibraryListView.vue';
import LibraryDetail from '@/components/organisms/LibraryDetailView.vue';
import MessageModal from '@/components/molecules/MessageModal.vue';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import L from 'leaflet';
import greenDotIconUrl from '/public/images/map/youbike/mappin-green.svg';
import defaultFocusIconUrl from '/public/images/map/icon_mappin-garbagetruck-green-pressed.svg';
import { useLibraryStore } from '@/stores/library';
import { storeToRefs } from 'pinia';
import {
  DEFAULT_CENTER,
  createImageIcon,
  createOsmMap,
  createUserLocationMarker,
  distanceInKm,
  getCurrentPosition
} from '@/utils/leaflet-map';

const libraryStore = useLibraryStore();
const { libraryList } = storeToRefs(libraryStore);

/**
 * 目前位置
 */
const currentLocation = ref<{ lat: number; lng: number; results: any[] }>({
  // 預設經緯度在台北市
  lat: DEFAULT_CENTER.lat,
  lng: DEFAULT_CENTER.lng,
  results: []
});

/** 搜尋結果 */
const searchLibraryList = ref<Library[]>([]);
/** 視窗下搜尋結果 */
const filteredLibraryList = ref<Library[]>([]);
const selectedLibrary = ref<Library | null>(null);

let isMapReady = ref(false);

let map: L.Map | null = null;
/** 使用者定位 */
let marker: L.CircleMarker | null = null;
/** 圖書館標記 */
let markers: L.Marker[] = [];
/** 目前聚焦的標記 */
let currentFocusedMarker: L.Marker | null = null;

/** 預設綠色小圓點圖標 */
const greenDotIcon = createImageIcon(greenDotIconUrl, [20, 20], [10, 20]);
/** 點擊後聚焦圖標 */
const focusedIcon = createImageIcon(defaultFocusIconUrl, [48, 69], [24, 69]);

/** 是否點選展開列表 */
const isExpandList = ref(false);
/** 是否點選展開明細 */
const isExpandDetail = ref(false);
const isFrom = ref<'spot' | 'list' | ''>('');

/**
 * 是否顯示未開啟取用位置權限通知
 */
let isShowGeoError = ref(false);

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

  // 地圖移動或縮放後重新篩選視窗內的圖書館
  map.on('moveend', () => {
    updateMarkers();
  });

  isMapReady.value = true;
  window.addEventListener('resize', setMapHeight);

  // 地圖建立後先畫出目前視窗內的圖書館
  updateMarkers();
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

const updateMarkers = async () => {
  if (!map) return;
  const bounds = map.getBounds();

  filteredLibraryList.value = searchLibraryList.value
    .filter((spot) => bounds.contains(L.latLng(Number(spot.lat), Number(spot.lng))))
    .map((spot) => ({
      ...spot,
      distance: distanceInKm(currentLocation.value, spot)
    }));

  console.log('filteredLibraryList:', filteredLibraryList.value);

  // Clear existing markers
  clearMarkers();

  filteredLibraryList.value.forEach((spot) => {
    const spotMarker = L.marker([Number(spot.lat), Number(spot.lng)], {
      icon: greenDotIcon
    }).addTo(map as L.Map);

    spotMarker.on('click', () => {
      if (currentFocusedMarker && currentFocusedMarker !== spotMarker) {
        // 恢復之前聚焦的標記為預設圖標
        currentFocusedMarker.setIcon(greenDotIcon);
        currentFocusedMarker.setZIndexOffset(0);
        selectedLibrary.value = null;
      }

      // 設置當前標記為聚焦圖標
      spotMarker.setIcon(focusedIcon);
      spotMarker.setZIndexOffset(1000);
      currentFocusedMarker = spotMarker;

      // 獲取所選擇的 spot 的所有屬性
      selectedLibrary.value = spot;
      console.log('Selected spot:', selectedLibrary);
    });

    markers.push(spotMarker);
  });
};

const clearMarkers = () => {
  markers.forEach((marker) => marker.remove());
  markers = [];
  currentFocusedMarker = null;
  selectedLibrary.value = null;
};

onMounted(() => {
  searchLibraryList.value = libraryList.value;
  initMap(currentLocation.value.lat, currentLocation.value.lng);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', setMapHeight);
  if (map) {
    map.remove();
    map = null;
  }
});

// Watch for changes in searchLibraryList
watch(searchLibraryList, updateMarkers);

// 地圖從隱藏恢復顯示時，重新計算尺寸
watch([isExpandList, isExpandDetail], async ([expandList, expandDetail]) => {
  if (!expandList && !expandDetail) {
    await nextTick();
    setMapHeight();
  }
});
</script>

<template>
  <div class="">
    <div
      :class="{ hidden: isExpandList || isExpandDetail, visible: !isExpandList && !isExpandDetail }"
    >
      <!-- 地圖 -->
      <div class="relative flex-1">
        <div class="osm-map" id="map"></div>
        <div v-if="isMapReady" class="gps" @click="getPositionClick">
          <img src="@/assets/images/gps.png" width="20" alt="" />
        </div>
      </div>
      <!-- 選取的點 -->
      <div
        v-if="selectedLibrary"
        class="floating-box bottom-24 left-[50%] translate-x-[-50%] w-[90%]"
        @click="
          isExpandDetail = true;
          isFrom = 'spot';
        "
      >
        <div>
          <p class="font-bold mb-2">{{ selectedLibrary.name }}</p>
          <div class="flex mb-2">
            <img src="@/assets/images/icon-geo.svg" alt="" />
            <span class="underline">{{ selectedLibrary.address }}</span>
          </div>
          <!-- custom template -->
          <div class="flex text-grey-500">
            <span>{{ selectedLibrary.distance }}公里</span>
          </div>
        </div>
        <img src="@/assets/images/down-icon.svg" class="-rotate-90" alt="" />
      </div>
      <!-- 底部搜尋結果 -->
      <div class="floating-box bottom-0 w-full">
        <div class="flex items-center">
          <span class="font-bold mr-2">分館與站點</span>
          <div class="text-primary-500 border border-primary-500 rounded-full px-2">
            {{ filteredLibraryList.length }}筆結果
          </div>
        </div>
        <a class="text-primary-500" @click="isExpandList = true">展開列表</a>
      </div>
    </div>
    <!-- 搜尋結果列表 -->
    <LibraryList
      v-if="isExpandList"
      :filteredLibraryList="filteredLibraryList"
      @update:isExpandList="(value: boolean) => (isExpandList = value)"
      @update:selectedLibrary="
        (value: Library) => {
          selectedLibrary = value;
          isExpandDetail = true;
          isFrom = 'list';
        }
      "
    />
    <!-- 搜尋結果明細 -->
    <LibraryDetail
      v-if="selectedLibrary && isExpandDetail && isFrom"
      :selectedLibrary="selectedLibrary"
      @update:isExpandDetail="
        (value) => {
          isExpandDetail = value;
          selectedLibrary = null;
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
