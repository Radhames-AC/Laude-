import React, { useState, useEffect } from 'react';
import { Users, CalendarCheck, BarChart3, Menu, X, LogOut, Loader2, Database, LayoutDashboard, ArrowLeft, Settings as SettingsIcon, Plus, Download } from 'lucide-react';
import { Student, Topic, Session, LessonPlan, Reminder, TeacherSettings, DEFAULT_QUARTERS, DEFAULT_SECTIONS } from './types';
import { fetchStudents, syncStudents, fetchTopics, saveTopicToDb, fetchSessions, saveSessionToDb, deleteStudentFromDb, deleteTopicFromDb, deleteSessionFromDb, fetchLessonPlans, saveLessonPlanToDb, deleteLessonPlanFromDb, fetchReminders, saveReminderToDb, deleteReminderFromDb, fetchTeacherSettings, saveTeacherSettingsToDb, fetchCheckpoints, saveCheckpointToDb, deleteCheckpointFromDb } from './store';
import { auth, googleProvider } from './firebase';
import { signInWithPopup, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { DEFAULT_GRADING_CONFIG } from './gradingUtils';
import TrackerTab from './components/TrackerTab';
import AnalyticsTab from './components/AnalyticsTab';
import SettingsTab from './components/SettingsTab';
import DashboardTab from './components/DashboardTab';
import LessonPlannerTab from './components/LessonPlannerTab';
import ReminderModal from './components/ReminderModal';
import ThumbScroll from './components/ThumbScroll';
import Logo from './components/Logo';
import WelcomeAnimation from './components/WelcomeAnimation';
import InstallModal from './components/InstallModal';

type Tab = 'dashboard' | 'tracker' | 'analytics' | 'settings' | 'planner';

export const logEvent = (type: string, message: string, details?: any) => {
  try {
    const events = JSON.parse(localStorage.getItem('app_events_log') || '[]');
    events.push({
      type,
      message,
      details,
      timestamp: new Date().toISOString()
    });
    localStorage.setItem('app_events_log', JSON.stringify(events));
  } catch (e) {
    console.error('Failed to log event', e);
  }
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);

  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [tabHistory, setTabHistory] = useState<Tab[]>([]);
  const [initialStudentId, setInitialStudentId] = useState<string | null>(null);
  const [initialSessionId, setInitialSessionId] = useState<string | null>(null);
  const [initialMode, setInitialMode] = useState<string | null>(null);
  const [internalBackHandler, setInternalBackHandler] = useState<(() => void) | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [lessonPlans, setLessonPlans] = useState<LessonPlan[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [settings, setSettings] = useState<TeacherSettings | null>(null);
  
  const [activePeriod, setActivePeriod] = useState<string>('2025-2026');
  
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isHeaderShrunk, setIsHeaderShrunk] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      // Only shrink header on mobile/tablet (when it's a topbar)
      if (window.innerWidth < 768) {
        setIsHeaderShrunk(window.scrollY > 20);
      } else {
        setIsHeaderShrunk(false);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoadingAuth(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (user?.uid) {
      loadData(user.uid);
    } else if (!user) {
      setStudents([]);
      setTopics([]);
      setSessions([]);
      setLessonPlans([]);
      setReminders([]);
      setSettings(null);
    }
  }, [user?.uid]);

  const loadData = async (uid: string) => {
    setLoadingData(true);
    try {
      const [s, t, sess, lp, r, fetchedSettings] = await Promise.all([
        fetchStudents(uid),
        fetchTopics(uid),
        fetchSessions(uid),
        fetchLessonPlans(uid),
        fetchReminders(uid),
        fetchTeacherSettings(uid)
      ]);
      setStudents(s);
      setTopics(t);
      setSessions(sess);
      setLessonPlans(lp);
      setReminders(r);

      // Extract unique periods
      const periods = new Set<string>();
      s.forEach(student => periods.add(student.period || '2025-2026'));
      t.forEach(topic => periods.add(topic.period || '2025-2026'));
      
      let currentSettings = fetchedSettings;

      // Silent Migration for existing users without settings
      if (!currentSettings && (s.length > 0 || t.length > 0 || sess.length > 0)) {
        const extractedQuarters = new Set<string>();
        const extractedSections = new Set<string>();
        const extractedSubjects = new Set<string>();
        
        t.forEach(topic => {
          if (topic.quarter) extractedQuarters.add(topic.quarter);
          if (topic.section) extractedSections.add(topic.section);
        });
        
        lp.forEach(plan => {
          if (plan.subject) extractedSubjects.add(plan.subject);
          if (plan.section) extractedSections.add(plan.section);
        });

        const migratedSettings: TeacherSettings = {
          teacherName: auth.currentUser?.displayName || 'Teacher',
          schoolYears: periods.size > 0 ? Array.from(periods).sort().reverse() : ['2025-2026'],
          gradingPeriods: extractedQuarters.size > 0 ? Array.from(extractedQuarters).sort() : DEFAULT_QUARTERS,
          sections: extractedSections.size > 0 ? Array.from(extractedSections).sort() : DEFAULT_SECTIONS,
          subjects: extractedSubjects.size > 0 ? Array.from(extractedSubjects).sort() : [],
          gradingConfig: DEFAULT_GRADING_CONFIG
        };
        
        await saveTeacherSettingsToDb(uid, migratedSettings);
        currentSettings = migratedSettings;
      } else if (currentSettings && (!currentSettings.gradingConfig || !currentSettings.teacherName)) {
        // Migrate existing settings to include gradingConfig and teacherName
        if (!currentSettings.gradingConfig) currentSettings.gradingConfig = DEFAULT_GRADING_CONFIG;
        if (!currentSettings.teacherName) currentSettings.teacherName = auth.currentUser?.displayName || 'Teacher';
        await saveTeacherSettingsToDb(uid, currentSettings);
      }

      setSettings(currentSettings);

      if (currentSettings?.schoolYears?.length) {
        setActivePeriod(currentSettings.schoolYears[0]);
      } else if (periods.size > 0) {
        setActivePeriod(Array.from(periods).sort().reverse()[0]);
      }

      // Checkpoint logic
      setTimeout(async () => {
        try {
          const today = new Date().toISOString().split('T')[0];
          const checkpoints = await fetchCheckpoints(uid);
          const hasTodayCheckpoint = checkpoints.some(c => c.id === today);
          
          if (!hasTodayCheckpoint) {
            const newCheckpoint = {
              id: today,
              timestamp: Date.now(),
              data: {
                students: s,
                topics: t,
                sessions: sess,
                lessonPlans: lp,
                reminders: r,
                settings: currentSettings
              }
            };
            await saveCheckpointToDb(uid, newCheckpoint);
          }

          // Cleanup old checkpoints (older than 14 days)
          const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
          for (const cp of checkpoints) {
            if (cp.timestamp < fourteenDaysAgo) {
              await deleteCheckpointFromDb(uid, cp.id);
            }
          }
        } catch (err) {
          console.error("Error managing checkpoints", err);
        }
      }, 2000); // Delay to not block UI

    } catch (e) {
      console.error(e);
      showToast('Error loading data from cloud');
    } finally {
      setLoadingData(false);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Error signing in with Google", error);
      showToast('Error signing in');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  const handleSaveStudents = async (newStudents: Student[]) => {
    if (!user) return;
    try {
      const saved = await syncStudents(user.uid, newStudents, activePeriod);
      
      // Merge saved students with students from other periods
      const otherStudents = students.filter(s => (s.period || '2025-2026') !== activePeriod);
      setStudents([...otherStudents, ...saved]);
      logEvent('Students Saved', `Saved ${newStudents.length} students for period ${activePeriod}`);
      showToast('Students saved successfully!');
    } catch (e) {
      console.error(e);
      logEvent('Error', `Failed to save students`, e);
      showToast('Error saving students');
    }
  };

  const handleSaveTopic = async (topic: Topic) => {
    if (!user) return;
    try {
      setTopics(prev => {
        const idx = prev.findIndex(t => t.id === topic.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = topic;
          return next;
        }
        return [...prev, topic];
      });
      logEvent('Topic Saved', `Topic ${topic.id} saved`, topic);
      showToast('Topic created successfully!');
      saveTopicToDb(user.uid, topic).catch(error => {
        console.error("Background topic save error:", error);
      });
    } catch (e) {
      console.error(e);
      logEvent('Error', `Failed to update topic state`, e);
      showToast('Error saving topic');
    }
  };

  const handleSaveSession = async (session: Session) => {
    if (!user) return;
    try {
      setSessions(prev => {
        const idx = prev.findIndex(s => s.id === session.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = session;
          return next;
        }
        return [...prev, session];
      });
      logEvent('Session Saved', `Session ${session.id} saved for topic ${session.topicId}`, session);
      showToast('Session saved successfully!');
      saveSessionToDb(user.uid, session).catch(error => {
        console.error("Background session save error:", error);
      });
    } catch (e) {
      console.error(e);
      logEvent('Error', `Failed to update session state`, e);
      showToast('Error saving session');
      throw e;
    }
  };

  const handleSaveLessonPlan = async (lessonPlan: LessonPlan, silent: boolean = false) => {
    if (!user) return;
    try {
      setLessonPlans(prev => {
        const idx = prev.findIndex(lp => lp.id === lessonPlan.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = lessonPlan;
          return next;
        }
        return [...prev, lessonPlan];
      });
      if (!silent) {
        logEvent('Lesson Plan Saved', `Lesson Plan ${lessonPlan.id} saved`, lessonPlan);
        showToast('Lesson plan saved successfully!');
      }
      saveLessonPlanToDb(user.uid, lessonPlan).catch(error => {
        console.error("Background lesson plan save error:", error);
      });
    } catch (e) {
      console.error(e);
      if (!silent) {
        logEvent('Error', `Failed to update lesson plan state`, e);
        showToast('Error saving lesson plan');
      }
    }
  };

  const handleDeleteLessonPlan = async (lessonPlanId: string) => {
    if (!user) return;
    try {
      setLessonPlans(prev => prev.filter(lp => lp.id !== lessonPlanId));
      logEvent('Lesson Plan Deleted', `Lesson Plan ${lessonPlanId} deleted`);
      showToast('Lesson plan deleted successfully!');
      deleteLessonPlanFromDb(user.uid, lessonPlanId).catch(error => {
        console.error("Background lesson plan delete error:", error);
      });
    } catch (e) {
      console.error(e);
      logEvent('Error', `Failed to update lesson plan state`, e);
      showToast('Error deleting lesson plan');
    }
  };

  const handleDeleteStudent = async (studentId: string) => {
    if (!user) return;
    try {
      // Remove from students array and sync
      const updatedStudents = students.filter(s => s.id !== studentId);
      const activePeriodStudents = updatedStudents.filter(s => (s.period || '2025-2026') === activePeriod);
      const saved = await syncStudents(user.uid, activePeriodStudents, activePeriod);
      
      const otherStudents = updatedStudents.filter(s => (s.period || '2025-2026') !== activePeriod);
      setStudents([...otherStudents, ...saved]);
      logEvent('Student Deleted', `Student ${studentId} deleted`);
      showToast('Student deleted successfully!');
    } catch (e) {
      console.error(e);
      logEvent('Error', `Failed to delete student ${studentId}`, e);
      showToast('Error deleting student');
    }
  };

  const handleDeleteTopic = async (topicId: string) => {
    if (!user) return;
    try {
      setTopics(prev => prev.filter(t => t.id !== topicId));
      setSessions(prev => prev.filter(s => s.topicId !== topicId));
      logEvent('Topic Deleted', `Topic ${topicId} deleted`);
      showToast('Topic and related sessions deleted successfully!');
      deleteTopicFromDb(user.uid, topicId).catch(error => console.error("Background topic delete error:", error));
    } catch (e) {
      console.error(e);
      logEvent('Error', `Failed to update topic state`, e);
      showToast('Error deleting topic');
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!user) return;
    try {
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      logEvent('Session Deleted', `Session ${sessionId} deleted`);
      showToast('Session deleted successfully!');
      deleteSessionFromDb(user.uid, sessionId).catch(error => console.error("Background session delete error:", error));
    } catch (e) {
      console.error(e);
      logEvent('Error', `Failed to update session state`, e);
      showToast('Error deleting session');
    }
  };

  const handleRemoveStudentFromTopic = async (topicId: string, studentId: string) => {
    if (!user) return;
    try {
      const topicSessions = sessions.filter(s => s.topicId === topicId);
      const updatedSessions: Session[] = [];
      
      for (const session of topicSessions) {
        if (session.records.some(r => r.studentId === studentId)) {
          const updatedSession = {
            ...session,
            records: session.records.filter(r => r.studentId !== studentId)
          };
          updatedSessions.push(updatedSession);
          saveSessionToDb(user.uid, updatedSession).catch(console.error);
        }
      }

      setSessions(prev => prev.map(s => {
        const updated = updatedSessions.find(us => us.id === s.id);
        return updated ? updated : s;
      }));
      
      logEvent('Student Removed', `Student ${studentId} removed from topic ${topicId}`);
      showToast('Student removed from topic successfully!');
    } catch (e) {
      console.error(e);
      logEvent('Error', `Failed to remove student ${studentId} from topic ${topicId}`, e);
      showToast('Error removing student from topic');
    }
  };

  const handleRemoveStudentFromSession = async (sessionId: string, studentId: string) => {
    if (!user) return;
    try {
      const session = sessions.find(s => s.id === sessionId);
      if (!session) return;
      
      const updatedSession = {
        ...session,
        records: session.records.filter(r => r.studentId !== studentId)
      };
      
      setSessions(prev => prev.map(s => s.id === sessionId ? updatedSession : s));
      logEvent('Student Removed', `Student ${studentId} removed from session ${sessionId}`);
      showToast('Student removed from session successfully!');
      saveSessionToDb(user.uid, updatedSession).catch(console.error);
    } catch (e) {
      console.error(e);
      logEvent('Error', `Failed to remove student ${studentId} from session ${sessionId}`, e);
      showToast('Error removing student from session');
    }
  };

  const handleSaveReminder = async (reminder: Reminder) => {
    if (!user) return;
    try {
      setReminders(prev => {
        const existing = prev.findIndex(r => r.id === reminder.id);
        if (existing >= 0) {
          const newReminders = [...prev];
          newReminders[existing] = reminder;
          return newReminders;
        }
        return [...prev, reminder];
      });
      logEvent('Reminder Saved', `Reminder ${reminder.id} saved`, reminder);
      showToast('Reminder saved successfully!');
      saveReminderToDb(user.uid, reminder).catch(console.error);
    } catch (e) {
      console.error(e);
      logEvent('Error', `Failed to update reminder state`, e);
      showToast('Error saving reminder');
    }
  };

  const handleSaveSettings = async (newSettings: TeacherSettings) => {
    if (!user) return;
    try {
      setSettings(newSettings);
      if (newSettings.schoolYears.length > 0 && !newSettings.schoolYears.includes(activePeriod)) {
        setActivePeriod(newSettings.schoolYears[0]);
      }
      logEvent('Settings Saved', `Settings saved`, newSettings);
      showToast('Settings saved successfully!');
      saveTeacherSettingsToDb(user.uid, newSettings).catch(console.error);
    } catch (e) {
      console.error(e);
      logEvent('Error', `Failed to update settings state`, e);
      showToast('Error saving settings');
    }
  };

  const handleDeleteReminder = async (id: string) => {
    if (!user) return;
    try {
      setReminders(prev => prev.filter(r => r.id !== id));
      logEvent('Reminder Deleted', `Reminder ${id} deleted`);
      showToast('Reminder deleted successfully!');
      deleteReminderFromDb(user.uid, id).catch(console.error);
    } catch (e) {
      console.error(e);
      logEvent('Error', `Failed to delete reminder state`, e);
      showToast('Error deleting reminder');
    }
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleRestoreCheckpoint = async (checkpointId: string) => {
    if (!user) return;
    try {
      setLoadingData(true);
      const checkpoints = await fetchCheckpoints(user.uid);
      const cp = checkpoints.find(c => c.id === checkpointId);
      if (!cp) {
        showToast('Checkpoint not found');
        setLoadingData(false);
        return;
      }

      const data = cp.data;
      
      // Delete current data
      for (const s of students) await deleteStudentFromDb(user.uid, s.id);
      for (const t of topics) await deleteTopicFromDb(user.uid, t.id);
      for (const s of sessions) await deleteSessionFromDb(user.uid, s.id);
      for (const lp of lessonPlans) await deleteLessonPlanFromDb(user.uid, lp.id);
      for (const r of reminders) await deleteReminderFromDb(user.uid, r.id);

      // Save checkpoint data
      if (data.students) {
        // Group students by period and sync each period
        const periods = new Set(data.students.map((s: Student) => s.period || '2025-2026'));
        for (const period of periods) {
          const periodStudents = data.students.filter((s: Student) => (s.period || '2025-2026') === period);
          await syncStudents(user.uid, periodStudents, period as string);
        }
      }
      if (data.topics) for (const t of data.topics) await saveTopicToDb(user.uid, t);
      if (data.sessions) for (const s of data.sessions) await saveSessionToDb(user.uid, s);
      if (data.lessonPlans) for (const lp of data.lessonPlans) await saveLessonPlanToDb(user.uid, lp);
      if (data.reminders) for (const r of data.reminders) await saveReminderToDb(user.uid, r);
      if (data.settings) await saveTeacherSettingsToDb(user.uid, data.settings);

      await loadData(user.uid);
      showToast('Data restored successfully!');
    } catch (e) {
      console.error(e);
      showToast('Error restoring data');
      setLoadingData(false);
    }
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'tracker', label: 'Record Log', icon: CalendarCheck },
    { id: 'planner', label: 'Lesson Planner', icon: CalendarCheck },
    { id: 'analytics', label: 'Record Book', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ] as const;

  const tabOrder = tabs.map(t => t.id);

  const handleNavigate = (tab: Tab, studentId?: string, sessionId?: string, mode?: string) => {
    setTabHistory(prev => [...prev, activeTab]);
    setActiveTab(tab);
    if (studentId) {
      setInitialStudentId(studentId);
    } else {
      setInitialStudentId(null);
    }
    if (sessionId) {
      setInitialSessionId(sessionId);
    } else {
      setInitialSessionId(null);
    }
    if (mode) {
      setInitialMode(mode);
    } else {
      setInitialMode(null);
    }
  };

  const handleBack = () => {
    if (internalBackHandler) {
      internalBackHandler();
    } else if (tabHistory.length > 0) {
      const prevTab = tabHistory[tabHistory.length - 1];
      setTabHistory(prev => prev.slice(0, -1));
      setActiveTab(prevTab);
      setInitialStudentId(null);
      setInitialSessionId(null);
      setInitialMode(null);
    }
  };

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-600" size={48} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-teal-50 flex items-center justify-center p-4 font-sans">
        <div className="bg-white/60 backdrop-blur-lg p-8 rounded-2xl shadow-xl shadow-slate-200/50 border border-white/50 max-w-md w-full text-center">
          <div className="flex justify-center mb-6">
            <Logo className="w-20 h-20" />
          </div>
          <h1 className="text-3xl font-bold text-indigo-950 mb-2 tracking-tight"><span translate="no" className="notranslate">Teacher's app</span></h1>
          <p className="text-slate-600 mb-8">Sign in to manage your rosters, record daily performance, and view analytics.</p>
          <div className="mb-4 text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Cloud Edition v2.0</div>
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-white/80 backdrop-blur-md border border-white/50 text-slate-800 rounded-xl hover:bg-white hover:shadow-md transition-all font-medium shadow-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  const allPeriods = settings?.schoolYears?.length 
    ? settings.schoolYears 
    : Array.from(new Set([
        ...students.map(s => s.period || '2025-2026'),
        ...topics.map(t => t.period || '2025-2026')
      ])).sort().reverse();
  if (allPeriods.length === 0) allPeriods.push('2025-2026');

  const isNewUser = !settings && students.length === 0 && topics.length === 0;

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-br from-slate-100 via-blue-50 to-teal-50 font-sans flex flex-col md:flex-row">
      {showWelcome && <WelcomeAnimation onComplete={() => { setShowWelcome(false); setShowInstallModal(true); }} />}
      
      {showInstallModal && !showWelcome && (
        <InstallModal 
          deferredPrompt={deferredPrompt} 
          onClose={() => setShowInstallModal(false)} 
        />
      )}
      
      {/* Sidebar (Desktop) / Topbar (Mobile) */}
      <nav className={`bg-white/60 backdrop-blur-lg border-r border-white/50 md:w-64 flex-shrink-0 flex flex-col shadow-lg shadow-slate-200/50 z-40 md:h-full sticky top-0 md:relative w-full transition-all duration-300`}>
        <div className={`border-b border-white/50 flex flex-col transition-all duration-300 ${isHeaderShrunk ? 'p-3' : 'p-6'}`}>
          <div className="flex justify-between items-center w-full">
            <div className="flex items-center gap-3">
              {(tabHistory.length > 0 || internalBackHandler) && (
                <button 
                  onClick={handleBack}
                  className="p-1.5 bg-white/60 hover:bg-white rounded-full shadow-sm border border-white/50 text-slate-600 transition-all shrink-0"
                  title="Go Back"
                >
                  <ArrowLeft size={isHeaderShrunk ? 18 : 20} />
                </button>
              )}
              <div 
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => handleNavigate('dashboard')}
              >
                <Logo className={`transition-all duration-300 ${isHeaderShrunk ? 'w-6 h-6' : 'w-8 h-8'}`} />
                <h1 className={`font-bold text-indigo-950 tracking-tight transition-all duration-300 ${isHeaderShrunk ? 'text-lg' : 'text-xl'}`}><span translate="no" className="notranslate">Teacher's app</span></h1>
              </div>
            </div>
            <button 
              className={`md:hidden text-slate-500 hover:bg-white/50 rounded-lg transition-colors ${isHeaderShrunk ? 'p-1' : 'p-2'}`}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X size={isHeaderShrunk ? 20 : 24} /> : <Menu size={isHeaderShrunk ? 20 : 24} />}
            </button>
          </div>
          {/* Target for extra header content extending the topbar on mobile */}
          <div id="mobile-header-extension" className="empty:hidden mt-2 border-t border-slate-200/50 pt-2 w-full md:hidden transition-all duration-300"></div>
        </div>
        
        <div className={`flex flex-col transition-all duration-300 ease-in-out overflow-hidden md:flex-1 ${isMobileMenuOpen ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0 md:max-h-none md:opacity-100'}`}>
          <div className="p-4 border-b border-white/50 shrink-0">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Teaching Period</label>
            <select 
              value={activePeriod} 
              onChange={(e) => {
                if (e.target.value === 'NEW') {
                  const newPeriod = prompt('Enter new teaching period (e.g., 2026-2027):');
                  if (newPeriod && newPeriod.trim()) {
                    setActivePeriod(newPeriod.trim());
                  }
                } else {
                  setActivePeriod(e.target.value);
                }
              }}
              className="w-full px-3 py-2 bg-white/50 border border-white/50 rounded-lg text-sm text-indigo-950 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {!allPeriods.includes(activePeriod) && <option value={activePeriod}>{activePeriod}</option>}
              {allPeriods.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
              <option value="NEW" className="font-semibold text-indigo-600">+ Add new ...</option>
            </select>
          </div>

          <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    handleNavigate(tab.id as Tab);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium text-sm border
                    ${isActive 
                      ? 'bg-white/80 text-indigo-900 shadow-sm border-white/50' 
                      : 'border-transparent text-slate-600 hover:bg-white/40 hover:text-indigo-950'
                    }
                  `}
                >
                  <Icon size={20} className={isActive ? 'text-indigo-600' : 'text-slate-400'} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="p-4 border-t border-white/50 shrink-0">
            <div className="flex items-center gap-3 px-4 py-3 mb-2">
              <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.email}`} alt="User" className="w-8 h-8 rounded-full shadow-sm" referrerPolicy="no-referrer" />
              <div className="overflow-hidden">
                <p className="text-sm font-medium text-indigo-950 truncate">{user.displayName || 'Teacher'}</p>
                <p className="text-xs text-slate-500 truncate">{user.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2 text-rose-600 hover:bg-rose-50/50 rounded-xl transition-colors font-medium text-sm"
            >
              <LogOut size={18} /> Sign Out
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main id="main-scroll-area" className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-10 relative min-w-0">
        {loadingData && (
          <div className="absolute inset-0 bg-white/30 backdrop-blur-sm z-20 flex items-center justify-center">
            <Loader2 className="animate-spin text-indigo-600" size={48} />
          </div>
        )}
        
        <div className="max-w-6xl mx-auto w-full">
          <header className="mb-8 flex items-center gap-4">
            <div>
              <h2 className="text-3xl font-bold text-indigo-950 tracking-tight">
                {tabs.find(t => t.id === activeTab)?.label}
              </h2>
              <p className="text-slate-600 mt-2">
                {activeTab === 'dashboard' && 'Overview of your classes and student performance.'}
                {activeTab === 'tracker' && 'Record daily attendance, participation, and grades.'}
                {activeTab === 'analytics' && 'View historical performance and export data.'}
                {activeTab === 'settings' && 'Manage platform settings, student roster, and data.'}
              </p>
            </div>
          </header>

          {activeTab === 'dashboard' && (
            <DashboardTab 
              students={students.filter(s => (s.period || '2025-2026') === activePeriod)} 
              topics={topics.filter(t => (t.period || '2025-2026') === activePeriod)} 
              sessions={sessions.filter(s => (s.period || '2025-2026') === activePeriod)} 
              reminders={reminders}
              onSaveReminder={handleSaveReminder}
              onDeleteReminder={handleDeleteReminder}
              onNavigate={handleNavigate} 
              settings={settings}
              onSaveSettings={handleSaveSettings}
              isNewUser={isNewUser}
            />
          )}
          {activeTab === 'tracker' && (
            <TrackerTab 
              students={students.filter(s => (s.period || '2025-2026') === activePeriod)} 
              topics={topics.filter(t => (t.period || '2025-2026') === activePeriod)} 
              sessions={sessions.filter(s => (s.period || '2025-2026') === activePeriod)} 
              lessonPlans={lessonPlans.filter(lp => (lp.period || '2025-2026') === activePeriod)}
              onSaveTopic={handleSaveTopic} 
              onSaveSession={handleSaveSession} 
              onDeleteSession={handleDeleteSession}
              onDeleteTopic={handleDeleteTopic}
              showToast={showToast} 
              activePeriod={activePeriod}
              initialSessionId={initialSessionId}
              initialStudentId={initialStudentId}
              initialMode={initialMode as any}
              settings={settings}
              onNavigate={handleNavigate}
            />
          )}
          {activeTab === 'planner' && (
            <LessonPlannerTab 
              topics={topics.filter(t => (t.period || '2025-2026') === activePeriod)} 
              lessonPlans={lessonPlans.filter(lp => (lp.period || '2025-2026') === activePeriod)} 
              onSaveLessonPlan={handleSaveLessonPlan} 
              onDeleteLessonPlan={handleDeleteLessonPlan} 
              onDeleteTopic={handleDeleteTopic}
              activePeriod={activePeriod}
              onInternalBackChange={setInternalBackHandler}
              settings={settings}
            />
          )}
          {activeTab === 'analytics' && (
            <AnalyticsTab 
              students={students.filter(s => (s.period || '2025-2026') === activePeriod)} 
              topics={topics.filter(t => (t.period || '2025-2026') === activePeriod)} 
              sessions={sessions.filter(s => (s.period || '2025-2026') === activePeriod)} 
              reminders={reminders}
              onSaveReminder={handleSaveReminder}
              onDeleteReminder={handleDeleteReminder}
              onNavigate={handleNavigate}
              initialStudentId={initialStudentId}
              initialMode={initialMode}
              allPeriods={allPeriods}
              activePeriod={activePeriod}
              setActivePeriod={setActivePeriod}
              onInternalBackChange={setInternalBackHandler}
              settings={settings}
              onDeleteTopic={handleDeleteTopic}
              onDeleteSession={handleDeleteSession}
              onRemoveStudentFromSession={handleRemoveStudentFromSession}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsTab 
              students={students.filter(s => (s.period || '2025-2026') === activePeriod)} 
              topics={topics.filter(t => (t.period || '2025-2026') === activePeriod)} 
              sessions={sessions.filter(s => (s.period || '2025-2026') === activePeriod)}
              onSaveStudents={handleSaveStudents}
              onDeleteStudent={handleDeleteStudent}
              onDeleteTopic={handleDeleteTopic}
              onDeleteSession={handleDeleteSession}
              onRemoveStudentFromTopic={handleRemoveStudentFromTopic}
              onRemoveStudentFromSession={handleRemoveStudentFromSession}
              showToast={showToast}
              settings={settings}
              onSaveSettings={handleSaveSettings}
              onRestoreCheckpoint={handleRestoreCheckpoint}
            />
          )}
        </div>
        
        <footer className="mt-12 text-center text-xs text-slate-400 py-4 border-t border-slate-200/50 flex flex-col items-center justify-center space-y-4">
          <span>Copyright ©️ 2026 Mr. Alvarez All Rights Reserved.</span>
        </footer>
      </main>

      <ThumbScroll targetId="main-scroll-area" />

      {/* Floating Navigation Button */}
      {user && !showReminderModal && (
        <button
          onClick={() => setShowReminderModal(true)}
          className="fixed bottom-6 right-6 z-[9999] bg-indigo-600 text-white p-3 rounded-full shadow-xl hover:bg-indigo-700 hover:scale-105 transition-all flex items-center justify-center group"
          title="Add Note/Reminder"
        >
          <Plus size={24} />
          <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs group-hover:ml-2 transition-all duration-300 ease-in-out font-medium text-sm">
            Add Note
          </span>
        </button>
      )}

      {showReminderModal && user && (
        <ReminderModal 
          onClose={() => setShowReminderModal(false)} 
          onSave={handleSaveReminder} 
          context={`${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} - ${new Date().toLocaleDateString()}`}
        />
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom-5 fade-in duration-300 z-[10001]">
          <div className={`w-2 h-2 rounded-full ${toastMsg.startsWith('Error') ? 'bg-red-500' : 'bg-green-400'}`}></div>
          <span className="font-medium text-sm">{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
