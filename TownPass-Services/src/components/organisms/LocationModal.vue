<script setup lang="ts">
import { ref, defineModel, watchEffect, watch, reactive, nextTick, onBeforeUnmount } from 'vue';
import { useDebounceFn } from '@vueuse/core';
import { disableBodyScroll, enableBodyScroll } from 'body-scroll-lock';
import L from 'leaflet';
import axios from 'axios';
import { useConnectionMessage } from '@/composables/useConnectionMessage';
import { useHandleConnectionData } from '@/composables/useHandleConnectionData';
import MessageModal from '@/components/molecules/MessageModal.vue';
import BaseDialog from '../atoms/BaseDialog.vue';
import { createOsmMap } from '@/utils/leaflet-map';

const emits = defineEmits(['positionConfirm']);

const props = defineProps<{
  formAddress: string;
}>();

const isShowLocaionModal = defineModel<boolean>({ default: false });

const locationModal = ref();

watchEffect(() => {
  if (isShowLocaionModal.value) {
    disableBodyScroll(locationModal.value);
  } else {
    enableBodyScroll(locationModal.value);
  }
});

const center = reactive({ lat: 25.0376146, lng: 121.563844 });

/** 地圖容器 */
const mapElement = ref<HTMLElement | null>(null);
let locationMap: L.Map | null = null;

const addressText = ref('110台北市信義區市府路1號');

/** OpenStreetMap Nominatim 地理編碼服務 */
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';

interface NominatimAddress {
  house_number?: string;
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city_district?: string;
  district?: string;
  town?: string;
  village?: string;
  county?: string;
  city?: string;
  state?: string;
  postcode?: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddress;
}

/**
 * 將 Nominatim 的地址資料組成台灣常見的地址格式（郵遞區號 + 縣市 + 區 + 路 + 號）
 */
const formatAddress = (result: NominatimResult): string => {
  const address = result.address;
  if (!address) return result.display_name;

  const parts: string[] = [];
  const push = (value?: string) => {
    if (value && !parts.includes(value)) parts.push(value);
  };

  push(address.postcode);
  push(address.city || address.state || address.county);
  push(address.city_district || address.suburb || address.district || address.town || address.village);
  push(address.road);
  if (address.house_number) {
    push(/號$/.test(address.house_number) ? address.house_number : `${address.house_number}號`);
  }

  return parts.length > 1 ? parts.join('') : result.display_name;
};

/**
 * 經緯度轉地址
 */
const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
  const { data } = await axios.get<NominatimResult>(`${NOMINATIM_URL}/reverse`, {
    params: { format: 'jsonv2', lat, lon: lng, 'accept-language': 'zh-TW' }
  });
  return data && data.lat ? formatAddress(data) : null;
};

/** 台灣的直轄市 / 縣市 */
const TAIWAN_CITIES = [
  '臺北市',
  '台北市',
  '新北市',
  '桃園市',
  '臺中市',
  '台中市',
  '臺南市',
  '台南市',
  '高雄市',
  '基隆市',
  '新竹市',
  '新竹縣',
  '嘉義市',
  '嘉義縣',
  '苗栗縣',
  '彰化縣',
  '南投縣',
  '雲林縣',
  '屏東縣',
  '宜蘭縣',
  '花蓮縣',
  '臺東縣',
  '台東縣',
  '澎湖縣',
  '金門縣',
  '連江縣'
];

interface ParsedAddress {
  postcode?: string;
  city?: string;
  district?: string;
  street?: string;
  houseNumber?: string;
}

/**
 * 將台灣地址拆成「縣市 / 行政區 / 路街 / 門牌」，供 Nominatim 結構化查詢使用
 */
