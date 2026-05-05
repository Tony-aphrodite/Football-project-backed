export interface CommentRecord {
  PK: string;          // LISTING#${listingId}
  SK: string;          // COMMENT#${createdAt}#${commentId}
  entityType: 'Comment';
  commentId:  string;
  listingId:  string;
  authorId:   string;
  authorName: string;
  body:       string;
  status:     'ACTIVE' | 'REMOVED';
  reportCount: number;
  createdAt:  string;
  updatedAt:  string;
}

export interface CommentPublic {
  commentId:  string;
  listingId:  string;
  authorId:   string;
  authorName: string;
  body:       string;
  status:     'ACTIVE' | 'REMOVED';
  reportCount: number;
  createdAt:  string;
}

export function toCommentPublic(c: CommentRecord): CommentPublic {
  return {
    commentId:   c.commentId,
    listingId:   c.listingId,
    authorId:    c.authorId,
    authorName:  c.authorName,
    body:        c.body,
    status:      c.status,
    reportCount: c.reportCount,
    createdAt:   c.createdAt,
  };
}
