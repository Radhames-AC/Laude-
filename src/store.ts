import { collection, doc, getDocs, getDoc, setDoc, writeBatch, deleteDoc, query, where, getDocsFromCache, getDocFromCache } from 'firebase/firestore';
import { db } from './firebase';
import { Student, Session, Topic, LessonPlan, Reminder, TeacherSettings } from './types';

export const fetchTeacherSettings = async (uid: string): Promise<TeacherSettings | null> => {
  const docRef = doc(db, `users/${uid}/settings/general`);
  try {
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      return snapshot.data() as TeacherSettings;
    }
  } catch (e) {
    console.warn("Network error, falling back to cache for settings", e);
    try {
      const snapshot = await getDocFromCache(docRef);
      if (snapshot.exists()) {
        return snapshot.data() as TeacherSettings;
      }
    } catch (cacheError) {
      console.error("Cache miss for settings", cacheError);
    }
  }
  return null;
};

export const saveTeacherSettingsToDb = async (uid: string, settings: TeacherSettings): Promise<void> => {
  await setDoc(doc(db, `users/${uid}/settings/general`), settings);
};

export const fetchStudents = async (uid: string): Promise<Student[]> => {
  const colRef = collection(db, `users/${uid}/students`);
  try {
    const snapshot = await getDocs(colRef);
    return snapshot.docs.map(doc => doc.data() as Student);
  } catch (e) {
    console.warn("Network error, falling back to cache for students", e);
    try {
      const snapshot = await getDocsFromCache(colRef);
      return snapshot.docs.map(doc => doc.data() as Student);
    } catch (cacheError) {
      console.error("Cache miss for students", cacheError);
      return [];
    }
  }
};

export const syncStudents = async (uid: string, students: Student[], period: string): Promise<Student[]> => {
  const yearMatch = period.match(/\d{2}(\d{2})/);
  const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString().slice(-2);
  
  const updatedStudents = [...students].sort((a, b) => 
    a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
  );

  const cohortCounts: Record<string, number> = {};
  const finalStudents = updatedStudents.map(student => {
    if (!cohortCounts[student.cohort]) cohortCounts[student.cohort] = 0;
    cohortCounts[student.cohort]++;
    const orderNum = cohortCounts[student.cohort].toString().padStart(2, '0');
    return { ...student, id: `IQ${year}${student.cohort}${orderNum}`, period };
  });

  const batch = writeBatch(db);
  const colRef = collection(db, `users/${uid}/students`);
  let existing;
  try {
    existing = await getDocs(colRef);
  } catch (e) {
    try {
      existing = await getDocsFromCache(colRef);
    } catch (cacheError) {
      existing = { forEach: () => {} } as any;
    }
  }
  
  existing.forEach((d: any) => {
    const data = d.data() as Student;
    if ((data.period || '2025-2026') === period) {
      batch.delete(d.ref);
    }
  });

  finalStudents.forEach(student => {
    const ref = doc(db, `users/${uid}/students`, student.id);
    batch.set(ref, student);
  });

  await batch.commit();
  return finalStudents;
};

export const deleteStudentFromDb = async (uid: string, studentId: string): Promise<void> => {
  await deleteDoc(doc(db, `users/${uid}/students`, studentId));
};

export const fetchTopics = async (uid: string): Promise<Topic[]> => {
  const colRef = collection(db, `users/${uid}/topics`);
  try {
    const snapshot = await getDocs(colRef);
    return snapshot.docs.map(doc => doc.data() as Topic);
  } catch (e) {
    console.warn("Network error, falling back to cache for topics", e);
    try {
      const snapshot = await getDocsFromCache(colRef);
      return snapshot.docs.map(doc => doc.data() as Topic);
    } catch (cacheError) {
      console.error("Cache miss for topics", cacheError);
      return [];
    }
  }
};

export const saveTopicToDb = async (uid: string, topic: Topic): Promise<void> => {
  await setDoc(doc(db, `users/${uid}/topics`, topic.id), topic);
};