const parseTaiwanAddress = (input: string): ParsedAddress => {
  const result: ParsedAddress = {};
  let rest = input.replace(/\s+/g, '').replace(/^(臺灣|台灣)/, '');

  const postcode = rest.match(/^(\d{3,6})/);
  if (postcode) {
    result.postcode = postcode[1];
    rest = rest.slice(postcode[1].length);
  }

  const city = TAIWAN_CITIES.find((name) => rest.startsWith(name));
  if (city) {
    result.city = city.replace(/^台/, '臺');
    rest = rest.slice(city.length);
  }

  const district = rest.match(/^(.{1,3}?[區鄉鎮市])/);
  if (district) {
    result.district = district[1];
    rest = rest.slice(district[1].length);
  }

  const houseNumber = rest.match(/(\d+)(?:之\d+)?號/);
  if (houseNumber && houseNumber.index !== undefined) {
    result.houseNumber = houseNumber[1];
    rest = rest.slice(0, houseNumber.index);
  }

  // 路街名（含「段」），去掉巷弄
  const street = rest.match(/^(.+?(?:路|街|大道|道)(?:[一二三四五六七八九十\d]+段)?)/);
  result.street = street ? street[1] : rest || undefined;

  return result;
};

const searchNominatim = async (params: Record<string, string | number>) => {
  const { data } = await axios.get<NominatimResult[]>(`${NOMINATIM_URL}/search`, {
    params: {
      format: 'jsonv2',
      limit: 1,
      addressdetails: 1,
      countrycodes: 'tw',
      'accept-language': 'zh-TW',
      ...params
    }
  });
  return data?.length ? data[0] : null;
};

/**
 * 地址轉經緯度：先用結構化查詢（門牌 + 路名 + 縣市），找不到再逐步放寬條件
 */
const geocode = async (
  address: string
): Promise<{ lat: number; lng: number; address: string } | null> => {
  const parsed = parseTaiwanAddress(address);
  const queries: Record<string, string | number>[] = [];

  if (parsed.street) {
    const cityParams: Record<string, string> = parsed.city ? { city: parsed.city } : {};
    if (parsed.houseNumber) {
      queries.push({ street: `${parsed.houseNumber} ${parsed.street}`, ...cityParams });
    }
    queries.push({ street: parsed.street, ...cityParams });
  }
  queries.push({ q: address });
  if (parsed.city || parsed.district) {
    queries.push({ q: [parsed.city, parsed.district, parsed.street].filter(Boolean).join(' ') });
  }

  for (const query of queries) {
    const result = await searchNominatim(query);
    // 只有縣市層級的結果（例如整個台灣）對使用者沒有幫助
    if (result && result.address && (result.address.road || result.address.suburb)) {
      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        address: formatAddress(result)
      };
    }
  }
  return null;
};

const isTyping = ref(false);

const isPanning = ref(false);

const isNoResultModalShow = ref(false);

/**
 * 程式移動地圖（不觸發反查地址）
 */
const panMapTo = (lat: number, lng: number) => {
  center.lat = lat;
  center.lng = lng;
  if (locationMap) {
    isPanning.value = true;
    locationMap.setView([lat, lng], locationMap.getZoom());
  }
};

const handleLocation = async (event: { data: string }) => {
  const result: { name: string; data: { longitude: number; latitude: number } } = JSON.parse(
    event.data
  );

  if (result.data.longitude && result.data.latitude) {
    try {
      const address = await reverseGeocode(result.data.latitude, result.data.longitude);
      if (address) {
        addressText.value = address;
      }
    } catch (error) {
      console.error('reverse geocode failed:', error);
    }

    panMapTo(result.data.latitude, result.data.longitude);
  }
};

useConnectionMessage('location', null);
useHandleConnectionData(handleLocation);

/**
 * 使用者拖曳地圖後，反查中心點的地址
 */
const mapCenterChanged = useDebounceFn(async () => {
  if (locationMap) {
    const newCenter = locationMap.getCenter();
    const lat = parseFloat(newCenter.lat.toFixed(7));
    const lng = parseFloat(newCenter.lng.toFixed(7));

    try {
      const address = await reverseGeocode(lat, lng);
      if (address) {
        center.lat = lat;
        center.lng = lng;
        addressText.value = address;
      } else {
        isNoResultModalShow.value = true;
      }
    } catch (error) {
      console.error('reverse geocode failed:', error);
    }
  }
}, 1000);

/**
 * 地圖移動結束：程式移動（panTo）不反查地址，使用者拖曳才反查
 */
const onMapMoveEnd = () => {
  if (isPanning.value) {
    isPanning.value = false;
    return;
  }
  mapCenterChanged();
};

