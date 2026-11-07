<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import L from 'leaflet';
import BaseSelect, { type Option } from '@/components/atoms/BaseSelect.vue';
import BaseButton from '@/components/atoms/BaseButton.vue';
import greenDotIconUrl from '/public/images/map/youbike/mappin-green.svg';
import defaultFocusIconUrl from '/public/images/map/icon_mappin-garbagetruck-green-pressed.svg';
import { DEFAULT_CENTER, createImageIcon, createOsmMap } from '@/utils/leaflet-map';

export interface PlaceSpot {
  id: string;
  name: string;
  category: string;
  area: string;
  address: string;
  lat: number;
  lng: number;
  /** 導航用網址 */
  map: string;
}

const props = withDefaults(
  defineProps<{
    categories: Option[];
    spots: PlaceSpot[];
    placeholder?: string;
    zoom?: number;
  }>(),
  {
    placeholder: '選擇類型',
    zoom: 12
  }
);

const emit = defineEmits<{
  navigate: [spot: PlaceSpot];
}>();

const selectedCategory = ref('');
const selectedSpot = ref<PlaceSpot | null>(null);

const mapRef = ref<HTMLElement | null>(null);
let map: L.Map | null = null;
let markers: L.Marker[] = [];
let currentFocusedMarker: L.Marker | null = null;

/** 預設綠色小圓點圖標 */
const greenDotIcon = createImageIcon(greenDotIconUrl, [20, 20], [10, 20]);
/** 點擊後聚焦圖標 */
const focusedIcon = createImageIcon(defaultFocusIconUrl, [48, 69], [24, 69]);

const categoryName = (id: string) =>
  props.categories.find((item) => item.value === id)?.label ?? '';

const filteredSpotList = computed(() =>
  selectedCategory.value
    ? props.spots.filter((spot) => spot.category === selectedCategory.value)
    : props.spots
);

onMounted(() => {
  if (!mapRef.value) return;
  map = createOsmMap(mapRef.value, DEFAULT_CENTER, props.zoom);
  updateMarkers();
});

onBeforeUnmount(() => {
  if (map) {
    map.remove();
    map = null;
  }
});

const focusSpot = (spot: PlaceSpot, spotMarker: L.Marker) => {
  if (currentFocusedMarker && currentFocusedMarker !== spotMarker) {
    currentFocusedMarker.setIcon(greenDotIcon);
    currentFocusedMarker.setZIndexOffset(0);
  }
  spotMarker.setIcon(focusedIcon);
  spotMarker.setZIndexOffset(1000);
  currentFocusedMarker = spotMarker;
  selectedSpot.value = spot;
};

const updateMarkers = () => {
  if (!map) return;
  clearMarkers();

  filteredSpotList.value.forEach((spot) => {
    const spotMarker = L.marker([Number(spot.lat), Number(spot.lng)], {
      icon: greenDotIcon
    }).addTo(map as L.Map);

    spotMarker.on('click', () => focusSpot(spot, spotMarker));
    markers.push(spotMarker);
  });

  if (filteredSpotList.value.length) {
    const bounds = L.latLngBounds(
      filteredSpotList.value.map((spot) => [Number(spot.lat), Number(spot.lng)])
    );
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
  }
};

const clearMarkers = () => {
  markers.forEach((marker) => marker.remove());
  markers = [];
  currentFocusedMarker = null;
  selectedSpot.value = null;
};

const onListItemClick = (spot: PlaceSpot) => {
  const index = filteredSpotList.value.findIndex((item) => item.id === spot.id);
  const spotMarker = markers[index];
  if (!spotMarker || !map) return;
  focusSpot(spot, spotMarker);
  map.setView(spotMarker.getLatLng(), Math.max(map.getZoom(), 15));
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

watch([selectedCategory, () => props.spots], updateMarkers);
</script>

<template>
  <div class="place-map">
    <!-- 類型選擇 -->
    <div class="px-4 py-3">
      <label for="findPlace" class="block font-semibold text-grey-700 mb-1">地點類型</label>
      <BaseSelect
        v-model="selectedCategory"
        select-id="findPlace"
        :options="props.categories"
        :default-selected="props.placeholder"
        class="w-full"
      />
    </div>

    <!-- 地圖 -->
    <div class="relative">
      <div ref="mapRef" class="osm-map"></div>
      <!-- 選取的點 -->
      <div v-if="selectedSpot" class="floating-box">
        <div class="flex-1">
          <p class="font-bold mb-1">{{ selectedSpot.name }}</p>
          <div class="flex items-center text-sm mb-1">
            <img src="@/assets/images/icon-geo.svg" class="mr-1" alt="" />
            <span>{{ selectedSpot.address }}</span>
          </div>
          <span class="text-xs text-primary-500 bg-primary-50 rounded-full px-2 py-0.5">
            {{ categoryName(selectedSpot.category) }}
          </span>
        </div>
        <BaseButton
          :shape="'rounded'"
          class="!px-5 !py-2 text-sm shrink-0"
          @click="emit('navigate', selectedSpot)"
        >
          導航
        </BaseButton>
      </div>
    </div>

    <!-- 列表 -->
    <div class="px-4 py-4">
      <div class="flex items-center mb-3">
        <h5 class="font-bold mr-2">
          {{ selectedCategory ? categoryName(selectedCategory) : '全部地點' }}
        </h5>
        <span class="text-primary-500 border border-primary-500 rounded-full px-2 text-sm">
          {{ filteredSpotList.length }}筆結果
        </span>
      </div>
      <ul>
        <li
          v-for="spot in filteredSpotList"
          :key="spot.id"
          class="list-item"
          :class="{ 'list-item--active': selectedSpot?.id === spot.id }"
          @click="onListItemClick(spot)"
        >
          <div class="flex-1">
            <p class="font-bold">{{ spot.name }}</p>
            <p class="text-sm text-grey-500">{{ spot.area }}・{{ spot.address }}</p>
          </div>
          <span class="text-xs text-grey-500 shrink-0">{{ categoryName(spot.category) }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style lang="postcss" scoped>
.osm-map {
  width: 100%;
  height: 320px;
  /* 讓 Leaflet 內部的 z-index 不會蓋過浮動面板 */
  position: relative;
  z-index: 0;
}

.floating-box {
  @apply absolute z-[1] bottom-3 left-[50%] translate-x-[-50%] w-[92%];
  @apply flex items-center justify-between gap-3 bg-white px-4 py-4 rounded-xl;
  box-shadow: rgba(0, 0, 0, 0.1) 0px 4px 12px;
}

.list-item {
  @apply flex items-center gap-2 py-3 px-2 border-b border-grey-50 cursor-pointer;

  &--active {
    @apply bg-primary-50 rounded-lg;
  }
}
</style>
