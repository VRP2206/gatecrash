import { context, reddit } from '@devvit/web/server';
import type { RedditPort } from './ports';

/** Board colour shown while the web view loads, so there is no white flash. */
const LOADING_BACKGROUND = '#0C1A14FF';

const asPostId = (id: string): `t3_${string}` => {
  if (!id.startsWith('t3_')) throw new Error(`not a post id: ${id}`);
  return `t3_${id.slice(3)}`;
};

const asCommentId = (id: string): `t1_${string}` => {
  if (!id.startsWith('t1_')) throw new Error(`not a comment id: ${id}`);
  return `t1_${id.slice(3)}`;
};

const postUrl = (postId: string): string =>
  `https://www.reddit.com/r/${context.subredditName}/comments/${postId.replace(/^t3_/, '')}`;

/** Every Reddit API call in Gatecrash lives in this file. */
export const redditPort: RedditPort = {
  async createDailyPost({ title, day, dayIndex, fallback }) {
    const post = await reddit.submitCustomPost({
      title,
      entry: 'default',
      subredditName: context.subredditName,
      postData: { day, dayIndex },
      textFallback: { text: fallback },
      styles: {
        backgroundColor: LOADING_BACKGROUND,
        backgroundColorDark: LOADING_BACKGROUND,
      },
    });
    return { postId: post.id };
  },

  async createResultsThread(postId, text) {
    const comment = await reddit.submitComment({ id: asPostId(postId), text });
    try {
      await comment.distinguish(true);
    } catch (error) {
      // Pinning needs the app to be a moderator; the thread still works unpinned.
      console.warn('could not pin the results thread', error);
    }
    return comment.id;
  },

  async replyAsUser(parentId, text) {
    const comment = await reddit.submitComment({
      id: asCommentId(parentId),
      text,
      runAs: 'USER',
    });
    return { url: comment.permalink ? `https://www.reddit.com${comment.permalink}` : null };
  },

  async setUserFlair(username, text) {
    await reddit.setUserFlair({
      subredditName: context.subredditName,
      username,
      text,
    });
  },

  async subscribeCurrentUser() {
    await reddit.subscribeToCurrentSubreddit();
  },

  postUrl,
};
