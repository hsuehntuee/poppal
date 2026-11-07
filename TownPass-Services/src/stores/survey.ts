import { ref } from 'vue';
import { defineStore } from 'pinia';
import surveysJson from '../../public/mock/survey/surveys.json';

export interface SurveyQuestion {
  id: string;
  text: string;
  options: { id: string; name: string }[];
}

export interface Survey {
  id: string;
  title: string;
  end_date: string;
  duration: string;
  questions: SurveyQuestion[];
}

export const useSurveyStore = defineStore('survey', () => {
  /** 問卷列表 */
  const surveyList = ref<Survey[]>(surveysJson.data);

  /** 已填寫的問卷 id */
  const finishedIds = ref<string[]>([]);

  const finish = (id: string) => {
    if (!finishedIds.value.includes(id)) {
      finishedIds.value.push(id);
    }
  };

  return {
    surveyList,
    finishedIds,
    finish
  };
});