const searchPositionByText = async () => {
  try {
    const result = await geocode(addressText.value);
    if (result) {
      addressText.value = result.address;
      panMapTo(result.lat, result.lng);
    } else {
      isNoResultModalShow.value = true;
    }
  } catch (error) {
    console.error('geocode failed:', error);
    isNoResultModalShow.value = true;
  }
};

watch(addressText, async () => {
  if (isTyping.value && addressText.value) {
    searchPositionByText();
  }
});

const onConfirmClick = () => {
  emits('positionConfirm', addressText.value);
  isShowLocaionModal.value = false;
};

/**
 * 建立地圖（modal 開啟後 DOM 才存在）
 */
const initMap = () => {
  if (!mapElement.value || locationMap) return;

  locationMap = createOsmMap(mapElement.value, center, 15);
  isPanning.value = false;
  locationMap.on('moveend', onMapMoveEnd);
};

const destroyMap = () => {
  if (locationMap) {
    locationMap.off('moveend', onMapMoveEnd);
    locationMap.remove();
    locationMap = null;
  }
};

watch(isShowLocaionModal, async (isShow) => {
  if (isShow) {
    await nextTick();
    initMap();

    if (props.formAddress && props.formAddress !== addressText.value) {
      addressText.value = props.formAddress;
      searchPositionByText();
    }
  } else {
    destroyMap();
  }
});

onBeforeUnmount(destroyMap);
</script>

<template>
  <div>
    <MessageModal ref="locationModal" :is-show="isShowLocaionModal" class="location-modal">
      <template #header>
        <div>
          <div class="flex justify-between">
            <div />
            <span>輸入地址</span>
            <button @click="isShowLocaionModal = false">
              <img
                src="@/assets/images/icon-cancel-default.svg"
                width="24"
                height="24"
                class="size-6"
              />
            </button>
          </div>
          <div class="relative w-11/12 mt-3 mx-auto">
            <input
              v-model.lazy="addressText"
              type="text"
              class="location-modal__input"
              @focus="isTyping = true"
              @blur="isTyping = false"
            />
            <button class="absolute top-1/2 -translate-y-1/2 right-2" @click="addressText = ''">
              <img src="@/assets/images/cancel-text-icon.svg" />
            </button>
          </div>
        </div>
      </template>
      <template #body>
        <div class="location-modal__map-wrapper">
          <div ref="mapElement" class="location-modal__map" />
          <div class="location-modal__center-marker" />
        </div>
      </template>
      <template #footer>
        <button
          class="bg-primary-500 text-white rounded-full py-2 w-11/12 mx-auto my-1"
          @click="onConfirmClick"
        >
          確認
        </button>
      </template>
    </MessageModal>
    <BaseDialog
      v-model="isNoResultModalShow"
      :is-alert="true"
      title="提醒"
      content="搜尋不到此地址，請重新輸入"
    />
  </div>
</template>

<style lang="postcss">
.location-modal {
  @apply [&_.modal-container]:size-full;
  @apply [&_.modal-container]:flex [&_.modal-container]:flex-col;
  @apply [&_.modal-container]:rounded-none;
  @apply [&_.modal-container]:shadow-none;
  @apply [&_.modal-container]:m-auto;
  @apply [&_.modal-header]:text-black [&_.modal-header]:text-lg;
  @apply [&_.modal-header]:py-2 [&_.modal-header]:px-4;
  @apply [&_.modal-body]:m-0 [&_.modal-body]:flex-grow [&_.modal-body]:relative;

  &__input {
    @apply rounded-lg outline-none bg-gray-100;
    @apply py-1 pl-2 pr-8;
    @apply w-full text-sm;
    @apply font-normal;
  }

  &__map-wrapper {
    @apply absolute inset-0 overflow-hidden;
  }

  &__map {
    @apply size-full relative z-0;
  }

  &__center-marker {
    @apply absolute top-1/2 left-1/2 z-[1];
    @apply -ml-[14px] -mt-[43px];
    @apply h-11 w-7;
    @apply pointer-events-none;
    @apply bg-[url('@/assets/images/marker.png')] bg-contain;
  }
}
</style>
