import { ref } from 'vue';
import { defineStore } from 'pinia';
import pollsJson from '../../public/mock/ivoting/polls.json';

export interface PollOption {
  id: string;
  name: string;
  percent: number;
}

export interface Poll {
  id: string;
  title: string;
  status: string;
  end_date: string;
  votes: number;
  question: string;
  options: PollOption[];
}

export const useIvotingStore = defineStore('ivoting', () => {
  /** 投票列表 */
  const pollList = ref<Poll[]>(pollsJson.data);

  /** 已投票紀錄 pollId -> optionId */
  const votedMap = ref<Record<string, string>>({});

  const vote = (pollId: string, optionId: string) => {
    votedMap.value[pollId] = optionId;
  };

  return {
    pollList,
    votedMap,
    vote
  };
});
