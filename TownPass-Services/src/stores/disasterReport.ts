import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import disasterReportingJson from '../../public/mock/disaster_reporting.json';

export interface disasterReportData {
  id: string;
  name: string;
  icon: string;
  options: {
    id: string;
    name: string;
    form_format?: Record<string, any>[];
  }[];
}

export const useDisasterReportStore = defineStore('disasterReport', () => {
  const disasterReport = ref<disasterReportData[]>();

  const disasterReportFlat = computed(() => {
    if (!disasterReport.value) {
      return [];
    }

    const flatData = disasterReport.value.reduce<
      { id: string; name: string; form_format?: Record<string, any>[] }[]
    >((acc, current) => {
      return [...acc, ...current.options];
    }, []);

    return flatData;
  });

  const disasterReportMap = computed(
    () => new Map(disasterReportFlat.value.map((item) => [item.id, item]))
  );

  /**
   * 確保資料已載入（表單頁直接開啟、重新整理時使用）
   * 父頁 DisasterReportView 已塞資料時不會重複載入
   */
  const ensureLoaded = async () => {
    if (!disasterReport.value) {
      disasterReport.value = disasterReportingJson.data;
    }
  };

  return { disasterReport, disasterReportMap, ensureLoaded };
});
