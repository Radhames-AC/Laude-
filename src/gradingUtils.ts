import { StudentRecord, Session, TeacherSettings, GradingConfig, LetterGradeConfig, HomeworkGradeConfig } from './types';

export const DEFAULT_GRADING_CONFIG: GradingConfig = {
  classwork: { enabled: true, weight: 25, letters: { A: 100, B: 85, C: 75, F: 50 } },
  homework: { enabled: true, weight: 15, statuses: { Completed: 100, Late: 70, Incomplete: 50, NotSubmitted: 0 } },
  participation: { enabled: true, weight: 10 },
  behavior: { enabled: true, weight: 10 },
  quiz: { enabled: true, weight: 40 },
  adjustments: { enabled: true, weight: 10 },
  attendance: { enabled: true, weight: 0 } // Default weight 0 so it doesn't break existing grades unless configured
};

export function getSessionCode(section: string, date: string, sessions: Session[], sessionId: string, settings?: TeacherSettings | null): string {
  // A. Section Code
  let sectionCode = 'XXX';
  if (settings?.sectionCodes?.[section]) {
    sectionCode = settings.sectionCodes[section];
  } else {
    let hash = 0;
    for (let i = 0; i < section.length; i++) {
        hash = ((hash << 5) - hash) + section.charCodeAt(i);
        hash |= 0; 
    }
    sectionCode = ('000' + Math.abs(hash).toString(16).toUpperCase()).slice(-3);
  }

  // B. Date Code
  const parts = date.split('-');
  const dateCode = parts.length === 3 ? `${parts[0].slice(-2)}${parts[1]}${parts[2]}` : '000000';

  const relevantSessions = sessions
    .filter(s => s.date === date && s.topicId && s.topicId !== 'NOT_DEFINED')
    .sort((a, b) => a.id.localeCompare(b.id));

  let index = relevantSessions.findIndex(s => s.id === sessionId);
  if (index === -1) index = 0;
  
  const alpha = String.fromCharCode(65 + (index % 26));
  
  return `${sectionCode}${dateCode}${alpha}`;
}

export function getTotalSessionWeight(settings?: TeacherSettings | null): number {
  const config = settings?.gradingConfig || DEFAULT_GRADING_CONFIG;
  return (config.classwork.enabled ? config.classwork.weight : 0) +
         (config.homework.enabled ? config.homework.weight : 0) +
         (config.participation.enabled ? config.participation.weight : 0) +
         (config.behavior.enabled ? config.behavior.weight : 0) +
         (config.attendance?.enabled ? config.attendance.weight : 0);
}

export function calculateSessionScore(record: StudentRecord | undefined, sessionRecords: StudentRecord[], settings?: TeacherSettings | null): number | null {
  if (!record) return null;
  
  const config = settings?.gradingConfig || DEFAULT_GRADING_CONFIG;
  
  if (!record.present) {
    // If absent and attendance is enabled, score is 0. Otherwise null.
    return config.attendance?.enabled ? 0 : null;
  }
  
  let score = 0;
  let maxPossible = 0;

  // Determine which categories are active for this session
  // A category is active if ANY student in the session has a value for it (teacher graded it)
  const hasClasswork = sessionRecords.some(r => r.classwork !== null && r.classwork !== undefined && r.classwork !== 'N/A');
  const hasParticipation = sessionRecords.some(r => r.participation !== null && r.participation !== undefined);
  const hasBehavior = sessionRecords.some(r => r.behavior !== null && r.behavior !== undefined);
  const hasHomework = sessionRecords.some(r => r.homework !== 'None Assigned' && r.homework !== 'N/A' && r.homework !== undefined);
  const hasAttendance = config.attendance?.enabled;

  if (hasClasswork) {
    maxPossible += config.classwork.weight;
    if (record.classwork !== null && record.classwork !== undefined && record.classwork !== 'N/A') {
      if (typeof record.classwork === 'number') {
        // Legacy numeric classwork (out of 25 usually)
        // Scale it to the new weight just in case
        score += (record.classwork / 25) * config.classwork.weight;
      } else {
        const pct = config.classwork.letters[record.classwork as keyof LetterGradeConfig] || 0;
        score += (pct / 100) * config.classwork.weight;
      }
    } else {
      score += config.classwork.weight;
    }
  }

  if (hasParticipation) {
    maxPossible += config.participation.weight;
    if (record.participation !== null && record.participation !== undefined) {
      // Find max participation in the session
      const maxParticipation = sessionRecords.reduce((max, r) => {
        if (r.present && r.participation !== null && r.participation !== undefined) {
          return Math.max(max, r.participation);
        }
        return max;
      }, 0);

      if (maxParticipation > 0) {
        score += (record.participation / maxParticipation) * config.participation.weight;
      } else {
        score += 0;
      }
    } else {
      score += config.participation.weight;
    }
  }

  if (hasBehavior) {
    maxPossible += config.behavior.weight;
    if (record.behavior !== null && record.behavior !== undefined) {
      // Legacy behavior was out of 10
      score += (record.behavior / 10) * config.behavior.weight;
    } else {
      score += config.behavior.weight;
    }
  }

  if (hasHomework) {
    maxPossible += config.homework.weight;
    if (record.homework && record.homework !== 'None Assigned' && record.homework !== 'N/A') {
      let pct = 0;
      if (record.homework === 'Submitted' || record.homework === 'Completed') pct = config.homework.statuses.Completed;
      else if (record.homework === 'Late') pct = config.homework.statuses.Late;
      else if (record.homework === 'Incompleted' || record.homework === 'Incomplete') pct = config.homework.statuses.Incomplete;
      else if (record.homework === 'Not Submitted') pct = config.homework.statuses.NotSubmitted;
      
      score += (pct / 100) * config.homework.weight;
    } else {
      score += config.homework.weight;
    }
  }

  if (hasAttendance && config.attendance) {
    maxPossible += config.attendance.weight;
    // If present, they get the full attendance weight
    score += config.attendance.weight;
  }

  if (maxPossible === 0) return null;

  // Calculate the total configured weight for session categories
  const totalSessionWeight = getTotalSessionWeight(settings);

  // Scale to the total session weight
  let scaledScore = (score / maxPossible) * totalSessionWeight;
  
  // Adjustments
  const maxAdjustments = config.adjustments.enabled ? config.adjustments.weight : 0;
  const extra = Math.min(record.extraPoints || 0, 10);
  const punishment = Math.min(record.punishment || 0, 10);
  
  scaledScore += (extra / 10) * maxAdjustments;
  scaledScore -= (punishment / 10) * maxAdjustments;
  
  return Math.min(totalSessionWeight + maxAdjustments, Math.max(0, Math.round(scaledScore)));
}

