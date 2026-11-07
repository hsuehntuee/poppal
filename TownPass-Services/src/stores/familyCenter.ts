import { ref } from 'vue';
import { defineStore } from 'pinia';
import centersJson from '../../public/mock/family-center/centers.json';

export interface FamilyCenterActivity {
  id: string;
  name: string;
  date: string;
  time: string;
  quota: number;
  remain: number;
}

export interface FamilyCenter {
  id: string;
  name: string;
  district: string;
  address: string;
  tel: string;
  open_time: string;
  activities: FamilyCenterActivity[];
}

export const useFamilyCenterStore = defineStore('family-center', () => {
  /** 親子館列表 */
  const centerList = ref<FamilyCenter[]>(centersJson.data);

  /** 小孩年齡選項 */
  const childAgeOptions = ref(
    centersJson.child_ages.map((item) => ({ label: item.name, value: item.id }))
  );

  return {
    centerList,
    childAgeOptions
  };
});
