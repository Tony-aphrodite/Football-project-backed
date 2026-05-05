export interface ReportRecord {
  PK:         string;   // LISTING#${listingId}
  SK:         string;   // REPORT#${createdAt}#${reportId}
  entityType: 'Report';
  reportId:   string;
  listingId:  string;
  commentId:  string;
  reporterId: string;
  reason:     string;
  status:     'PENDING' | 'RESOLVED' | 'DISMISSED';
  GSI1PK:     string;
  GSI1SK:     string;
  createdAt:  string;
  updatedAt?: string;
}

export interface ReportWithComment {
  reportId:   string;
  listingId:  string;
  commentId:  string;
  reporterId: string;
  reason:     string;
  createdAt:  string;
  comment: {
    authorId:    string;
    authorName:  string;
    body:        string;
    reportCount: number;
    createdAt:   string;
  } | null;
}
