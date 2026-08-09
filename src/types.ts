export type Cohort = string;
export type Subject = string;
export type Quarter = string;

export interface Student {
  id: string; // e.g., IQ257a01
  firstName: string;
  lastName: string;
  cohort: Cohort;
  period?: string;
}

export type HomeworkStatus = 'Submitted' | 'Completed' | 'Late' | 'Incompleted' | 'Incomplete' | 'Not Submitted' | 'None Assigned' | 'N/A';
export type QuizStatus = 'Graded' | 'Exonerated' | 'Absent' | 'None';

export interface StudentRecord {
  studentId: string;
  present: boolean;
  participation: number | null; // 0, 10
  rawParticipation?: number | null; // The raw count of participations
  classwork: number | 'A' | 'B' | 'C' | 'F' | 'N/A' | null; // 0, 10, 20, 25 or Letters
  homework: HomeworkStatus; // Submitted (15), Late (10), Incompleted (5), Not Submitted (0)
  behavior: number | null; // 0, 10
  quiz?: number; // 0-100, optional
  quizStatus?: QuizStatus;
  extraPoints?: number;
  punishment?: number;
  comments?: {
    attendance?: string;
    participation?: string;
    classwork?: string;
    behavior?: string;
    homework?: string;
    quiz?: string;
    extra?: string;
    general?: string;
  };
  annotation?: string;
  alerts?: string[];
}

export interface Topic {
  id: string;
  title: string;
  quarter: Quarter;
  section: string;
  period?: string;
}

export interface Session {
  id: string; // topicId + "_" + date
  topicId: string;
  date: string; // YYYY-MM-DD
  type?: 'class' | 'quiz' | 'exam';
  records: StudentRecord[];
  period?: string;
  annotation?: string;
  objective?: string;
}

export interface LessonPlanActivity {
  warmUp: string;
  development: string;
  wrapUp: string;
  hw: string;
}

export interface LessonPlan {
  id: string;
  teacher: string;
  section: string;
  date: string;
  subject: string;
  subjectInitial?: string;
  quarter?: string;
  week: string;
  classTime: string;
  classesPerWeek: number;
  chapterUnit: string;
  sectionLesson: string;
  standards: string;
  activities: {
    monday: LessonPlanActivity | null;
    tuesday: LessonPlanActivity | null;
    wednesday: LessonPlanActivity | null;
    thursday: LessonPlanActivity | null;
    friday: LessonPlanActivity | null;
  };
  period?: string;
  teachingSuggestions?: string;
}

export interface Reminder {
  id: string;
  title: string;
  description?: string;
  date: string; // ISO string or just date
  completed: boolean;
  createdAt: number;
  type?: 'reminder' | 'note';
  context?: string;
}

export interface GradingCategory {
  enabled: boolean;
  weight: number;
}

export interface LetterGradeConfig {
  A: number;
  B: number;
  C: number;
  F: number;
}

export interface HomeworkGradeConfig {
  Completed: number;
  Late: number;
  Incomplete: number;
  NotSubmitted: number;
}

export interface GradingConfig {
  classwork: GradingCategory & { letters: LetterGradeConfig };
  homework: GradingCategory & { statuses: HomeworkGradeConfig };
  participation: GradingCategory;
  behavior: GradingCategory;
  quiz: GradingCategory;
  adjustments: GradingCategory;
  attendance?: GradingCategory;
}

export interface Checkpoint {
  id: string; // e.g., 'YYYY-MM-DD'
  timestamp: number;
  data: {
    students: Student[];
    topics: Topic[];
    sessions: Session[];
    lessonPlans: LessonPlan[];
    reminders: Reminder[];
    settings: TeacherSettings | null;
  };
}

export interface TeacherSettings {
  id?: string;
  teacherName?: string;
  schoolYears: string[];
  gradingPeriods: string[];
  sections: string[];
  sectionCodes?: Record<string, string>;
  subjects: string[];
  cohorts?: string[];
  cohortSubjects?: Record<string, string[]>;
  gradingConfig?: GradingConfig;
}

export const DEFAULT_COHORTS: Cohort[] = ['7a', '7b', '8th', '9th'];
export const DEFAULT_QUARTERS: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];

export const COHORT_SUBJECTS: Record<string, string[]> = {
  '7a': ['Language', 'Literature'],
  '7b': ['Language', 'Literature'],
  '8th': ['Language', 'Literature', 'Science'],
  '9th': ['Language', 'Literature'],
};

export const DEFAULT_SECTIONS: string[] = DEFAULT_COHORTS.flatMap((cohort) =>
  COHORT_SUBJECTS[cohort].map((subject) => `${cohort} ${subject}`)
);
