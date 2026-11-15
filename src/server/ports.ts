/**
 * Everything the game needs from the outside world, as plain types.
 * index.ts wires the real Devvit platform; tools/dev and the tests wire fakes.
 */

/** The subset of the Devvit Redis client that store.ts uses. */
export type RedisLike = {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, options?: { nx?: boolean }): Promise<string>;
  del(...keys: string[]): Promise<void>;
  incrBy(key: string, value: number): Promise<number>;
  hGet(key: string, field: string): Promise<string | undefined>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hMGet(key: string, fields: string[]): Promise<(string | null)[]>;
  hSet(key: string, fieldValues: Record<string, string>): Promise<number>;
  hSetNX(key: string, field: string, value: string): Promise<number>;
  hIncrBy(key: string, field: string, value: number): Promise<number>;
  hDel(key: string, fields: string[]): Promise<number>;
  zAdd(key: string, ...members: { member: string; score: number }[]): Promise<number>;
  zRange(
    key: string,
    start: number | string,
    stop: number | string,
    options?: { reverse?: boolean; by: 'score' | 'lex' | 'rank' }
  ): Promise<{ member: string; score: number }[]>;
  zRank(key: string, member: string): Promise<number | undefined>;
  zCard(key: string): Promise<number>;
  zRem(key: string, members: string[]): Promise<number>;
};

export type NewPost = { title: string; day: number; dayIndex: number; fallback: string };

/** Every Reddit API call the game makes. Implemented in reddit.ts. */
export type RedditPort = {
  createDailyPost(post: NewPost): Promise<{ postId: string }>;
  /** Post the app's pinned results comment and return its id. */
  createResultsThread(postId: string, text: string): Promise<string>;
  /** Reply on behalf of the player. Only ever called from an explicit tap. */
  replyAsUser(parentId: string, text: string): Promise<{ url: string | null }>;
  setUserFlair(username: string, text: string): Promise<void>;
  subscribeCurrentUser(): Promise<void>;
  postUrl(postId: string): string;
};

/** Who is calling and from which post. */
export type Caller = {
  postId: string | null;
  userId: string | null;
  username: string | null;
  subreddit: string | null;
};

export type Ports = {
  redis: RedisLike;
  reddit: RedditPort;
  now: () => number;
};