export function calculateQuarterGrade(topicScores: number[], quarterExamScore: number | null, settings?: TeacherSettings | null): number | null {
  const config = settings?.gradingConfig || DEFAULT_GRADING_CONFIG;
  const maxAdjustments = config.adjustments.enabled ? config.adjustments.weight : 0;
  
  const topicAvg = topicScores.length > 0 ? topicScores.reduce((a, b) => a + b, 0) / topicScores.length : null;

  let quarterGrade: number | null = null;

  if (topicAvg !== null && quarterExamScore !== null) {
    // 75% Topic Average + 25% Quarter Exam
    quarterGrade = Math.min(100 + maxAdjustments, Math.round((topicAvg * 0.75) + (quarterExamScore * 0.25)));
  } else if (topicAvg !== null) {
    quarterGrade = Math.min(100 + maxAdjustments, Math.round(topicAvg));
  } else if (quarterExamScore !== null) {
    quarterGrade = Math.min(100 + maxAdjustments, Math.round(quarterExamScore));
  }

  return quarterGrade;
}

export function calculateTopicScore(studentId: string, topicId: string, sessions: Session[], settings?: TeacherSettings | null): number | null {
  const topicSessions = sessions.filter(s => s.topicId === topicId);
  if (topicSessions.length === 0) return null;

  const config = settings?.gradingConfig || DEFAULT_GRADING_CONFIG;

  let totalSessionScore = 0;
  let sessionCount = 0;
  let totalQuizScore = 0;
  let quizCount = 0;

  topicSessions.forEach(session => {
    const record = session.records.find(r => r.studentId === studentId);
    if (record) {
      if (record.present) {
        const sessionScore = calculateSessionScore(record, session.records, settings);
        if (sessionScore !== null) {
          totalSessionScore += sessionScore;
          sessionCount++;
        }
      } else {
        // Absence
        if (config.attendance?.enabled) {
          // If attendance is enabled, absence counts as a 0 for the session
          sessionCount++;
        }
      }

      // Quiz is separate from session average
      const hasQuiz = config.quiz.enabled || session.records.some(r => r.quiz !== undefined && r.quiz !== null);
      if (hasQuiz) {
        const qStatus = record.quizStatus || (record.quiz !== undefined ? 'Graded' : 'None');
        if (qStatus === 'Graded' && record.quiz !== undefined) {
          // Scale quiz to config.quiz.weight (default 40)
          // Assuming raw quiz is out of 100
          totalQuizScore += (record.quiz / 100) * config.quiz.weight;
          quizCount++;
        } else if (qStatus === 'Absent') {
          totalQuizScore += 0;
          quizCount++;
        }
      }
    }
  });

  if (sessionCount > 0 || quizCount > 0) {
    const sessionAvg = sessionCount > 0 ? (totalSessionScore / sessionCount) : 0;
    const quizAvg = quizCount > 0 ? (totalQuizScore / quizCount) : 0;
    
    const totalSessionWeight = getTotalSessionWeight(settings);
      
    const totalTopicWeight = totalSessionWeight + (config.quiz.enabled ? config.quiz.weight : 0);

    let topicScore = 0;
    if (sessionCount > 0 && quizCount > 0) {
      topicScore = sessionAvg + quizAvg;
      // If the weights don't add up to 100, we should probably scale it to 100
      if (totalTopicWeight > 0) {
        topicScore = (topicScore / totalTopicWeight) * 100;
      }
    } else if (sessionCount > 0) {
      topicScore = totalSessionWeight > 0 ? (sessionAvg / totalSessionWeight) * 100 : 0;
    } else {
      topicScore = config.quiz.weight > 0 ? (quizAvg / config.quiz.weight) * 100 : 0;
    }

    const maxAdjustments = config.adjustments.enabled ? config.adjustments.weight : 0;
    return Math.min(100 + maxAdjustments, Math.max(0, Math.round(topicScore)));
  }
  
  return null;
}
