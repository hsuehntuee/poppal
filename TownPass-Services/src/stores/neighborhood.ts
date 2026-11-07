import { ref } from 'vue';
import { defineStore } from 'pinia';
import villagesJson from '../../public/mock/neighborhood/villages.json';

export interface Village {
  id: string;
  district: string;
  name: string;
  chief: string;
  tel: string;
  address: string;
  office_hours: string;
  announcements: { id: string; date: string; title: string }[];
  events: { id: string; date: string; time: string; title: string }[];
}

export const useNeighborhoodStore = defineStore('neighborhood', () => {
  /** 行政區選項 */
  const districtOptions = ref(
    villagesJson.districts.map((item) => ({ label: item.name, value: item.id }))
  );

  /** 里列表 */
  const villageList = ref<Village[]>(villagesJson.data);

  /** 目前選擇的行政區 */
  const selectedDistrict = ref('');

  return {
    districtOptions,
    villageList,
    selectedDistrict
  };
});
