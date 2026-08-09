import React, { useState, useRef } from 'react';
import { X, Download, Loader2, AlertTriangle } from 'lucide-react';
import { Student, StudentRecord } from '../types';
import { GoogleGenAI, Type } from '@google/genai';
import { toPng } from 'html-to-image';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  records: Record<string, StudentRecord>;
  sectionTitle: string;
  topic: string;
  date: string;
  defaultTeacherName?: string;
}

export default function ReportModal({ isOpen, onClose, students, records, sectionTitle, topic, date, defaultTeacherName }: ReportModalProps) {
  const [teacherName, setTeacherName] = useState(defaultTeacherName || 'Profesor(a)');
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [generatedReports, setGeneratedReports] = useState<Record<string, { academicSituation: string, recommendation: string }>>({});
  const reportRefs = useRef<Record<string, HTMLDivElement | null>>({});

  if (!isOpen) return null;

  const generateReport = async (student: Student) => {
    try {
      setGeneratingFor(student.id);
      
      const record = records[student.id];
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        throw new Error("API key no encontrada.");
      }

      const ai = new GoogleGenAI({ apiKey });

      const prompt = `
Genera un breve informe de rendimiento académico para un estudiante.
Escuela: IQ International School
Sección: ${sectionTitle}
Profesor: ${teacherName}
Estudiante: ${student.firstName} ${student.lastName}
Tema de la sesión: ${topic}

Datos de la sesión:
Participación: ${record.participation !== null ? record.participation + '/10' : 'No evaluado'}
Comportamiento: ${record.behavior !== null ? record.behavior + '/10' : 'No evaluado'}
Trabajo en clase: ${record.classwork !== null ? record.classwork + '/25' : 'No evaluado'}
Prueba/Quiz: ${record.quizStatus === 'Graded' ? record.quiz + '/100' : 'No evaluado'}
Tarea: ${record.homework}

Escribe dos párrafos cortos y profesionales en español:
1. "Situación académica": Describe el desempeño del estudiante en esta sesión específica basándote en los datos. Sé objetivo y constructivo.
2. "Recomendación para los padres": Proporciona una recomendación constructiva para que los padres ayuden al estudiante a mejorar.

Devuelve SOLO un objeto JSON con esta estructura exacta:
{
  "academicSituation": "...",
  "recommendation": "..."
}
`;

      let maxRetries = 3;
      let jsonStr = '';

      const fetchAi = async (promptMsg: string) => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          let timeoutId: NodeJS.Timeout;
          try {
            const apiPromise = ai.models.generateContent({
              model: "gemini-3.1-pro-preview",
              contents: promptMsg,
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    academicSituation: { type: Type.STRING },
                    recommendation: { type: Type.STRING }
                  },
                  required: ["academicSituation", "recommendation"]
                }
              }
            });

            const timeoutPromise = new Promise((_, reject) => {
              timeoutId = setTimeout(() => reject(new Error("Request timed out.")), 60000);
            });

            const response = await Promise.race([apiPromise, timeoutPromise]) as any;
            clearTimeout(timeoutId!);
            
            if (response.text) return response.text;
            throw new Error("Empty response");
          } catch (err: any) {
            if (timeoutId!) clearTimeout(timeoutId);
            const isTransient = err?.message?.includes("503") || err?.status === 'UNAVAILABLE' || err?.message?.includes("429") || err?.message?.includes("timed out");
            if (isTransient) {
              if (attempt === maxRetries) throw err;
              await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt - 1)));
            } else {
              throw err;
            }
          }
        }
      };

      jsonStr = await fetchAi(prompt);

      if (jsonStr) {
        const data = JSON.parse(jsonStr);
        setGeneratedReports(prev => ({
          ...prev,
          [student.id]: data
        }));
      }
    } catch (error) {
      console.error("Error generating report:", error);
      alert("Hubo un error al generar el informe. Por favor, inténtalo de nuevo.");
    } finally {
      setGeneratingFor(null);
    }
  };

  const downloadReport = async (studentId: string, studentName: string) => {
    const node = reportRefs.current[studentId];
    if (!node) return;

    try {
      const dataUrl = await toPng(node, { cacheBust: true, pixelRatio: 2 });
      const link = document.createElement('a');
      link.download = `Reporte_${studentName.replace(/\s+/g, '_')}_${date}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Error downloading image', err);
      alert("Error al descargar la imagen.");
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-rose-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Estudiantes en Riesgo</h2>
              <p className="text-sm text-slate-500">Sesión: {sectionTitle} - {date}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-rose-100 rounded-full transition-colors text-slate-500">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 border-b border-slate-100 bg-slate-50">
          <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Profesor(a) para los informes:</label>
          <input 
            type="text" 
            value={teacherName}
            onChange={(e) => setTeacherName(e.target.value)}
            className="w-full md:w-1/2 p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Ej. Juan Pérez"
          />
        </div>

        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
          {students.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              No hay estudiantes en riesgo en esta sesión.
            </div>
          ) : (
            <div className="space-y-8">
              {students.map(student => {
                const report = generatedReports[student.id];
                const isGenerating = generatingFor === student.id;

                return (
                  <div key={student.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <h3 className="font-bold text-slate-800 text-lg">{student.firstName} {student.lastName}</h3>
                      {!report ? (
                        <button 
                          onClick={() => generateReport(student)}
                          disabled={isGenerating}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-70"
                        >
                          {isGenerating ? <Loader2 size={16} className="animate-spin" /> : null}
                          {isGenerating ? 'Generando...' : 'Generar Informe AI'}
                        </button>
                      ) : (
                        <button 
                          onClick={() => downloadReport(student.id, `${student.firstName} ${student.lastName}`)}
                          className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-700 transition-colors flex items-center gap-2"
                        >
                          <Download size={16} />
                          Descargar Imagen
                        </button>
                      )}
                    </div>

                    {/* Report Preview (This is what gets converted to image) */}
                    {report && (
                      <div className="p-6 overflow-x-auto">
                        <div 
                          ref={el => reportRefs.current[student.id] = el}
                          className="bg-white p-8 border border-slate-200 rounded-lg w-[800px] mx-auto shadow-sm"
                          style={{ fontFamily: "'Inter', sans-serif" }}
                        >
                          <div className="text-center mb-8 border-b-2 border-slate-800 pb-4">
                            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Reporte de Bajo Desempeño</h1>
                            <p className="text-lg text-slate-500 mt-1 font-medium">IQ International School</p>
                          </div>

                          <div className="grid grid-cols-2 gap-6 mb-8 bg-slate-50 p-6 rounded-xl border border-slate-100">
                            <div>
                              <p className="text-sm text-slate-500 uppercase font-bold tracking-wider mb-1">Estudiante</p>
                              <p className="text-lg font-semibold text-slate-800">{student.firstName} {student.lastName}</p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-500 uppercase font-bold tracking-wider mb-1">Sección / Materia</p>
                              <p className="text-lg font-semibold text-slate-800">{sectionTitle}</p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-500 uppercase font-bold tracking-wider mb-1">Profesor(a)</p>
                              <p className="text-lg font-semibold text-slate-800">{teacherName}</p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-500 uppercase font-bold tracking-wider mb-1">Tema de la Sesión</p>
                              <p className="text-lg font-semibold text-slate-800">{topic || 'No especificado'}</p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-500 uppercase font-bold tracking-wider mb-1">Fecha</p>
                              <p className="text-lg font-semibold text-slate-800">{date}</p>
                            </div>
                          </div>

                          <div className="space-y-6">
                            <div>
                              <h3 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
                                <span className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-sm">1</span>
                                Situación Académica
                              </h3>
                              <p className="text-slate-700 leading-relaxed text-justify bg-rose-50/50 p-4 rounded-lg border border-rose-100">
                                {report.academicSituation}
                              </p>
                            </div>
                            
                            <div>
                              <h3 className="text-xl font-bold text-slate-800 mb-3 flex items-center gap-2">
                                <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm">2</span>
                                Recomendación para los Padres
                              </h3>
                              <p className="text-slate-700 leading-relaxed text-justify bg-indigo-50/50 p-4 rounded-lg border border-indigo-100">
                                {report.recommendation}
                              </p>
                            </div>
                          </div>

                          <div className="mt-12 pt-6 border-t border-slate-200 text-center text-sm text-slate-400">
                            Generado automáticamente por el Sistema de Seguimiento Diario - IQ International School
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
