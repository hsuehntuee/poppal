<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import L from 'leaflet';
import FixedTitleSection from '@/components/molecules/FixedTitleSection.vue';
import FeePaymentTabsView from '@/components/organisms/FeePaymentTabsView.vue';
import greenDotIconUrl from '/public/images/map/youbike/mappin-green.svg';
import defaultFocusIconUrl from '/public/images/map/icon_mappin-garbagetruck-green-pressed.svg';
import { createImageIcon, createOsmMap } from '@/utils/leaflet-map';
import { useZooStore, type ZooArea } from '@/stores/zoo';

const store = useZooStore();
const { center, areaList, animalList, eventList } = storeToRefs(store);

const tabList = [
  { id: 0, title: '園區地圖' },
  { id: 1, title: '動物介紹' },
  { id: 2, title: '今日活動' }
];

const activeTab = ref(0);

const mapRef = ref<HTMLElement | null>(null);
let map: L.Map | null = null;
let markers: L.Marker[] = [];
let currentFocusedMarker: L.Marker | null = null;

const greenDotIcon = createImageIcon(greenDotIconUrl, [20, 20], [10, 20]);
const focusedIcon = createImageIcon(defaultFocusIconUrl, [48, 69], [24, 69]);

const selectedArea = ref<ZooArea | null>(null);

const focusArea = (area: ZooArea, areaMarker: L.Marker) => {
  if (currentFocusedMarker && currentFocusedMarker !== areaMarker) {
    currentFocusedMarker.setIcon(greenDotIcon);
    currentFocusedMarker.setZIndexOffset(0);
  }
  areaMarker.setIcon(focusedIcon);
  areaMarker.setZIndexOffset(1000);
  currentFocusedMarker = areaMarker;
  selectedArea.value = area;
};

onMounted(() => {
  if (!mapRef.value) return;
  map = createOsmMap(mapRef.value, center.value, 16);

  areaList.value.forEach((area) => {
    const areaMarker = L.marker([area.lat, area.lng], { icon: greenDotIcon }).addTo(map as L.Map);
    areaMarker.on('click', () => focusArea(area, areaMarker));
    markers.push(areaMarker);
  });
});

onBeforeUnmount(() => {
  markers.forEach((marker) => marker.remove());
  markers = [];
  if (map) {
    map.remove();
    map = null;
  }
});

const onAreaClick = (area: ZooArea) => {
  const index = areaList.value.findIndex((item) => item.id === area.id);
  const areaMarker = markers[index];
  if (!areaMarker || !map) return;
  focusArea(area, areaMarker);
  map.setView(areaMarker.getLatLng(), 17);
};

// 切回地圖分頁時重新計算尺寸
watch(activeTab, async (tab) => {
  if (tab === 0) {
    await nextTick();
    map?.invalidateSize();
  }
});
</script>

<template>
  <FixedTitleSection title="愛遊動物園" />
  <FeePaymentTabsView v-model="activeTab" :tab-list="tabList">
    <!-- 園區地圖 -->
    <template #tab0>
      <div class="relative">
        <div ref="mapRef" class="osm-map"></div>
        <div v-if="selectedArea" class="floating-box">
          <p class="font-bold mb-1">{{ selectedArea.name }}</p>
          <p class="text-sm text-grey-500">{{ selectedArea.description }}</p>
        </div>
      </div>
      <div class="px-4 py-4">
        <h5 class="font-bold mb-3">館區</h5>
        <ul class="grid grid-cols-2 gap-2">
          <li
            v-for="area in areaList"
            :key="area.id"
            class="area-item"
            :class="{ 'area-item--active': selectedArea?.id === area.id }"
            @click="onAreaClick(area)"
          >
            {{ area.name }}
          </li>
        </ul>
      </div>
    </template>

    <!-- 動物介紹 -->
    <template #tab1>
      <div class="px-4 py-4">
        <div class="w-full flex flex-col">
          <RouterLink
            v-for="animal in animalList"
            :key="animal.id"
            :to="{ name: 'zoo-animal-detail', params: { id: animal.id } }"
            class="link-wrapper"
          >
            <div class="flex-1">
              <p class="font-bold">{{ animal.name }}</p>
              <p class="text-sm text-grey-500">{{ animal.area }}・{{ animal.origin }}</p>
            </div>
          </RouterLink>
        </div>
      </div>
    </template>

    <!-- 今日活動 -->
    <template #tab2>
      <div class="px-4 py-4">
        <ul>
          <li
            v-for="event in eventList"
            :key="event.id"
            class="flex items-center py-3 border-b border-grey-50"
          >
            <span class="w-16 font-bold text-primary-500 shrink-0">{{ event.time }}</span>
            <div class="flex-1">
              <p class="font-bold">{{ event.title }}</p>
              <p class="text-sm text-grey-500">{{ event.location }}</p>
            </div>
          </li>
        </ul>
      </div>
    </template>
  </FeePaymentTabsView>
</template>

<style lang="postcss" scoped>
.osm-map {
  width: 100%;
  height: 320px;
  position: relative;
  z-index: 0;
}

.floating-box {
  @apply absolute z-[1] bottom-3 left-[50%] translate-x-[-50%] w-[92%];
  @apply bg-white px-4 py-3 rounded-xl;
  box-shadow: rgba(0, 0, 0, 0.1) 0px 4px 12px;
}

.area-item {
  @apply px-3 py-2 rounded-lg text-sm text-center cursor-pointer;
  @apply bg-grey-50 text-grey-700;

  &--active {
    @apply bg-primary-500 text-white font-bold;
  }
}

.link-wrapper {
  @apply relative py-4 pr-7 border-b border-grey-50;
  @apply flex items-center;
  @apply after:content-[''] after:w-6 after:h-6;
  @apply after:bg-[url('@/assets/images/down-icon.svg')] after:bg-cover after:bg-no-repeat after:-rotate-90;
  @apply after:block after:absolute after:top-1/2 after:-translate-y-1/2 after:right-0;
}
</style>