export const deleteTopicFromDb = async (uid: string, topicId: string): Promise<void> => {
  await deleteDoc(doc(db, `users/${uid}/topics`, topicId));
  
  // Also delete all sessions associated with this topic
  const q = query(collection(db, `users/${uid}/sessions`), where("topicId", "==", topicId));
  let snapshot;
  try {
    snapshot = await getDocs(q);
  } catch (e) {
    try {
      snapshot = await getDocsFromCache(q);
    } catch (cacheError) {
      snapshot = { forEach: () => {} } as any;
    }
  }
  const batch = writeBatch(db);
  snapshot.forEach((d: any) => batch.delete(d.ref));
  await batch.commit();
};

export const fetchSessions = async (uid: string): Promise<Session[]> => {
  const colRef = collection(db, `users/${uid}/sessions`);
  try {
    const snapshot = await getDocs(colRef);
    return snapshot.docs.map(doc => doc.data() as Session);
  } catch (e) {
    console.warn("Network error, falling back to cache for sessions", e);
    try {
      const snapshot = await getDocsFromCache(colRef);
      return snapshot.docs.map(doc => doc.data() as Session);
    } catch (cacheError) {
      console.error("Cache miss for sessions", cacheError);
      return [];
    }
  }
};

export const saveSessionToDb = async (uid: string, session: Session): Promise<void> => {
  await setDoc(doc(db, `users/${uid}/sessions`, session.id), session);
};

export const deleteSessionFromDb = async (uid: string, sessionId: string): Promise<void> => {
  await deleteDoc(doc(db, `users/${uid}/sessions`, sessionId));
};

export const fetchLessonPlans = async (uid: string): Promise<LessonPlan[]> => {
  const colRef = collection(db, `users/${uid}/lessonPlans`);
  try {
    const snapshot = await getDocs(colRef);
    return snapshot.docs.map(doc => doc.data() as LessonPlan);
  } catch (e) {
    console.warn("Network error, falling back to cache for lesson plans", e);
    try {
      const snapshot = await getDocsFromCache(colRef);
      return snapshot.docs.map(doc => doc.data() as LessonPlan);
    } catch (cacheError) {
      console.error("Cache miss for lesson plans", cacheError);
      return [];
    }
  }
};

export const saveLessonPlanToDb = async (uid: string, lessonPlan: LessonPlan): Promise<void> => {
  await setDoc(doc(db, `users/${uid}/lessonPlans`, lessonPlan.id), lessonPlan);
};

export const deleteLessonPlanFromDb = async (uid: string, lessonPlanId: string): Promise<void> => {
  await deleteDoc(doc(db, `users/${uid}/lessonPlans`, lessonPlanId));
};

export const fetchReminders = async (uid: string): Promise<Reminder[]> => {
  const colRef = collection(db, `users/${uid}/reminders`);
  try {
    const snapshot = await getDocs(colRef);
    return snapshot.docs.map(doc => doc.data() as Reminder);
  } catch (e) {
    console.warn("Network error, falling back to cache for reminders", e);
    try {
      const snapshot = await getDocsFromCache(colRef);
      return snapshot.docs.map(doc => doc.data() as Reminder);
    } catch (cacheError) {
      console.error("Cache miss for reminders", cacheError);
      return [];
    }
  }
};

export const saveReminderToDb = async (uid: string, reminder: Reminder): Promise<void> => {
  await setDoc(doc(db, `users/${uid}/reminders`, reminder.id), reminder);
};

export const deleteReminderFromDb = async (uid: string, reminderId: string): Promise<void> => {
  await deleteDoc(doc(db, `users/${uid}/reminders`, reminderId));
};

export const fetchCheckpoints = async (uid: string): Promise<any[]> => {
  const colRef = collection(db, `users/${uid}/checkpoints`);
  try {
    const snapshot = await getDocs(colRef);
    return snapshot.docs.map(doc => doc.data());
  } catch (e) {
    console.error("Error fetching checkpoints", e);
    return [];
  }
};

export const saveCheckpointToDb = async (uid: string, checkpoint: any): Promise<void> => {
  await setDoc(doc(db, `users/${uid}/checkpoints`, checkpoint.id), checkpoint);
};

export const deleteCheckpointFromDb = async (uid: string, checkpointId: string): Promise<void> => {
  await deleteDoc(doc(db, `users/${uid}/checkpoints`, checkpointId));
};

