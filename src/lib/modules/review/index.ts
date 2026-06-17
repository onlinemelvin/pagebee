export {
  listComments,
  addComment,
  updateComment,
  deleteComment,
  getCommentScope,
  openChangeRequestCount,
  openChangeRequestCounts,
  compileChangeRequest,
  markResolved,
} from "./service";
export type { CommentAuthor, ReviewCommentDTO } from "./service";
export { createCommentSchema, updateCommentSchema, commentAnchorSchema } from "./schema";
export type { CreateCommentInput, UpdateCommentInput } from "./schema";
