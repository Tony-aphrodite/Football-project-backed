export interface QuizRecord {
  PK: string;
  SK: 'METADATA';
  entityType: 'Quiz';
  quizId: string;
  question: string;
  options: string[];
  correctIndex: number;
  status: 'ACTIVE' | 'CLOSED';
  answerCounts: number[];
  totalAnswers: number;
  createdAt: string;
  expiresAt?: string;
}

export interface QuizAnswerRecord {
  PK: string;
  SK: string;
  entityType: 'QuizAnswer';
  quizId: string;
  userId: string;
  chosenIndex: number;
  correct: boolean;
  answeredAt: string;
}

export interface QuizPublicDto {
  quizId: string;
  question: string;
  options: string[];
  status: 'ACTIVE' | 'CLOSED';
  expiresAt?: string;
  totalAnswers: number;
}

export interface QuizResultDto extends QuizPublicDto {
  correctIndex: number;
  answerCounts: number[];
  userAnswer?: { chosenIndex: number; correct: boolean };
}
