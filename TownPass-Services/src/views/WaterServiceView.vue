<script setup lang="ts">
import { reactive, ref } from 'vue';
import FixedTitleSection from '@/components/molecules/FixedTitleSection.vue';
import FeePaymentTabsView from '@/components/organisms/FeePaymentTabsView.vue';
import BaseInput from '@/components/atoms/BaseInput.vue';
import BaseButton from '@/components/atoms/BaseButton.vue';
import waterRecordsJson from '../../public/mock/water-service/water_records.json';

const tabList = [
  { id: 0, title: '報水表度數' },
  { id: 1, title: '用水紀錄' }
];

const activeTab = ref(0);

/** 歷史用水紀錄 */
const recordList = ref<{ month: string; value: number; usage: number }[]>(waterRecordsJson.data);

const form = reactive({
  water_number: '',
  meter_value: ''
});

const triggerValidate = ref(false);
const isSubmitted = ref(false);
const submittedAt = ref('');

const isWaterNumberValid = () => /^\d{10}$/.test(form.water_number);
const isMeterValueValid = () => /^\d+$/.test(form.meter_value);

const onSubmitClick = () => {
  triggerValidate.value = true;
  if (isWaterNumberValid() && isMeterValueValid()) {
    submittedAt.value = new Date().toLocaleString('zh-TW', { hour12: false });
    isSubmitted.value = true;
  }
};

const onResetClick = () => {
  form.water_number = '';
  form.meter_value = '';
  triggerValidate.value = false;
  isSubmitted.value = false;
};
</script>

<template>
  <FixedTitleSection title="用水服務" />
  <FeePaymentTabsView v-model="activeTab" :tab-list="tabList">
    <template #tab0>
      <!-- 報水表度數 -->
      <form v-if="!isSubmitted" class="w-full px-4 py-5" @submit.prevent>
        <div class="water-service__form-group">
          <label for="water_number" class="font-semibold text-grey-700">水號</label>
          <BaseInput
            v-model="form.water_number"
            id="water_number"
            label="水號"
            placeholder="請輸入水號"
            inputmode="numeric"
            maxlength="10"
            :trigger-validate="triggerValidate"
            :required="true"
            class="w-full"
          />
          <p
            v-if="triggerValidate && form.water_number && !isWaterNumberValid()"
            class="text-right text-warn-200 text-sm"
          >
            水號需為 10 位數字
          </p>
        </div>
        <div class="water-service__form-group">
          <label for="meter_value" class="font-semibold text-grey-700">本期度數</label>
          <BaseInput
            v-model="form.meter_value"
            id="meter_value"
            label="本期度數"
            placeholder="輸入水表目前度數"
            inputmode="numeric"
            :trigger-validate="triggerValidate"
            :required="true"
            class="w-full"
          />
          <p
            v-if="triggerValidate && form.meter_value && !isMeterValueValid()"
            class="text-right text-warn-200 text-sm"
          >
            度數需為數字
          </p>
        </div>
        <p class="text-sm text-grey-500 mb-4">水號可於水費帳單右上方查得，度數填寫黑色數字部分。</p>
        <BaseButton @click="onSubmitClick" class="w-full">送出</BaseButton>
      </form>
      <!-- 成功 -->
      <div v-else class="px-4 py-5">
        <div class="bg-primary-50 rounded-xl p-5 text-center mb-5">
          <img src="@/assets/images/check-icon.svg" class="w-20 mx-auto mb-2" alt="" />
          <h5 class="text-xl font-bold text-primary-500 mb-1">已收到度數</h5>
          <p class="text-sm text-grey-500">{{ submittedAt }}</p>
        </div>
        <ul class="bg-grey-50 rounded-xl px-5 py-3 mb-5">
          <li class="flex justify-between py-2 border-b border-grey-100">
            <span class="text-grey-500">水號</span>
            <span class="font-bold">{{ form.water_number }}</span>
          </li>
          <li class="flex justify-between py-2">
            <span class="text-grey-500">本期度數</span>
            <span class="font-bold">{{ form.meter_value }} 度</span>
          </li>
        </ul>
        <BaseButton :outline="true" @click="onResetClick" class="w-full">再報一筆</BaseButton>
      </div>
    </template>
    <template #tab1>
      <!-- 用水紀錄 -->
      <div class="px-4 py-5">
        <div class="grid grid-cols-3 text-sm text-grey-500 px-3 pb-2 border-b border-grey-200">
          <span>月份</span>
          <span class="text-right">度數</span>
          <span class="text-right">用水量</span>
        </div>
        <ul>
          <li
            v-for="record in recordList"
            :key="record.month"
            class="grid grid-cols-3 px-3 py-4 border-b border-grey-50"
          >
            <span class="font-bold">{{ record.month }}</span>
            <span class="text-right">{{ record.value }} 度</span>
            <span class="text-right text-primary-500">{{ record.usage }} 度</span>
          </li>
        </ul>
      </div>
    </template>
  </FeePaymentTabsView>
</template>

<style lang="postcss">
.water-service__form-group {
  @apply flex flex-col gap-y-1 mb-3;
}
</style>
