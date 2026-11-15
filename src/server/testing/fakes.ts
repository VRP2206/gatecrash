import type { Caller, NewPost, RedditPort, RedisLike } from '../ports';

/** In-memory stand-in for the Devvit Redis client. Used by tests and `npm run dev:local`. */
export const createFakeRedis = (): RedisLike => {
  const strings = new Map<string, string>();
  const hashes = new Map<string, Map<string, string>>();
  const zsets = new Map<string, Map<string, number>>();

  const hash = (key: string): Map<string, string> => {
    let h = hashes.get(key);
    if (!h) {
      h = new Map();
      hashes.set(key, h);
    }
    return h;
  };
  const zset = (key: string): Map<string, number> => {
    let z = zsets.get(key);
    if (!z) {
      z = new Map();
      zsets.set(key, z);
    }
    return z;
  };
  const sorted = (key: string): { member: string; score: number }[] =>
    [...zset(key)]
      .map(([member, score]) => ({ member, score }))
      .sort((a, b) => a.score - b.score || (a.member < b.member ? -1 : 1));

  return {
    async get(key) {
      return strings.get(key);
    },
    async set(key, value, options) {
      if (options?.nx && strings.has(key)) return '';
      strings.set(key, value);
      return 'OK';
    },
    async incrBy(key, value) {
      const next = Number(strings.get(key) ?? '0') + value;
      strings.set(key, String(next));
      return next;
    },
    async hGet(key, field) {
      return hash(key).get(field);
    },
    async hGetAll(key) {
      return Object.fromEntries(hash(key));
    },
    async hMGet(key, fields) {
      return fields.map((f) => hash(key).get(f) ?? null);
    },
    async hSet(key, fieldValues) {
      let added = 0;
      for (const [field, value] of Object.entries(fieldValues)) {
        if (!hash(key).has(field)) added++;
        hash(key).set(field, value);
      }
      return added;
    },
    async hSetNX(key, field, value) {
      if (hash(key).has(field)) return 0;
      hash(key).set(field, value);
      return 1;
    },
    async hIncrBy(key, field, value) {
      const next = Number(hash(key).get(field) ?? '0') + value;
      hash(key).set(field, String(next));
      return next;
    },
    async zAdd(key, ...members) {
      let added = 0;
      for (const { member, score } of members) {
        if (!zset(key).has(member)) added++;
        zset(key).set(member, score);
      }
      return added;
    },
    async zRange(key, start, stop, options) {
      const all = sorted(key);
      if (options?.reverse) all.reverse();
      const from = Number(start);
      const to = Number(stop);
      return all.slice(from, to < 0 ? all.length + to + 1 : to + 1);
    },
    async zRank(key, member) {
      const at = sorted(key).findIndex((m) => m.member === member);
      return at === -1 ? undefined : at;
    },
    async zCard(key) {
      return zset(key).size;
    },
    async zRem(key, members) {
      let removed = 0;
      for (const member of members) if (zset(key).delete(member)) removed++;
      return removed;
    },
  };
};

export type FakeReddit = RedditPort & {
  posts: (NewPost & { postId: string })[];
  comments: { id: string; parentId: string; text: string; as: 'app' | 'user' }[];
  flairs: Map<string, string>;
  subscribed: number;
};

/** Records what the game asked Reddit to do instead of doing it. */
export const createFakeReddit = (): FakeReddit => {
  const fake: FakeReddit = {
    posts: [],
    comments: [],
    flairs: new Map(),
    subscribed: 0,
    async createDailyPost(post) {
      const postId = `t3_fake${fake.posts.length + 1}`;
      fake.posts.push({ ...post, postId });
      return { postId };
    },
    async createResultsThread(postId, text) {
      const id = `t1_fake${fake.comments.length + 1}`;
      fake.comments.push({ id, parentId: postId, text, as: 'app' });
      return id;
    },
    async replyAsUser(parentId, text) {
      const id = `t1_fake${fake.comments.length + 1}`;
      fake.comments.push({ id, parentId, text, as: 'user' });
      return { url: `https://reddit.example/comment/${id}` };
    },
    async setUserFlair(username, text) {
      fake.flairs.set(username, text);
    },
    async subscribeCurrentUser() {
      fake.subscribed++;
    },
    postUrl: (postId) => `https://reddit.example/post/${postId}`,
  };
  return fake;
};

export const caller = (name: string | null, postId: string | null = null): Caller => ({
  postId,
  userId: name ? `t2_${name}` : null,
  username: name,
  subreddit: 'gatecrash_dev',
});
