<script setup lang="ts">
import { ref } from 'vue';
import FixedTitleSection from '@/components/molecules/FixedTitleSection.vue';
import PlaceMapView, { type PlaceSpot } from '@/components/organisms/PlaceMapView.vue';
import { useConnectionMessage } from '@/composables/useConnectionMessage';
import spotsJson from '../../public/mock/pet-map/spots.json';

const categories = spotsJson.categories.map((item) => ({ label: item.name, value: item.id }));
const spotList = ref<PlaceSpot[]>(spotsJson.data);

const onNavigateClick = (spot: PlaceSpot) => {
  useConnectionMessage('launch_map', spot.map);
};
</script>

<template>
  <div class="pet-map">
    <FixedTitleSection title="寵物安心遛" />
    <PlaceMapView
      :categories="categories"
      :spots="spotList"
      placeholder="選擇寵物友善地點類型"
      @navigate="onNavigateClick"
    />
  </div>
</template>

<style lang="postcss" scoped>
.pet-map {
  @apply pt-12 pb-4;
}
</style>
