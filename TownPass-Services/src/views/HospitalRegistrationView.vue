<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import FixedTitleSection from '@/components/molecules/FixedTitleSection.vue';
import BaseSelect from '@/components/atoms/BaseSelect.vue';
import BaseButton from '@/components/atoms/BaseButton.vue';
import doctorsJson from '../../public/mock/hospital-registration/doctors.json';

interface Doctor {
  id: string;
  name: string;
  slots: string[];
}

const branchOptions = doctorsJson.branches.map((item) => ({ label: item.name, value: item.id }));
const deptOptions = doctorsJson.depts.map((item) => ({ label: item.name, value: item.id }));

const branch = ref('');
const dept = ref('');

/** 選到的醫師與時段 */
const selected = ref<{ doctor: Doctor; time: string } | null>(null);

const doctorList = computed<Doctor[]>(() => {
  if (!branch.value || !dept.value) return [];
  return (
    doctorsJson.data.find((item) => item.branch === branch.value && item.dept === dept.value)
      ?.doctors ?? []
  );
});

watch([branch, dept], () => {
  selected.value = null;
});

const isSelected = (doctor: Doctor, time: string) =>
  selected.value?.doctor.id === doctor.id && selected.value?.time === time;

const onSlotClick = (doctor: Doctor, time: string) => {
  selected.value = isSelected(doctor, time) ? null : { doctor, time };
};

const isSubmitted = ref(false);
const serialNo = ref(0);

const onSubmitClick = () => {
  if (!selected.value) return;
  serialNo.value = Math.floor(Math.random() * 30) + 1;
  isSubmitted.value = true;
};

const onResetClick = () => {
  branch.value = '';
  dept.value = '';
  selected.value = null;
  isSubmitted.value = false;
};
</script>

<template>
  <div class="hospital-registration">
    <FixedTitleSection title="聯醫掛號" />
    <template v-if="!isSubmitted">
      <form class="w-full px-4 py-3" @submit.prevent>
        <div class="hospital-registration__form-group">
          <label for="branch" class="font-semibold text-grey-700">院區</label>
          <BaseSelect
            v-model="branch"
            select-id="branch"
            :options="branchOptions"
            default-selected="選擇院區"
            class="w-full"
          />
        </div>
        <div class="hospital-registration__form-group">
          <label for="dept" class="font-semibold text-grey-700">科別</label>
          <BaseSelect
            v-model="dept"
            select-id="dept"
            :options="deptOptions"
            default-selected="選擇科別"
            class="w-full"
          />
        </div>
      </form>

      <!-- 醫師與時段 -->
      <section class="px-4">
        <h5 class="font-bold mb-3">可掛號時段</h5>
        <div v-if="!doctorList.length" class="py-10 text-center text-grey-400">
          <img
            src="@/assets/images/illustrations_no_data.svg"
            class="mx-auto mb-2"
            alt="illustrations_no_data"
          />
          <p>選擇院區與科別後顯示</p>
        </div>
        <ul v-else>
          <li
            v-for="doctor in doctorList"
            :key="doctor.id"
            class="bg-grey-50 rounded-xl px-4 py-3 mb-3"
          >
            <p class="font-bold mb-2">{{ doctor.name }} 醫師</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="time in doctor.slots"
                :key="time"
                class="slot-button"
                :class="{ 'slot-button--active': isSelected(doctor, time) }"
                @click="onSlotClick(doctor, time)"
              >
                {{ doctor.name }} 醫師 {{ time }}
              </button>
            </div>
          </li>
        </ul>
      </section>

      <div class="px-4 mt-4">
        <BaseButton :disabled="!selected" @click="onSubmitClick" class="w-full">
          確認掛號
        </BaseButton>
      </div>
    </template>

    <!-- 掛號完成 -->
    <div v-else class="px-4 py-3">
      <div class="bg-primary-50 rounded-xl p-5 text-center mb-5">
        <img src="@/assets/images/check-icon.svg" class="w-20 mx-auto mb-2" alt="" />
        <h5 class="text-xl font-bold text-primary-500 mb-1">掛號完成</h5>
        <p class="text-sm text-grey-500">看診序號</p>
        <p class="text-3xl font-bold">{{ serialNo }}</p>
      </div>
      <ul class="bg-grey-50 rounded-xl px-5 py-3 mb-5">
        <li class="flex justify-between py-2 border-b border-grey-100">
          <span class="text-grey-500">院區</span>
          <span class="font-bold">{{ branch }}院區</span>
        </li>
        <li class="flex justify-between py-2 border-b border-grey-100">
          <span class="text-grey-500">科別</span>
          <span class="font-bold">{{ dept }}</span>
        </li>
        <li class="flex justify-between py-2 border-b border-grey-100">
          <span class="text-grey-500">醫師</span>
          <span class="font-bold">{{ selected?.doctor.name }} 醫師</span>
        </li>
        <li class="flex justify-between py-2">
          <span class="text-grey-500">時段</span>
          <span class="font-bold">{{ selected?.time }}</span>
        </li>
      </ul>
      <p class="text-sm text-grey-500 mb-4">看診當日攜帶健保卡，於時段前 15 分鐘報到。</p>
      <BaseButton :outline="true" @click="onResetClick" class="w-full">再掛一筆</BaseButton>
    </div>
  </div>
</template>

<style lang="postcss">
.hospital-registration {
  @apply pt-12 pb-4;

  &__form-group {
    @apply flex flex-col gap-y-1 mb-3;
  }
}

.slot-button {
  @apply px-3 py-2 rounded-lg text-sm;
  @apply bg-white border border-grey-300 text-grey-700;
  @apply transition-colors;

  &--active {
    @apply bg-primary-500 border-primary-500 text-white font-bold;
  }
}
</style>
