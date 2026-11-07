import { ref } from 'vue';
import { defineStore } from 'pinia';
import zooJson from '../../public/mock/zoo/zoo.json';

export interface ZooArea {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description: string;
}

export interface ZooAnimal {
  id: string;
  name: string;
  area: string;
  origin: string;
  diet: string;
  description: string;
  tips: string;
}

export interface ZooEvent {
  id: string;
  time: string;
  title: string;
  location: string;
}

export const useZooStore = defineStore('zoo', () => {
  /** 園區中心點 */
  const center = ref(zooJson.center);

  /** 館區列表 */
  const areaList = ref<ZooArea[]>(zooJson.areas);

  /** 動物列表 */
  const animalList = ref<ZooAnimal[]>(zooJson.animals);

  /** 今日活動 */
  const eventList = ref<ZooEvent[]>(zooJson.events);

  return {
    center,
    areaList,
    animalList,
    eventList
  };
});
