<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import FixedTitleSection from '@/components/molecules/FixedTitleSection.vue';
import BaseInput from '@/components/atoms/BaseInput.vue';
import BaseSelect from '@/components/atoms/BaseSelect.vue';
import BaseButton from '@/components/atoms/BaseButton.vue';
import { useConnectionMessage } from '@/composables/useConnectionMessage';
import { useFamilyCenterStore, type FamilyCenterActivity } from '@/stores/familyCenter';

const route = useRoute();
const store = useFamilyCenterStore();
const { centerList, childAgeOptions } = storeToRefs(store);

const center = computed(() => centerList.value.find((item) => item.id === route.params.id));

/** 正在報名的活動 */
const activeActivity = ref<FamilyCenterActivity | null>(null);

const form = reactive({
  parent_name: '',
  phone: '',
  child_age: ''
});

const triggerValidate = ref(false);
const isSubmitted = ref(false);

const onApplyClick = (activity: FamilyCenterActivity) => {
  activeActivity.value = activity;
  isSubmitted.value = false;
  triggerValidate.value = false;
};

const onSubmitClick = () => {
  triggerValidate.value = true;
  if (form.parent_name && form.phone && form.child_age) {
    isSubmitted.value = true;
  }
};

const onCloseClick = () => {
  activeActivity.value = null;
  isSubmitted.value = false;
  form.parent_name = '';
  form.phone = '';
  form.child_age = '';
  triggerValidate.value = false;
};

const onPhoneCallClick = (phone: string) => {
  useConnectionMessage('phone_call', phone);
};
</script>

<template>
  <div class="family-center-detail">
    <FixedTitleSection :title="center?.name ?? '親子館'" />
    <template v-if="center">
      <!-- 館所資訊 -->
      <section class="px-5 py-5 border-b-8 border-grey-50">
        <div class="flex items-center mb-2">
          <span class="tag">{{ center.district }}</span>
          <h5 class="font-bold text-lg">{{ center.name }}</h5>
        </div>
        <ul class="text-sm text-grey-700">
          <li class="flex items-center py-2 border-b border-grey-50">
            <img src="@/assets/images/location-icon.svg" class="w-5 mr-2" alt="" />
            <span>{{ center.address }}</span>
          </li>
          <li class="flex items-center py-2 border-b border-grey-50">
            <img src="@/assets/images/icon_tel.svg" class="w-5 mr-2" alt="" />
            <a href="javascript:void(0)" class="underline" @click="onPhoneCallClick(center.tel)">
              {{ center.tel }}
            </a>
          </li>
          <li class="flex items-center py-2">
            <img src="@/assets/images/calendar-icon.svg" class="w-5 mr-2" alt="" />
            <span>{{ center.open_time }}</span>
          </li>
        </ul>
      </section>

      <!-- 活動列表 -->
      <section class="px-5 py-5" v-if="!activeActivity">
        <h5 class="font-bold mb-3">近期活動</h5>
        <ul>
          <li
            v-for="activity in center.activities"
            :key="activity.id"
            class="bg-grey-50 rounded-xl px-4 py-3 mb-3 flex items-center justify-between"
          >
            <div>
              <p class="font-bold">{{ activity.name }}</p>
              <p class="text-sm text-grey-500">{{ activity.date }} {{ activity.time }}</p>
              <p class="text-sm" :class="activity.remain ? 'text-primary-500' : 'text-warn-200'">
                剩餘 {{ activity.remain }} / {{ activity.quota }} 名
              </p>
            </div>
            <BaseButton
              :disabled="activity.remain === 0"
              :shape="'rounded'"
              class="!px-5 !py-2 text-sm"
              @click="onApplyClick(activity)"
            >
              報名
            </BaseButton>
          </li>
        </ul>
      </section>

      <!-- 報名表單 -->
      <section class="px-5 py-5" v-else>
        <div class="bg-primary-50 rounded-xl px-4 py-3 mb-4">
          <p class="font-bold">{{ activeActivity.name }}</p>
          <p class="text-sm text-grey-500">{{ activeActivity.date }} {{ activeActivity.time }}</p>
        </div>
        <form v-if="!isSubmitted" @submit.prevent>
          <div class="family-center-detail__form-group">
            <label for="parent_name" class="font-semibold text-grey-700">家長姓名</label>
            <BaseInput
              v-model="form.parent_name"
              id="parent_name"
              label="家長姓名"
              placeholder="輸入姓名"
              :trigger-validate="triggerValidate"
              :required="true"
              class="w-full"
            />
          </div>
          <div class="family-center-detail__form-group">
            <label for="phone" class="font-semibold text-grey-700">聯絡電話</label>
            <BaseInput
              v-model="form.phone"
              id="phone"
              label="聯絡電話"
              placeholder="輸入手機號碼"
              inputmode="tel"
              :trigger-validate="triggerValidate"
              :required="true"
              class="w-full"
            />
          </div>
          <div class="family-center-detail__form-group">
            <label for="child_age" class="font-semibold text-grey-700">小孩年齡</label>
            <BaseSelect
              v-model="form.child_age"
              select-id="child_age"
              :options="childAgeOptions"
              default-selected="選擇年齡"
              :required="true"
              :trigger-validate="triggerValidate"
              class="w-full"
            />
          </div>
          <div class="flex gap-3 mt-4">
            <BaseButton :outline="true" @click="onCloseClick" class="flex-1">取消</BaseButton>
            <BaseButton @click="onSubmitClick" class="flex-1">送出報名</BaseButton>
          </div>
        </form>
        <div v-else>
          <div class="bg-grey-50 rounded-xl p-5 text-center mb-5">
            <img src="@/assets/images/check-icon.svg" class="w-20 mx-auto mb-2" alt="" />
            <h5 class="text-xl font-bold text-primary-500 mb-1">報名完成</h5>
            <p class="text-sm text-grey-500">{{ form.parent_name }}，活動前一日會以簡訊提醒</p>
          </div>
          <BaseButton :outline="true" @click="onCloseClick" class="w-full">返回活動列表</BaseButton>
        </div>
      </section>
    </template>
    <div v-else class="px-5 py-16 text-center text-grey-400">
      <img
        src="@/assets/images/illustrations_no_data.svg"
        class="mx-auto mb-2"
        alt="illustrations_no_data"
      />
      <p>找不到此親子館</p>
    </div>
  </div>
</template>

<style lang="postcss">
.family-center-detail {
  @apply pt-12 pb-4;

  &__form-group {
    @apply flex flex-col gap-y-1 mb-3;
  }

  .tag {
    @apply text-xs text-primary-500 bg-primary-50 rounded-full px-2 py-0.5 mr-2;
  }
}
</style>
