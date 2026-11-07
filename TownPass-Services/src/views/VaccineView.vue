<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import FixedTitleSection from '@/components/molecules/FixedTitleSection.vue';
import BaseSelect from '@/components/atoms/BaseSelect.vue';
import BaseRadio from '@/components/atoms/BaseRadio.vue';
import BaseButton from '@/components/atoms/BaseButton.vue';
import vaccineJson from '../../public/mock/vaccine/vaccine_sites.json';

const vaccineOptions = vaccineJson.vaccine_types.map((item) => ({
  label: item.name,
  value: item.id
}));

const siteOptions = vaccineJson.sites.map((item) => ({
  label: `${item.district} ${item.name}`,
  value: item.id
}));

const slotOptions = vaccineJson.slots.map((item) => ({ label: item.name, value: item.id }));

const form = reactive({
  vaccine_type: '',
  site: '',
  date: '',
  slot: ''
});

const triggerValidate = ref(false);
const isSubmitted = ref(false);
const reservationNo = ref('');

const isDateMissing = computed(() => triggerValidate.value && !form.date);
const isSlotMissing = computed(() => triggerValidate.value && !form.slot);

const vaccineName = computed(
  () => vaccineOptions.find((item) => item.value === form.vaccine_type)?.label ?? ''
);
const siteItem = computed(() => vaccineJson.sites.find((item) => item.id === form.site));
const slotName = computed(
  () => slotOptions.find((item) => item.value === form.slot)?.label ?? ''
);

const onSubmitClick = () => {
  triggerValidate.value = true;
  if (form.vaccine_type && form.site && form.date && form.slot) {
    reservationNo.value = `VX${form.date.replace(/-/g, '')}${String(
      Math.floor(Math.random() * 9000) + 1000
    )}`;
    isSubmitted.value = true;
  }
};

const onResetClick = () => {
  form.vaccine_type = '';
  form.site = '';
  form.date = '';
  form.slot = '';
  triggerValidate.value = false;
  isSubmitted.value = false;
};
</script>

<template>
  <div class="vaccine">
    <FixedTitleSection title="疫苗預約" />
    <form v-if="!isSubmitted" class="w-full px-4 py-3" @submit.prevent>
      <div class="vaccine__form-group">
        <label for="vaccine_type" class="font-semibold text-grey-700">疫苗種類</label>
        <BaseSelect
          v-model="form.vaccine_type"
          select-id="vaccine_type"
          :options="vaccineOptions"
          default-selected="選擇疫苗種類"
          :required="true"
          :trigger-validate="triggerValidate"
          class="w-full"
        />
      </div>
      <div class="vaccine__form-group">
        <label for="site" class="font-semibold text-grey-700">接種地點</label>
        <BaseSelect
          v-model="form.site"
          select-id="site"
          :options="siteOptions"
          default-selected="選擇接種地點"
          :required="true"
          :trigger-validate="triggerValidate"
          class="w-full"
        />
        <p v-if="siteItem" class="text-sm text-grey-500 pl-1">{{ siteItem.address }}</p>
      </div>
      <div class="vaccine__form-group">
        <label for="date" class="font-semibold text-grey-700">日期</label>
        <input
          v-model="form.date"
          type="date"
          id="date"
          class="base-input w-full"
          :class="{ 'base-input--warn': isDateMissing }"
        />
        <p v-if="isDateMissing" class="text-right text-warn-200 text-sm">日期不能為空</p>
      </div>
      <div class="vaccine__form-group">
        <label class="font-semibold text-grey-700">時段</label>
        <div class="flex flex-wrap gap-6 pl-1 py-1">
          <BaseRadio
            v-for="option in slotOptions"
            :key="option.value"
            v-model="form.slot"
            radio-name="slot"
            :radio-id="option.value"
            :radio-text="option.label"
            :required="true"
            :trigger-validate="triggerValidate"
          />
        </div>
        <p v-if="isSlotMissing" class="text-right text-warn-200 text-sm">時段不能為空</p>
      </div>
      <p class="text-sm text-grey-500 mb-4">接種當日攜帶健保卡，預約時段前 10 分鐘報到。</p>
      <BaseButton @click="onSubmitClick" class="w-full">預約</BaseButton>
    </form>

    <!-- 預約完成 -->
    <div v-else class="px-4 py-3">
      <div class="bg-primary-50 rounded-xl p-5 text-center mb-5">
        <img src="@/assets/images/check-icon.svg" class="w-20 mx-auto mb-2" alt="" />
        <h5 class="text-xl font-bold text-primary-500 mb-1">預約完成</h5>
        <p class="text-sm text-grey-500">預約編號</p>
        <p class="text-lg font-bold tracking-wider">{{ reservationNo }}</p>
      </div>
      <ul class="bg-grey-50 rounded-xl px-5 py-3 mb-5">
        <li class="flex justify-between py-2 border-b border-grey-100">
          <span class="text-grey-500">疫苗種類</span>
          <span class="font-bold">{{ vaccineName }}</span>
        </li>
        <li class="flex justify-between py-2 border-b border-grey-100">
          <span class="text-grey-500">接種地點</span>
          <span class="font-bold text-right">{{ siteItem?.name }}</span>
        </li>
        <li class="flex justify-between py-2 border-b border-grey-100">
          <span class="text-grey-500">日期</span>
          <span class="font-bold">{{ form.date }}</span>
        </li>
        <li class="flex justify-between py-2">
          <span class="text-grey-500">時段</span>
          <span class="font-bold">{{ slotName }}</span>
        </li>
      </ul>
      <BaseButton :outline="true" @click="onResetClick" class="w-full">再預約一筆</BaseButton>
    </div>
  </div>
</template>

<style lang="postcss">
.vaccine {
  @apply pt-12 pb-4;

  &__form-group {
    @apply flex flex-col gap-y-1 mb-3;
  }
}
</style>
