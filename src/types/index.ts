// Discord snowflake as stored in MongoDB: new writes are strings, but docs
// from the legacy Python bot hold int64 (deserialized as BSON Long objects).
// Always compare via String(address).
export type Address = string | number | object;

export interface TopicEntry {
  topic: string;
  topic_id: number;
  address: Address;
}

export interface BoardEntry {
  board: string;
  board_id: number;
  address: Address;
}

export interface FollowingDoc {
  _id?: number;
  user_id: number | string | object;
  following: {
    topics: TopicEntry[];
    boards: BoardEntry[];
  };
}

export interface Destinations {
  channel: Address[];
  dm: Address[];
}

export interface RecentTopic {
  topic: string;
  topic_id: number;
  topic_href: string;
  op_id: number;
  poster_id: number;
  /** Reply count for the topic, i.e. the post offset of its newest post. */
  post: number;
}

export interface ListeningDoc {
  _id?: number;
  topic_id: number;
  topic: string;
  last: number;
  to: Destinations;
}

export interface WatchingDoc {
  _id?: number;
  board_id: number;
  board: string;
  last: number;
  to: Destinations;
}

export interface ServingDoc {
  _id?: number;
  server: string;
  server_id: string | object;
  unrestricting: false | object[];
  serving: boolean;
}

export type ScraperTopicResult = [
  topic: string,
  topic_id: number,
  date: string,
  op_name: string,
  op_id: number,
  op_flair: string,
  op_icon: string,
  op_score: string,
  image: string,
];

export type ScraperBoardResult = [board: string, board_id: number];

export type ScraperResult = ScraperTopicResult | ScraperBoardResult | 404 | 503;

export interface ListenerPostData {
  kind: string;
  msg_href: string;
  response: string;
  topic: string;
  op_name: string;
  op_score: string;
  op_icon: string;
  timestamp: string;
  image: string;
}
