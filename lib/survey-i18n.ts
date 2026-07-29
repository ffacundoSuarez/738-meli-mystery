import { Lang } from './types';

/** Textos de UI del formulario del postulante (ES / PT) */
const UI: Record<string, Record<Lang, string>> = {
  back: { es: 'Atrás', pt: 'Voltar' },
  next: { es: 'Siguiente', pt: 'Seguinte' },
  sendReview: { es: 'Enviar parte a revisión', pt: 'Enviar parte para revisão' },
  finish: { es: 'Finalizar', pt: 'Finalizar' },
  completeAll: { es: 'Complete todas las preguntas para continuar.', pt: 'Complete todas as perguntas para continuar.' },
  modifiedResubmit: {
    es: 'Modificó respuestas. Al continuar, la parte se enviará nuevamente a revisión.',
    pt: 'Modificou respostas. Ao continuar, a parte será enviada novamente para revisão.',
  },
  thankYouTitle: { es: '¡Muchas gracias por responder!', pt: 'Muito obrigado por responder!' },
  thankYouDesc: {
    es: 'Sus respuestas fueron registradas correctamente. Agradecemos su tiempo y colaboración.',
    pt: 'As suas respostas foram registadas corretamente. Agradecemos o seu tempo e colaboração.',
  },
  code: { es: 'Código', pt: 'Código' },
  processClosed: { es: 'Proceso cerrado', pt: 'Processo encerrado' },
  processClosedDesc: {
    es: 'El formulario fue finalizado y no acepta más respuestas.',
    pt: 'O formulário foi finalizado e não aceita mais respostas.',
  },
  endDate: { es: 'Fecha de término', pt: 'Data de término' },
  stageApproved: { es: 'aprobada', pt: 'aprovada' },
  stageInReview: { es: 'en revisión', pt: 'em revisão' },
  stageRejected: { es: 'rechazada', pt: 'rejeitada' },
  stageIs: { es: 'está', pt: 'está' },
  completeNext: { es: 'Complete la siguiente parte cuando corresponda.', pt: 'Complete a parte seguinte quando corresponder.' },
  goTo: { es: 'Ir a', pt: 'Ir para' },
  startPart: { es: 'Iniciar', pt: 'Iniciar' },
  viewAnswers: { es: 'Ver respuestas', pt: 'Ver respostas' },
  writeAnswer: { es: 'Escriba su respuesta...', pt: 'Escreva a sua resposta...' },
  uploadFiles: { es: 'Clic para subir archivos', pt: 'Clique para enviar ficheiros' },
  uploading: { es: 'Enviando...', pt: 'A enviar...' },
  fileSent: { es: 'Archivo enviado correctamente', pt: 'Ficheiro enviado com sucesso' },
  fileError: { es: 'Error al enviar el archivo', pt: 'Erro ao enviar o ficheiro' },
  loadError: { es: 'No se pudo cargar el formulario', pt: 'Não foi possível carregar o formulário' },
  saveError: { es: 'No se pudo guardar', pt: 'Não foi possível guardar' },
  sentReview: { es: 'enviada para revisión', pt: 'enviada para revisão' },
  correction: { es: 'Corrección', pt: 'Correção' },
  reviewNote: { es: 'Observación del revisor', pt: 'Observação do revisor' },
  prevCorrection: { es: 'Corrección anterior', pt: 'Correção anterior' },
  nextCorrection: { es: 'Siguiente corrección', pt: 'Correção seguinte' },
  backToSummary: { es: 'Volver al resumen', pt: 'Voltar ao resumo' },
  submitCorrections: {
    es: 'Enviar respuestas a revisión',
    pt: 'Enviar respostas para revisão',
  },
  correctionsSent: {
    es: 'Respuestas modificadas enviadas a revisión',
    pt: 'Respostas modificadas enviadas para revisão',
  },
  correctionsProgress: { es: 'Corregidas', pt: 'Corrigidas' },
};

export function t(key: keyof typeof UI, lang: Lang): string {
  return UI[key]?.[lang] ?? UI[key]?.es ?? key;
}
