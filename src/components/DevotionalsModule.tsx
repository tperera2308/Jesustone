import React, { useEffect, useState } from 'react';
import {
  AccentColorId,
  BandMember,
  Devotional,
  StudySession,
  StudyVerse,
  UserRole,
} from '../types';
import { getAccentClasses } from './IdentityModal';
import {
  BookOpen,
  CheckCircle2,
  Circle,
  Layers,
  MessageSquare,
  Plus,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react';

interface DevotionalsModuleProps {
  devotionals: Devotional[];
  members: BandMember[];
  activeMemberId: string;
  userRole: UserRole;
  accentColor: AccentColorId;
  initialDevotionalId?: string | null;
  onToggleCompleteDevotional: (devId: string) => void;
  onToggleCompleteSession: (devId: string, sessionId: string) => void;
  onAddComment: (devId: string, text: string) => void;
  onCreateDevotional: (
    dev: Omit<Devotional, 'id' | 'completedByMemberIds' | 'comments'>
  ) => void;
  onDeleteDevotional?: (devId: string) => void;
}

interface DraftSession {
  id: string;
  title: string;
  content: string;
  verses: StudyVerse[];
}

export const DevotionalsModule: React.FC<DevotionalsModuleProps> = ({
  devotionals,
  members,
  activeMemberId,
  userRole,
  accentColor,
  initialDevotionalId,
  onToggleCompleteDevotional,
  onToggleCompleteSession,
  onAddComment,
  onCreateDevotional,
  onDeleteDevotional,
}) => {
  const accent = getAccentClasses(accentColor);
  const [selectedDevId, setSelectedDevId] = useState<string>(
    initialDevotionalId || devotionals[0]?.id || ''
  );
  const [commentInput, setCommentInput] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [confirmDeleteDevId, setConfirmDeleteDevId] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (initialDevotionalId && devotionals.some((d) => d.id === initialDevotionalId)) {
      setSelectedDevId(initialDevotionalId);
    }
  }, [initialDevotionalId, devotionals]);

  // New Study (Multi-Session) Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] =
    useState<Devotional['category']>('Estudio Bíblico');
  const [draftSessions, setDraftSessions] = useState<DraftSession[]>([
    {
      id: 'sess-1',
      title: 'Sesión 1: Fundamento Bíblico',
      content: '',
      verses: [{ id: 'v-1', reference: '', text: '' }],
    },
  ]);

  const activeMember =
    members.find((m) => m.id === activeMemberId) || members[0];

  const activeDev =
    devotionals.find((d) => d.id === selectedDevId) || devotionals[0];

  // Draft Session Helpers
  const handleAddDraftSession = () => {
    const nextNum = draftSessions.length + 1;
    setDraftSessions((prev) => [
      ...prev,
      {
        id: `sess-${Date.now()}-${nextNum}`,
        title: `Sesión ${nextNum}: `,
        content: '',
        verses: [{ id: `v-${Date.now()}`, reference: '', text: '' }],
      },
    ]);
  };

  const handleRemoveDraftSession = (sessId: string) => {
    if (draftSessions.length <= 1) return;
    setDraftSessions((prev) => prev.filter((s) => s.id !== sessId));
  };

  const handleUpdateDraftSessionField = (
    sessId: string,
    field: 'title' | 'content',
    value: string
  ) => {
    setDraftSessions((prev) =>
      prev.map((s) => (s.id === sessId ? { ...s, [field]: value } : s))
    );
  };

  const handleAddVerseToSession = (sessId: string) => {
    setDraftSessions((prev) =>
      prev.map((s) =>
        s.id === sessId
          ? {
              ...s,
              verses: [
                ...s.verses,
                {
                  id: `v-${Date.now()}-${s.verses.length + 1}`,
                  reference: '',
                  text: '',
                },
              ],
            }
          : s
      )
    );
  };

  const handleRemoveVerseFromSession = (sessId: string, verseId: string) => {
    setDraftSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessId) return s;
        return {
          ...s,
          verses: s.verses.filter((v) => v.id !== verseId),
        };
      })
    );
  };

  const handleUpdateVerseField = (
    sessId: string,
    verseId: string,
    field: 'reference' | 'text',
    value: string
  ) => {
    setDraftSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessId) return s;
        return {
          ...s,
          verses: s.verses.map((v) =>
            v.id === verseId ? { ...v, [field]: value } : v
          ),
        };
      })
    );
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const builtSessions: StudySession[] = draftSessions.map((ds, idx) => ({
      id: `session-${Date.now()}-${idx + 1}`,
      sessionNumber: idx + 1,
      title: ds.title.trim() || `Sesión ${idx + 1}`,
      content: ds.content.trim() || 'Contenido de estudio para la sesión.',
      verses: ds.verses
        .filter((v) => v.reference.trim() || v.text.trim())
        .map((v, vIdx) => ({
          id: `verse-${Date.now()}-${idx}-${vIdx}`,
          reference: v.reference.trim() || 'Cita Bíblica',
          text: v.text.trim(),
        })),
      completedByMemberIds: [],
    }));

    const todayStr = new Date().toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    onCreateDevotional({
      title: newTitle.trim(),
      description:
        newDescription.trim() ||
        `Estudio de ${builtSessions.length} ${
          builtSessions.length === 1 ? 'sesión' : 'sesiones'
        } para el grupo.`,
      authorName: activeMember?.name || 'Líder',
      authorRole: userRole === 'leader' ? 'Líder / Admin' : 'Miembro',
      date: todayStr,
      category: newCategory,
      sessions: builtSessions,
    });

    setNewTitle('');
    setNewDescription('');
    setDraftSessions([
      {
        id: 'sess-1',
        title: 'Sesión 1: Fundamento Bíblico',
        content: '',
        verses: [{ id: 'v-1', reference: '', text: '' }],
      },
    ]);
    setShowCreateModal(false);
  };

  const handleSendComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDev || !commentInput.trim()) return;
    onAddComment(activeDev.id, commentInput.trim());
    setCommentInput('');
  };

  return (
    <div className="space-y-6">
      {/* Cabecera compacta de Sección */}
      <div className="flex items-center justify-between gap-2 bg-white dark:bg-slate-900 px-4 py-3 rounded-2xl border border-slate-300/80 dark:border-slate-700/80 shadow-xs">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen className={`w-4 h-4 shrink-0 ${accent.textClass}`} />
          <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
            Estudios Bíblicos ({devotionals.length})
          </h2>
        </div>

        {userRole === 'leader' && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className={`min-h-[40px] flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-colors whitespace-nowrap shrink-0 ${accent.bgClass}`}
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Nuevo Estudio</span>
          </button>
        )}
      </div>

      {/* ESTADO VACÍO (SIN ESTUDIOS DE BASE) */}
      {devotionals.length === 0 || !activeDev ? (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 sm:p-12 text-center space-y-4">
          <div
            className={`w-16 h-16 rounded-3xl flex items-center justify-center mx-auto ${accent.softBgClass}`}
          >
            <BookOpen className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              Aún no hay estudios publicados
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              {userRole === 'leader'
                ? 'Como Líder / Admin puedes crear estudios desde una hasta varias sesiones, agregar los versículos de cada sesión y llevar el control de realizado del grupo.'
                : 'Cuando el Líder / Admin del grupo publique un nuevo estudio, aparecerá aquí con sus sesiones, versículos y casillas de realizado.'}
            </p>
          </div>
          {userRole === 'leader' && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className={`min-h-[52px] px-6 py-3 rounded-2xl text-sm font-bold inline-flex items-center gap-2 shadow-lg ${accent.bgClass}`}
              >
                <Plus className="w-5 h-5" />
                <span>Crear Primer Estudio</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Lista Lateral de Estudios */}
          <div className="lg:col-span-4 space-y-3">
            {devotionals.map((dev) => {
              const isSelected = dev.id === activeDev.id;
              const totalSessions = dev.sessions.length;
              const completedSessionsCount = dev.sessions.filter((s) =>
                s.completedByMemberIds.includes(activeMemberId)
              ).length;
              const isStudyDone =
                dev.completedByMemberIds.includes(activeMemberId) ||
                (totalSessions > 0 && completedSessionsCount === totalSessions);

              return (
                <button
                  key={dev.id}
                  type="button"
                  onClick={() => setSelectedDevId(dev.id)}
                  className={`w-full text-left p-5 rounded-3xl border transition-all ${
                    isSelected
                      ? `bg-white dark:bg-slate-900 ${accent.borderClass} ring-2 ring-amber-500/20 shadow-sm`
                      : 'bg-white/90 dark:bg-slate-900/70 border-slate-300/80 dark:border-slate-700/80 hover:bg-white dark:hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300 mb-1.5 font-medium">
                    <span className={`font-bold ${accent.textClass}`}>
                      {dev.category}
                    </span>
                    <span className="font-mono">{dev.date}</span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug mb-1">
                    {dev.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 line-clamp-2 mb-3">
                    {dev.description}
                  </p>
                  <div className="flex items-center justify-between text-xs pt-2.5 border-t border-slate-200/80 dark:border-slate-800/80 text-slate-600 dark:text-slate-300 font-mono tabular-nums font-semibold">
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-4 h-4" />
                      {completedSessionsCount}/{totalSessions}{' '}
                      {totalSessions === 1 ? 'sesión' : 'sesiones'}
                    </span>
                    <span
                      className={`font-sans font-bold flex items-center gap-1 ${
                        isStudyDone
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-500 dark:text-slate-300'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {isStudyDone ? 'Realizado' : 'En curso'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Lector del Estudio y sus Sesiones */}
          <div className="lg:col-span-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-7 space-y-6">
            {(() => {
              const totalSessions = activeDev.sessions.length;
              const myCompletedSessions = activeDev.sessions.filter((s) =>
                s.completedByMemberIds.includes(activeMemberId)
              ).length;
              const isAllCompletedByMe =
                activeDev.completedByMemberIds.includes(activeMemberId) ||
                (totalSessions > 0 && myCompletedSessions === totalSessions);
              const progressPct =
                totalSessions > 0
                  ? Math.round((myCompletedSessions / totalSessions) * 100)
                  : isAllCompletedByMe
                  ? 100
                  : 0;

              return (
                <>
                  {/* Encabezado del Estudio */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className={`font-bold ${accent.textClass}`}>
                          {activeDev.category}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{activeDev.date}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          Publicado por {activeDev.authorName} ({activeDev.authorRole})
                        </span>
                      </div>
                      <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white leading-tight">
                        {activeDev.title}
                      </h2>
                      {activeDev.description && (
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                          {activeDev.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggleCompleteDevotional(activeDev.id)}
                        className={`min-h-[44px] px-4 py-2 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all ${
                          isAllCompletedByMe
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          {isAllCompletedByMe
                            ? 'Estudio Realizado'
                            : 'Marcar Estudio Realizado'}
                        </span>
                      </button>

                      {userRole === 'leader' && onDeleteDevotional && (
                        confirmDeleteDevId === activeDev.id ? (
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl bg-rose-500/10 border border-rose-500/30">
                            <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                              ¿Eliminar para todos?
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteDevotional(activeDev.id);
                                setConfirmDeleteDevId(null);
                              }}
                              className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold"
                            >
                              Sí
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteDevId(null)}
                              className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-bold"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteDevId(activeDev.id)}
                            className="min-h-[44px] px-3 py-2 rounded-2xl border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                            title="Eliminar estudio"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Barra de Progreso de Sesiones Realizadas */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        Tu avance en las sesiones de este estudio
                      </span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {myCompletedSessions} de {totalSessions}{' '}
                        {totalSessions === 1 ? 'sesión realizada' : 'sesiones realizadas'} ({progressPct}%)
                      </span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Lista de Sesiones del Estudio con Versículos y Check de Realizado */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Sesiones del Estudio ({activeDev.sessions.length})
                    </h3>

                    {activeDev.sessions.map((session) => {
                      const sessionDone =
                        session.completedByMemberIds.includes(activeMemberId);
                      return (
                        <div
                          key={session.id}
                          className={`rounded-3xl border p-5 space-y-4 transition-all ${
                            sessionDone
                              ? 'bg-emerald-500/5 border-emerald-500/30'
                              : 'bg-slate-50/70 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-800">
                            <div>
                              <span
                                className={`text-xs font-bold uppercase tracking-wider ${accent.textClass}`}
                              >
                                Sesión {session.sessionNumber}
                              </span>
                              <h4 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                                {session.title}
                              </h4>
                            </div>

                            {/* Check de Realizado por Sesión */}
                            <button
                              type="button"
                              onClick={() =>
                                onToggleCompleteSession(activeDev.id, session.id)
                              }
                              className={`min-h-[44px] px-4 py-2 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all self-start sm:self-center shrink-0 ${
                                sessionDone
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-emerald-500'
                              }`}
                            >
                              {sessionDone ? (
                                <>
                                  <CheckCircle2 className="w-4 h-4" />
                                  <span>Sesión Realizada</span>
                                </>
                              ) : (
                                <>
                                  <Circle className="w-4 h-4 text-slate-400" />
                                  <span>Marcar Realizado</span>
                                </>
                              )}
                            </button>
                          </div>

                          {/* Versículos Bíblicos de la Sesión */}
                          {session.verses.length > 0 && (
                            <div className="space-y-2.5">
                              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                <BookOpen className={`w-3.5 h-3.5 ${accent.textClass}`} />
                                Versículos de esta sesión:
                              </p>
                              <div className="grid grid-cols-1 gap-2.5">
                                {session.verses.map((verse) => (
                                  <div
                                    key={verse.id}
                                    className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1"
                                  >
                                    <p
                                      className={`text-xs font-bold ${accent.textClass}`}
                                    >
                                      {verse.reference}
                                    </p>
                                    {verse.text && (
                                      <p className="text-xs sm:text-sm italic text-slate-700 dark:text-slate-200 leading-relaxed">
                                        «{verse.text}»
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Contenido / Desarrollo de la Sesión */}
                          <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                            {session.content}
                          </div>

                          <div className="pt-2 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 font-mono font-medium">
                            <span>
                              Completada por {session.completedByMemberIds.length} de{' '}
                              {members.length} miembros
                            </span>
                            {sessionDone && (
                              <span className="text-emerald-600 dark:text-emerald-400 font-sans font-bold">
                                ✓ Marcada como realizada
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Resumen General del Equipo */}
                  <div className="flex items-center gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                    <Users className="w-5 h-5 text-slate-400 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        Avance del Grupo
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {activeDev.completedByMemberIds.length} de {members.length}{' '}
                        integrantes han completado todo el estudio
                      </p>
                    </div>
                  </div>

                  {/* Comentarios y Notas del Grupo */}
                  <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-slate-400" />
                      Comentarios del Estudio ({activeDev.comments.length})
                    </h3>

                    {activeDev.comments.length > 0 && (
                      <div className="space-y-3">
                        {activeDev.comments.map((c) => (
                          <div
                            key={c.id}
                            className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-xs sm:text-sm"
                          >
                            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                              <span>
                                <strong className="text-slate-900 dark:text-white">
                                  {c.authorName}
                                </strong>{' '}
                                · {c.authorRole}
                              </span>
                              <span>{c.createdAt}</span>
                            </div>
                            <p className="text-slate-700 dark:text-slate-300">
                              {c.text.split(/(@[\w._-]+)/g).map((part, idx) =>
                                part.startsWith('@') ? (
                                  <span
                                    key={idx}
                                    className="px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 font-mono font-bold text-xs"
                                  >
                                    {part}
                                  </span>
                                ) : (
                                  <React.Fragment key={idx}>{part}</React.Fragment>
                                )
                              )}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Barra rápida para etiquetar miembros en comentarios */}
                    {members.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-semibold text-slate-400">
                          Etiquetar:
                        </span>
                        {members.map((m) => {
                          const handle =
                            m.username ||
                            m.name.toLowerCase().replace(/\s+/g, '_');
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() =>
                                setCommentInput(
                                  (prev) =>
                                    `${prev}${
                                      prev.endsWith(' ') || !prev ? '' : ' '
                                    }@${handle} `
                                )
                              }
                              className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-amber-500/20 text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300"
                            >
                              @{handle}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <form
                      onSubmit={handleSendComment}
                      className="flex items-center gap-2"
                    >
                      <input
                        type="text"
                        value={commentInput}
                        onChange={(e) => setCommentInput(e.target.value)}
                        placeholder={`Escribe un comentario o etiqueta con @usuario como ${activeMember?.name}...`}
                        className="flex-1 min-h-[46px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none"
                      />
                      <button
                        type="submit"
                        className={`min-h-[46px] px-5 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 ${accent.bgClass}`}
                      >
                        <Send className="w-3.5 h-3.5" />
                        Comentar
                      </button>
                    </form>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* MODAL PARA LÍDER / ADMIN: CREAR ESTUDIO DE 1 O VARIAS SESIONES CON VERSÍCULOS */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-3xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Nuevo Estudio para el Grupo (1 o Varias Sesiones)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Agrega una o múltiples sesiones, incluye versículos bíblicos y habilita checks de realizado
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-5 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Título General del Estudio *
                  </label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Ej. El Ministerio de Alabanza en el Tabernáculo"
                    className="w-full min-h-[46px] px-3.5 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Categoría
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) =>
                      setNewCategory(e.target.value as Devotional['category'])
                    }
                    className="w-full min-h-[46px] px-3.5 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="Estudio Bíblico">Estudio Bíblico</option>
                    <option value="Corazón de Adorador">Corazón de Adorador</option>
                    <option value="Excelencia Musical">Excelencia Musical</option>
                    <option value="Unidad en el Espíritu">Unidad en el Espíritu</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Descripción u Objetivo del Estudio
                </label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Ej. Estudio práctico para nuestro equipo antes de los servicios del mes"
                  className="w-full min-h-[46px] px-3.5 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                />
              </div>

              {/* CONSTRUCTOR DE SESIONES (1 A VARIAS SESIONES) */}
              <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Sesiones del Estudio ({draftSessions.length})
                  </label>
                  <button
                    type="button"
                    onClick={handleAddDraftSession}
                    className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${accent.bgClass}`}
                  >
                    <Plus className="w-4 h-4" />
                    <span>Agregar Otra Sesión</span>
                  </button>
                </div>

                {draftSessions.map((sess, sIdx) => (
                  <div
                    key={sess.id}
                    className="p-4 sm:p-5 rounded-3xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-xs font-bold uppercase tracking-wider ${accent.textClass}`}
                      >
                        Sesión #{sIdx + 1}
                      </span>
                      {draftSessions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveDraftSession(sess.id)}
                          className="text-xs font-bold text-rose-500 hover:text-rose-600 flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Quitar sesión
                        </button>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Título de la Sesión {sIdx + 1} *
                      </label>
                      <input
                        type="text"
                        required
                        value={sess.title}
                        onChange={(e) =>
                          handleUpdateDraftSessionField(
                            sess.id,
                            'title',
                            e.target.value
                          )
                        }
                        placeholder={`Ej. Sesión ${sIdx + 1}: Preparando el corazón`}
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
                      />
                    </div>

                    {/* Versículos de esta sesión */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5 text-amber-500" />
                          Versículos Bíblicos de la Sesión
                        </label>
                        <button
                          type="button"
                          onClick={() => handleAddVerseToSession(sess.id)}
                          className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Agregar versículo
                        </button>
                      </div>

                      {sess.verses.map((v, vIdx) => (
                        <div
                          key={v.id}
                          className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                        >
                          <div className="sm:col-span-4">
                            <input
                              type="text"
                              value={v.reference}
                              onChange={(e) =>
                                handleUpdateVerseField(
                                  sess.id,
                                  v.id,
                                  'reference',
                                  e.target.value
                                )
                              }
                              placeholder={`Cita ${vIdx + 1} (ej. Salmos 33:3)`}
                              className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white"
                            />
                          </div>
                          <div className="sm:col-span-7">
                            <input
                              type="text"
                              value={v.text}
                              onChange={(e) =>
                                handleUpdateVerseField(
                                  sess.id,
                                  v.id,
                                  'text',
                                  e.target.value
                                )
                              }
                              placeholder="Texto del versículo bíblico..."
                              className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                            />
                          </div>
                          <div className="sm:col-span-1 flex justify-end">
                            {sess.verses.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveVerseFromSession(sess.id, v.id)
                                }
                                className="min-h-[40px] px-2 text-slate-400 hover:text-rose-500"
                                title="Eliminar versículo"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Desarrollo / Enseñanza de la Sesión {sIdx + 1} *
                      </label>
                      <textarea
                        rows={3}
                        required
                        value={sess.content}
                        onChange={(e) =>
                          handleUpdateDraftSessionField(
                            sess.id,
                            'content',
                            e.target.value
                          )
                        }
                        placeholder="Escribe los puntos clave, reflexión o notas de estudio de esta sesión..."
                        className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="min-h-[48px] px-4 py-2 rounded-2xl text-xs font-bold text-slate-500"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`min-h-[48px] px-6 py-2.5 rounded-2xl text-xs sm:text-sm font-bold shadow-md ${accent.bgClass}`}
                >
                  Publicar Estudio ({draftSessions.length}{' '}
                  {draftSessions.length === 1 ? 'Sesión' : 'Sesiones'})
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
